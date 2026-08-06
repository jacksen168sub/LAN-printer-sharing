import { reactive, readonly } from 'vue';
import type { DcEnvelope, PeerContent, PeerId } from 'shared';
import { WebRTCTransport } from '../transport/WebRTCTransport';
import { identity, getOwnContent } from './identity';

const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:8787';
// ws/wss → http/https,用于 fetch /ip(CF 返回的公网 IP 即分房依据,权威)
const SIGNALING_HTTP = SIGNALING_URL.replace(/^ws/, 'http');
const ROOM_KEY = 'lps.room';

// 消息缓冲上限:防止长会话内存只增不减
const MAX_MESSAGES = 100;

/** 手动房间码持久化(空 = 用服务端按 IP 自动分配的码)。 */
function loadManualRoom(): string | null {
  return localStorage.getItem(ROOM_KEY) || null;
}
export function getManualRoom(): string | null {
  return loadManualRoom();
}

/** 按 manual room 拼接信令 URL:有手动码则带 ?room=CODE,否则裸 URL(服务端自动分房)。 */
function buildSignalingUrl(): string {
  const m = loadManualRoom();
  if (!m) return SIGNALING_URL;
  const sep = SIGNALING_URL.includes('?') ? '&' : '?';
  return SIGNALING_URL + sep + 'room=' + encodeURIComponent(m);
}

interface NetworkState {
  peers: PeerId[];
  signalingReady: boolean;
  messages: DcEnvelope[];
  peerStates: Record<string, 'connecting' | 'open' | 'closed'>;
  peerContents: Record<string, PeerContent>;
  peerLatencies: Record<string, number>;
  peerImageProgress: Record<string, { received: number; total: number }>;
  myIp: string | null;
  myAutoCode: string | null;
  myRoom: string | null;
}

const state = reactive<NetworkState>({
  peers: [],
  signalingReady: false,
  messages: [],
  peerStates: {},
  peerContents: {},
  peerLatencies: {},
  peerImageProgress: {},
  myIp: null,
  myAutoCode: null,
  myRoom: null,
});

let transport: WebRTCTransport | null = null;

/** 安全发送:DC 未就绪时静默跳过,避免未处理 rejection。 */
function safeSend(to: PeerId, type: DcEnvelope['type'], payload: unknown) {
  try {
    sendToPeer(to, type, payload)?.catch(() => { /* dc 未就绪,忽略 */ });
  } catch { /* noop */ }
}

/** dataURL → Uint8Array:用 fetch 解码 base64,比 atob 高效且不阻塞主线程。 */
async function dataUrlToBytes(dataUrl: string): Promise<Uint8Array> {
  const res = await fetch(dataUrl);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * 发送内容:图片(dataUrl 为 dataURL)走 元数据 JSON + sendBlob 二进制分块;
 * 文本类 / 已填充 blobURL 的图片 直接发 content JSON。
 */
function sendContent(to: PeerId, pc: PeerContent) {
  if (pc.content.type === 'image' && pc.content.dataUrl.startsWith('data:')) {
    const transferId = crypto.getRandomValues(new Uint32Array(1))[0];
    const meta: PeerContent = {
      ...pc,
      content: { ...pc.content, dataUrl: '', transferId },
    };
    safeSend(to, 'content', meta);
    void dataUrlToBytes(pc.content.dataUrl).then((bytes) => {
      transport?.sendBlob(to, transferId, bytes)?.catch(() => { /* noop */ });
    });
  } else {
    safeSend(to, 'content', pc);
  }
}

export function startNetwork() {
  if (transport) return;
  transport = new WebRTCTransport(identity.id, buildSignalingUrl());
  transport.onPeersChange((peers) => {
    const prev = state.peers;
    state.peers = peers;
    // 离线 peer:清理缓存内容/状态/延迟,避免陈旧数据与内存增长
    const removed = prev.filter((p) => !peers.includes(p));
    if (removed.length) {
      const nextContents = { ...state.peerContents };
      const nextStates = { ...state.peerStates };
      const nextLatencies = { ...state.peerLatencies };
      const nextProgress = { ...state.peerImageProgress };
      for (const p of removed) {
        // revoke peer 图片的 blob URL,防内存泄漏
        const pc = nextContents[p];
        if (pc?.content.type === 'image' && pc.content.dataUrl.startsWith('blob:')) {
          URL.revokeObjectURL(pc.content.dataUrl);
        }
        delete nextContents[p];
        delete nextStates[p];
        delete nextLatencies[p];
        delete nextProgress[p];
      }
      state.peerContents = nextContents;
      state.peerStates = nextStates;
      state.peerLatencies = nextLatencies;
      state.peerImageProgress = nextProgress;
    }
  });
  transport.onMessage((env) => {
    state.messages.push(env);
    if (state.messages.length > MAX_MESSAGES) state.messages = state.messages.slice(-MAX_MESSAGES);
    if (env.type === 'content' && env.payload) {
      // 收到对方 PeerContent,缓存到 peerContents,PeerView 即可渲染
      state.peerContents = { ...state.peerContents, [env.from]: env.payload as PeerContent };
    } else if (env.type === 'req-content') {
      // 对方主动请求,把自己的内容回推(图片走二进制分块)
      const own = getOwnContent();
      if (own) sendContent(env.from, own);
    } else if (env.type === 'ping' && env.payload) {
      // 收到 Ping:原样回 Pong(携带同一时间戳,对方据此算往返延迟)
      safeSend(env.from, 'pong', env.payload);
    } else if (env.type === 'pong' && env.payload) {
      // 收到 Pong:按时间戳算往返延迟,缓存到 peerLatencies,首页 peer 卡片展示
      const t = (env.payload as { t?: number }).t;
      if (typeof t === 'number') {
        state.peerLatencies = { ...state.peerLatencies, [env.from]: Date.now() - t };
      }
    }
  });
  transport.onBlob((from, transferId, blob) => {
    // 二进制分块收齐:组装 blob URL 填回 peerContent,PeerView 即可渲染
    const pc = state.peerContents[from];
    if (!pc || pc.content.type !== 'image' || pc.content.transferId !== transferId) return;
    const oldUrl = pc.content.dataUrl;
    if (oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
    const url = URL.createObjectURL(blob);
    state.peerContents = {
      ...state.peerContents,
      [from]: { ...pc, content: { ...pc.content, dataUrl: url, transferId: undefined } },
    };
    // 收齐:清除该 peer 的传输进度
    const nextProg = { ...state.peerImageProgress };
    delete nextProg[from];
    state.peerImageProgress = nextProg;
  });
  transport.onChunkProgress((from, _transferId, received, total) => {
    // 分块进度:供 PeerView 的 ImageRenderer 显示加载百分比
    state.peerImageProgress = { ...state.peerImageProgress, [from]: { received, total } };
  });
  transport.onSignalingState((ready) => {
    state.signalingReady = ready;
  });
  transport.onPeerState((peer, st) => {
    state.peerStates = { ...state.peerStates, [peer]: st };
    // 通道一通就把自己内容推过去,对方进 PeerView 即有内容可渲染
    if (st === 'open') {
      const own = getOwnContent();
      if (own) sendContent(peer, own);
      // 自动 ping 一次:1 秒内填上延迟,避免 peer 卡片平时留空 "—"
      // 双向连接时两端都会各自 ping,各自测自己的 RTT,互不干扰
      pingPeer(peer);
    }
  });
  void transport.connect();

  // 拉取本机公网 IP + 自动房间码 + 当前房间(CF 返回,即分房依据),房间卡片展示用
  const m = loadManualRoom();
  const ipUrl = m ? `${SIGNALING_HTTP}/ip?room=${encodeURIComponent(m)}` : `${SIGNALING_HTTP}/ip`;
  fetch(ipUrl)
    .then((r) => r.json())
    .then((d: { ip?: string; autoCode?: string; room?: string }) => {
      state.myIp = d.ip ?? null;
      state.myAutoCode = d.autoCode ?? null;
      state.myRoom = d.room ?? null;
    })
    .catch(() => { /* 网络异常忽略,卡片显示 — */ });
}

export function stopNetwork() {
  transport?.disconnect();
  transport = null;
}

/** 重连信令:断开当前 transport 再重新建连(presence 会重新同步)。 */
export function reconnectSignaling() {
  stopNetwork();
  // 重置信令就绪态,UI 立即反映"连接中"
  state.signalingReady = false;
  startNetwork();
}

/**
 * 切换房间:code 非空 → 持久化并用 ?room=CODE 重连;code 空 → 清除手动码,回到服务端自动分房。
 * 重连后 presence 重新同步,/ip 重新拉取(myRoom 随之更新)。
 */
export function setRoom(code: string | null) {
  if (code) localStorage.setItem(ROOM_KEY, code);
  else localStorage.removeItem(ROOM_KEY);
  reconnectSignaling();
}

export function sendToPeer(to: PeerId, type: DcEnvelope['type'], payload: unknown) {
  return transport?.send(to, type, payload);
}

/** 保存后广播:让所有在线对端看到最新内容。 */
export function broadcastContent(c: PeerContent) {
  for (const peer of state.peers) {
    sendContent(peer, c);
  }
}

/** 进入 PeerView 时主动拉取:补 push-on-connect 漏掉的情形(如先连后改内容)。 */
export function requestContent(peer: PeerId) {
  safeSend(peer, 'req-content', null);
}

/** Ping 对端:发 ping,对方回 pong 后 peerLatencies 即更新。 */
export function pingPeer(to: PeerId) {
  safeSend(to, 'ping', { from: identity.id, t: Date.now() });
}

export const network = readonly(state);

// 调试钩子(仅开发期):便于用 browser_evaluate 直接发消息/读状态,绕开 UI 点击。
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__lps = {
    get peers() { return state.peers; },
    get peerStates() { return state.peerStates; },
    get messages() { return [...state.messages]; },
    get peerContents() { return state.peerContents; },
    get peerLatencies() { return state.peerLatencies; },
    get peerImageProgress() { return state.peerImageProgress; },
    ping: (to: PeerId) => pingPeer(to),
    reqContent: (to: PeerId) => requestContent(to),
  };
}
