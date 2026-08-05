import type { PeerId, DcEnvelope, IceCandidateInit } from 'shared';
import type { Transport } from './types';
import { SignalingClient } from './SignalingClient';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// 二进制分块传输(仿 LocalSend):16KB/块,bufferedAmount 超 1MB 让出事件循环
const CHUNK_SIZE = 16 * 1024;
const MAX_BUFFERED_AMOUNT = 1 * 1024 * 1024;
const CHUNK_HEADER = 12; // uint32 transferId + uint32 seq + uint32 total
const CHUNK_GC_INTERVAL = 30_000; // 30s 清理超时缓冲
const CHUNK_GC_MAX_AGE = 60_000;  // 60s 未完成的传输视为废弃

// 生产环境静默,开发期保留 rtc 调试日志
const dbg = import.meta.env.DEV;
function log(...a: unknown[]) { if (dbg) console.log('[rtc]', ...a); }

interface PeerConn {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  pendingIce: IceCandidateInit[];
  remoteDescSet: boolean;
}

/** 二进制分块接收缓冲:按 transferId 收齐后组装 Blob。 */
interface ChunkBuf {
  total: number;
  parts: ArrayBuffer[];
  received: number;
  ts: number; // 最近更新时间,用于 GC
}

/**
 * WebRTC 传输实现。每个远端 peer 一个 RTCPeerConnection + DataChannel。
 * 发起方确定性规则:self < peer 的一方发起,避免双方同时 offer 的 glare。
 */
export class WebRTCTransport implements Transport {
  readonly self: PeerId;
  private sig: SignalingClient;
  private peers = new Map<PeerId, PeerConn>();
  private peerCbs: Array<(peers: PeerId[]) => void> = [];
  private msgCbs: Array<(env: DcEnvelope) => void> = [];
  private sigStateCbs: Array<(ready: boolean) => void> = [];
  private stateCbs: Array<(peer: PeerId, state: 'connecting' | 'open' | 'closed') => void> = [];
  private knownPeers: PeerId[] = [];
  // 每个 peer 的重连退避计数(成功 open 后清零),用于断线后指数退避重连
  private reconnectDelay = new Map<PeerId, number>();
  // 二进制分块缓冲:peer → (transferId → ChunkBuf)
  private chunkBufs = new Map<PeerId, Map<number, ChunkBuf>>();
  private blobCbs: Array<(from: PeerId, transferId: number, blob: Blob) => void> = [];
  private chunkGcTimer: ReturnType<typeof setInterval> | null = null;

  constructor(self: PeerId, signalingUrl: string) {
    this.self = self;
    this.sig = new SignalingClient(self, signalingUrl, {
      onOpen: () => this.sigStateCbs.forEach((cb) => cb(true)),
      onClose: () => this.sigStateCbs.forEach((cb) => cb(false)),
      onPeers: (peers) => this.handlePeers(peers),
      onSdp: (from, sdp) => { void this.handleSdp(from, sdp); },
      onIce: (from, candidate) => { void this.handleIce(from, candidate); },
    });
    // 定时清理超时的分块缓冲,防对端崩溃未发完导致内存泄漏
    this.chunkGcTimer = setInterval(() => this.gcChunkBufs(), CHUNK_GC_INTERVAL);
  }

  async connect() {
    this.sig.connect();
  }

  disconnect() {
    if (this.chunkGcTimer) { clearInterval(this.chunkGcTimer); this.chunkGcTimer = null; }
    for (const p of this.peers.values()) {
      try { p.pc.close(); } catch { /* noop */ }
    }
    this.peers.clear();
    this.chunkBufs.clear();
    this.sig.close();
  }

  onPeersChange(cb: (peers: PeerId[]) => void) {
    this.peerCbs.push(cb);
    cb(this.knownPeers);
  }

  onMessage(cb: (env: DcEnvelope) => void) {
    this.msgCbs.push(cb);
  }

  onBlob(cb: (from: PeerId, transferId: number, blob: Blob) => void) {
    this.blobCbs.push(cb);
  }

  onSignalingState(cb: (ready: boolean) => void) {
    this.sigStateCbs.push(cb);
  }

  onPeerState(cb: (peer: PeerId, state: 'connecting' | 'open' | 'closed') => void) {
    this.stateCbs.push(cb);
  }

  private emitState(peer: PeerId, state: 'connecting' | 'open' | 'closed') {
    for (const cb of this.stateCbs) cb(peer, state);
  }

  async send(to: PeerId, type: DcEnvelope['type'], payload: unknown) {
    const p = this.peers.get(to);
    if (!p?.dc || p.dc.readyState !== 'open') {
      throw new Error(`datachannel not open: ${to}`);
    }
    const env: DcEnvelope = { from: this.self, type, payload };
    p.dc.send(JSON.stringify(env));
  }

  /**
   * 二进制分块发送:帧头 [transferId 4B][seq 4B][total 4B] + data 16KB。
   * bufferedAmount 超 1MB 时让出事件循环,避免内存堆积。仿 LocalSend。
   */
  async sendBlob(to: PeerId, transferId: number, bytes: Uint8Array) {
    const p = this.peers.get(to);
    if (!p?.dc || p.dc.readyState !== 'open') {
      throw new Error(`datachannel not open: ${to}`);
    }
    const total = Math.ceil(bytes.length / CHUNK_SIZE);
    for (let i = 0; i < total; i++) {
      const offset = i * CHUNK_SIZE;
      const end = Math.min(offset + CHUNK_SIZE, bytes.length);
      const frame = new ArrayBuffer(CHUNK_HEADER + (end - offset));
      const dv = new DataView(frame);
      dv.setUint32(0, transferId);
      dv.setUint32(4, i);
      dv.setUint32(8, total);
      new Uint8Array(frame, CHUNK_HEADER).set(bytes.subarray(offset, end));
      p.dc.send(frame);
      // 背压:缓冲超阈值时让出,等缓冲排空
      if (p.dc.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        await new Promise<void>((r) => setTimeout(r, 10));
      }
    }
  }

  private shouldInitiate(peer: PeerId) {
    return this.self < peer;
  }

  private ensurePeer(id: PeerId): PeerConn {
    let p = this.peers.get(id);
    if (p) return p;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    p = { pc, dc: null, pendingIce: [], remoteDescSet: false };
    this.peers.set(id, p);
    pc.onicecandidate = (e) => {
      this.sig.sendIce(id, e.candidate ? (e.candidate.toJSON() as IceCandidateInit) : null);
    };
    pc.ondatachannel = (e) => {
      p!.dc = e.channel;
      this.wireDc(id, e.channel);
    };
    pc.onconnectionstatechange = () => {
      log(id, 'conn:', pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.emitState(id, 'closed');
      }
    };
    this.emitState(id, 'connecting');
    return p;
  }

  private wireDc(peer: PeerId, dc: RTCDataChannel) {
    dc.onopen = () => {
      log(peer, 'dc open');
      // 连接成功,清零重连退避
      this.reconnectDelay.delete(peer);
      this.emitState(peer, 'open');
    };
    dc.onclose = () => {
      log(peer, 'dc close');
      this.chunkBufs.delete(peer); // 清残留分块缓冲
      this.emitState(peer, 'closed');
      // 通道异常断开:若 peer 仍在 presence,清掉旧连接并按角色重新发起,避免永久断线
      this.reconnectPeer(peer);
    };
    dc.onmessage = (e) => {
      // string → JSON 控制消息;ArrayBuffer → 二进制分块
      if (typeof e.data === 'string') {
        try {
          const env = JSON.parse(e.data) as DcEnvelope;
          this.msgCbs.forEach((cb) => cb(env));
        } catch { /* noop */ }
        return;
      }
      this.handleChunk(peer, e.data as ArrayBuffer);
    };
  }

  /** 处理二进制分块帧:按 transferId 缓冲,收齐后组装 Blob 回调。 */
  private handleChunk(peer: PeerId, buf: ArrayBuffer) {
    if (buf.byteLength < CHUNK_HEADER) return;
    const dv = new DataView(buf);
    const transferId = dv.getUint32(0);
    const seq = dv.getUint32(4);
    const total = dv.getUint32(8);
    let m = this.chunkBufs.get(peer);
    if (!m) { m = new Map(); this.chunkBufs.set(peer, m); }
    let cb = m.get(transferId);
    if (!cb) {
      cb = { total, parts: new Array(total), received: 0, ts: Date.now() };
      m.set(transferId, cb);
    }
    cb.ts = Date.now();
    cb.parts[seq] = buf.slice(CHUNK_HEADER);
    cb.received++;
    if (cb.received >= cb.total) {
      m.delete(transferId);
      const blob = new Blob(cb.parts, { type: 'application/octet-stream' });
      this.blobCbs.forEach((fn) => fn(peer, transferId, blob));
    }
  }

  /** GC 超时的分块缓冲,防对端崩溃未发完导致内存泄漏。 */
  private gcChunkBufs() {
    const now = Date.now();
    for (const [peer, m] of this.chunkBufs) {
      for (const [id, buf] of m) {
        if (now - buf.ts > CHUNK_GC_MAX_AGE) m.delete(id);
      }
      if (m.size === 0) this.chunkBufs.delete(peer);
    }
  }

  /**
   * 断线重连:立即清掉旧 PeerConn(确保后续新 offer 落到全新 PC),
   * 仅由发起方(self < peer)在指数退避后重新 initiate;非发起方等待对端新 offer。
   * peer 已离线(presence 移除)时不重连,由 handlePeers 负责清理。
   */
  private reconnectPeer(peer: PeerId) {
    const existing = this.peers.get(peer);
    if (existing) {
      try { existing.pc.close(); } catch { /* noop */ }
      this.peers.delete(peer);
    }
    if (!this.knownPeers.includes(peer)) return; // 已离线,放弃
    if (!this.shouldInitiate(peer)) {
      this.emitState(peer, 'connecting'); // 非发起方等待新 offer
      return;
    }
    const attempt = (this.reconnectDelay.get(peer) ?? 0) + 1;
    this.reconnectDelay.set(peer, attempt);
    const delay = Math.min(1000 * 2 ** (attempt - 1), 30000); // 指数退避,上限 30s
    log(peer, 'reconnect in', delay, 'ms (attempt', attempt, ')');
    this.emitState(peer, 'connecting');
    setTimeout(() => {
      if (!this.knownPeers.includes(peer) || this.peers.has(peer)) return;
      void this.initiate(peer);
    }, delay);
  }

  /** 发起方:createDataChannel + offer。handlePeers 与 reconnectPeer 复用。 */
  private async initiate(peer: PeerId) {
    const p = this.ensurePeer(peer);
    p.dc = p.pc.createDataChannel('main', { ordered: true });
    this.wireDc(peer, p.dc);
    log('initiate offer ->', peer);
    try {
      const offer = await p.pc.createOffer();
      await p.pc.setLocalDescription(offer);
      this.sig.sendSdp(peer, { type: 'offer', sdp: p.pc.localDescription!.sdp });
    } catch { /* noop */ }
  }

  private emitPeers() {
    for (const cb of this.peerCbs) cb(this.knownPeers);
  }

  private async handlePeers(peers: PeerId[]) {
    const next = peers.filter((p) => p !== this.self);
    this.knownPeers = next;
    this.emitPeers();

    // 新 peer:若该我发起,建连
    for (const peer of next) {
      if (this.peers.has(peer)) continue;
      if (!this.shouldInitiate(peer)) continue;
      void this.initiate(peer);
    }

    // 离线 peer:清理 PC 与重连退避计数
    for (const id of [...this.peers.keys()]) {
      if (!next.includes(id)) {
        try { this.peers.get(id)!.pc.close(); } catch { /* noop */ }
        this.peers.delete(id);
        this.reconnectDelay.delete(id);
      }
    }
  }

  private async handleSdp(from: PeerId, sdp: { type: 'offer' | 'answer'; sdp: string }) {
    const p = this.ensurePeer(from);
    try {
      await p.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      p.remoteDescSet = true;
      // flush 早到的 ICE 候选
      for (const c of p.pendingIce) {
        try { await p.pc.addIceCandidate(c); } catch { /* noop */ }
      }
      p.pendingIce = [];
      if (sdp.type === 'offer') {
        const answer = await p.pc.createAnswer();
        await p.pc.setLocalDescription(answer);
        this.sig.sendSdp(from, { type: 'answer', sdp: p.pc.localDescription!.sdp });
      }
    } catch { /* noop */ }
  }

  private async handleIce(from: PeerId, candidate: IceCandidateInit | null) {
    if (candidate === null) return; // gathering done
    const p = this.peers.get(from);
    if (!p) return;
    if (!p.remoteDescSet) {
      p.pendingIce.push(candidate);
      return;
    }
    try { await p.pc.addIceCandidate(candidate); } catch { /* noop */ }
  }
}
