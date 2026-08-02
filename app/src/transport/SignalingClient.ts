import type { SignalMsg, PeerId, IceCandidateInit } from 'shared';

export interface SignalingHandlers {
  onOpen: () => void;
  onClose: () => void;
  onPeers: (peers: PeerId[]) => void;
  onSdp: (from: PeerId, sdp: { type: 'offer' | 'answer'; sdp: string }) => void;
  onIce: (from: PeerId, candidate: IceCandidateInit | null) => void;
}

/** WebSocket 信令客户端:连 CF Worker,收发 SDP/ICE/presence。 */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly id: PeerId,
    private readonly url: string,
    private readonly handlers: SignalingHandlers,
  ) {}

  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.send({ kind: 'join', id: this.id });
      this.handlers.onOpen();
    };
    this.ws.onmessage = (ev) => this.onMessage(ev.data);
    this.ws.onclose = () => {
      this.handlers.onClose();
      this.scheduleReconnect();
    };
    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private onMessage(data: string) {
    let msg: SignalMsg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    switch (msg.kind) {
      case 'presence': this.handlers.onPeers(msg.peers); break;
      case 'sdp': this.handlers.onSdp(msg.from, msg.sdp); break;
      case 'ice': this.handlers.onIce(msg.from, msg.candidate); break;
      default: break;
    }
  }

  send(msg: SignalMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  sendSdp(to: PeerId, sdp: { type: 'offer' | 'answer'; sdp: string }) {
    this.send({ kind: 'sdp', from: this.id, to, sdp });
  }

  sendIce(to: PeerId, candidate: IceCandidateInit | null) {
    this.send({ kind: 'ice', from: this.id, to, candidate });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }

  close() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) {
      this.send({ kind: 'leave', id: this.id });
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
}
