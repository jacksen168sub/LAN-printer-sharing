import { reactive, readonly } from 'vue';
import type { DcEnvelope, PeerContent, PeerId } from 'shared';
import { WebRTCTransport } from '../transport/WebRTCTransport';
import { identity, getOwnContent } from './identity';

const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:8787';

interface NetworkState {
  peers: PeerId[];
  signalingReady: boolean;
  messages: DcEnvelope[];
  peerStates: Record<string, 'connecting' | 'open' | 'closed'>;
  peerContents: Record<string, PeerContent>;
}

const state = reactive<NetworkState>({
  peers: [],
  signalingReady: false,
  messages: [],
  peerStates: {},
  peerContents: {},
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
    state.peers = peers;
  });
  transport.onMessage((env) => {
    state.messages.push(env);
    if (env.type === 'content' && env.payload) {
      // 收到对方 PeerContent,缓存到 peerContents,PeerView 即可渲染
      state.peerContents = { ...state.peerContents, [env.from]: env.payload as PeerContent };
    } else if (env.type === 'req-content') {
      // 对方主动请求,把自己的内容回推
      const own = getOwnContent();
      if (own) safeSend(env.from, 'content', own);
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
}

export function stopNetwork() {
  transport?.disconnect();
  transport = null;
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

export const network = readonly(state);

// 调试钩子(仅开发期):便于用 browser_evaluate 直接发消息/读状态,绕开 UI 点击。
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__lps = {
    get peers() { return state.peers; },
    get peerStates() { return state.peerStates; },
    get messages() { return [...state.messages]; },
    get peerContents() { return state.peerContents; },
    ping: (to: PeerId) => sendToPeer(to, 'ping', { from: identity.id, t: Date.now() }),
    reqContent: (to: PeerId) => requestContent(to),
  };
}
