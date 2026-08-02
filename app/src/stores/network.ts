import { reactive, readonly } from 'vue';
import type { DcEnvelope, PeerContent, PeerId } from 'shared';
import { WebRTCTransport } from '../transport/WebRTCTransport';
import { identity, getOwnContent } from './identity';

const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:8787';
// ws/wss → http/https,用于 fetch /ip(CF 返回的公网 IP 即分房依据,权威)
const SIGNALING_HTTP = SIGNALING_URL.replace(/^ws/, 'http');

// 消息缓冲上限:防止长会话内存只增不减
const MAX_MESSAGES = 100;

interface NetworkState {
  peers: PeerId[];
  signalingReady: boolean;
  messages: DcEnvelope[];
  peerStates: Record<string, 'connecting' | 'open' | 'closed'>;
  peerContents: Record<string, PeerContent>;
  peerLatencies: Record<string, number>;
  myIp: string | null;
  myRoom: string | null;
}

const state = reactive<NetworkState>({
  peers: [],
  signalingReady: false,
  messages: [],
  peerStates: {},
  peerContents: {},
  peerLatencies: {},
  myIp: null,
  myRoom: null,
});

let transport: WebRTCTransport | null = null;

/** 安全发送:DC 未就绪时静默跳过,避免未处理 rejection。 */
function safeSend(to: PeerId, type: DcEnvelope['type'], payload: unknown) {
  try {
    sendToPeer(to, type, payload)?.catch(() => { /* dc 未就绪,忽略 */ });
  } catch { /* noop */ }
}

export function startNetwork() {
  if (transport) return;
  transport = new WebRTCTransport(identity.id, SIGNALING_URL);
  transport.onPeersChange((peers) => {
    const prev = state.peers;
    state.peers = peers;
    // 离线 peer:清理缓存内容/状态/延迟,避免陈旧数据与内存增长
    const removed = prev.filter((p) => !peers.includes(p));
    if (removed.length) {
      const nextContents = { ...state.peerContents };
      const nextStates = { ...state.peerStates };
      const nextLatencies = { ...state.peerLatencies };
      for (const p of removed) {
        delete nextContents[p];
        delete nextStates[p];
        delete nextLatencies[p];
      }
      state.peerContents = nextContents;
      state.peerStates = nextStates;
      state.peerLatencies = nextLatencies;
    }
  });
  transport.onMessage((env) => {
    state.messages.push(env);
    if (state.messages.length > MAX_MESSAGES) state.messages = state.messages.slice(-MAX_MESSAGES);
    if (env.type === 'content' && env.payload) {
      // 收到对方 PeerContent,缓存到 peerContents,PeerView 即可渲染
      state.peerContents = { ...state.peerContents, [env.from]: env.payload as PeerContent };
    } else if (env.type === 'req-content') {
      // 对方主动请求,把自己的内容回推
      const own = getOwnContent();
      if (own) safeSend(env.from, 'content', own);
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
  transport.onSignalingState((ready) => {
    state.signalingReady = ready;
  });
  transport.onPeerState((peer, st) => {
    state.peerStates = { ...state.peerStates, [peer]: st };
    // 通道一通就把自己内容推过去,对方进 PeerView 即有内容可渲染
    if (st === 'open') {
      const own = getOwnContent();
      if (own) safeSend(peer, 'content', own);
    }
  });
  void transport.connect();

  // 拉取本机公网 IP + 房间键(CF 返回,即分房依据),信令卡片展示用
  fetch(`${SIGNALING_HTTP}/ip`)
    .then((r) => r.json())
    .then((d: { ip?: string; room?: string }) => {
      state.myIp = d.ip ?? null;
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

export function sendToPeer(to: PeerId, type: DcEnvelope['type'], payload: unknown) {
  return transport?.send(to, type, payload);
}

/** 保存后广播:让所有在线对端看到最新内容。 */
export function broadcastContent(c: PeerContent) {
  for (const peer of state.peers) {
    safeSend(peer, 'content', c);
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
    ping: (to: PeerId) => pingPeer(to),
    reqContent: (to: PeerId) => requestContent(to),
  };
}
