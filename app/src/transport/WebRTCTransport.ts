import type { PeerId, DcEnvelope, IceCandidateInit } from 'shared';
import type { Transport } from './types';
import { SignalingClient } from './SignalingClient';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

interface PeerConn {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  pendingIce: IceCandidateInit[];
  remoteDescSet: boolean;
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

  constructor(self: PeerId, signalingUrl: string) {
    this.self = self;
    this.sig = new SignalingClient(self, signalingUrl, {
      onOpen: () => this.sigStateCbs.forEach((cb) => cb(true)),
      onClose: () => this.sigStateCbs.forEach((cb) => cb(false)),
      onPeers: (peers) => this.handlePeers(peers),
      onSdp: (from, sdp) => { void this.handleSdp(from, sdp); },
      onIce: (from, candidate) => { void this.handleIce(from, candidate); },
    });
  }

  async connect() {
    this.sig.connect();
  }

  disconnect() {
    for (const p of this.peers.values()) {
      try { p.pc.close(); } catch { /* noop */ }
    }
    this.peers.clear();
    this.sig.close();
  }

  onPeersChange(cb: (peers: PeerId[]) => void) {
    this.peerCbs.push(cb);
    cb(this.knownPeers);
  }

  onMessage(cb: (env: DcEnvelope) => void) {
    this.msgCbs.push(cb);
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
      console.log('[rtc]', id, 'conn:', pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.emitState(id, 'closed');
      }
    };
    this.emitState(id, 'connecting');
    return p;
  }

  private wireDc(peer: PeerId, dc: RTCDataChannel) {
    dc.onopen = () => {
      console.log('[rtc]', peer, 'dc open');
      this.emitState(peer, 'open');
    };
    dc.onclose = () => this.emitState(peer, 'closed');
    dc.onmessage = (e) => {
      try {
        const env = JSON.parse(e.data) as DcEnvelope;
        this.msgCbs.forEach((cb) => cb(env));
      } catch { /* noop */ }
    };
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
      const p = this.ensurePeer(peer);
      p.dc = p.pc.createDataChannel('main', { ordered: true });
      this.wireDc(peer, p.dc);
      console.log('[rtc] initiate offer ->', peer);
      try {
        const offer = await p.pc.createOffer();
        await p.pc.setLocalDescription(offer);
        this.sig.sendSdp(peer, { type: 'offer', sdp: p.pc.localDescription!.sdp });
      } catch { /* noop */ }
    }

    // 离线 peer:清理
    for (const id of [...this.peers.keys()]) {
      if (!next.includes(id)) {
        try { this.peers.get(id)!.pc.close(); } catch { /* noop */ }
        this.peers.delete(id);
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
