import type { SignalMsg } from 'shared';

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
          id = msg.id;
          this.peers.set(id, server);
          this.broadcastPresence();
          break;
        case 'leave':
          if (id) {
            this.peers.delete(id);
            this.broadcastPresence();
          }
          break;
        case 'sdp':
        case 'ice': {
          // 定向转发给目标 peer
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
