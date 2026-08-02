import type { SignalMsg } from 'shared';

/** ID 合规:32 位小写 hex。服务端据此拒绝旧版 4 位 / 损坏 / 伪造 ID,防 presence 污染。 */
const ID_RE = /^[0-9a-f]{32}$/;

/**
 * Room:单一 Durable Object,维护在线 peer 集合 + 中转 SDP/ICE。
 * 纯转发,不存任何业务数据。peer 上下线时广播 presence。
 */
export class Room {
  private peers = new Map<string, WebSocket>();

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // id 仅在合规 join 后才赋值;未合规加入的连接无法中转消息,也无法进入 presence。
    let id: string | null = null;

    server.accept();

    server.addEventListener('message', (event: MessageEvent) => {
      let msg: SignalMsg;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }
      switch (msg.kind) {
        case 'join':
          // 仅接受合规 ID(32 位 hex)。不合规(旧版 4 位 / 损坏 / 伪造)→ 忽略,不入 presence。
          if (typeof msg.id === 'string' && ID_RE.test(msg.id)) {
            id = msg.id;
            this.peers.set(id, server);
            this.broadcastPresence();
          }
          break;
        case 'leave':
          if (id) {
            this.peers.delete(id);
            this.broadcastPresence();
          }
          break;
        case 'sdp':
        case 'ice': {
          // 仅已合规加入的连接可中转;目标必须合规且在线
          if (!id) return;
          if (typeof msg.to !== 'string' || !ID_RE.test(msg.to)) return;
          const target = this.peers.get(msg.to);
          if (target && target.readyState === WebSocket.OPEN) {
            target.send(JSON.stringify(msg));
          }
          break;
        }
        case 'presence':
          break;
      }
    });

    const cleanup = () => {
      if (id) {
        this.peers.delete(id);
        this.broadcastPresence();
      }
    };
    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcastPresence() {
    const peers = [...this.peers.keys()];
    const msg = JSON.stringify({ kind: 'presence', peers } satisfies SignalMsg);
    for (const ws of this.peers.values()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }
}
