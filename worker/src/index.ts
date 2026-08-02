export { Room } from './room';

export interface Env {
  ROOM: DurableObjectNamespace;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');

    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('LAN printer signaling — use WebSocket.', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    // 全部设备进同一房间(同 LAN 才可能 WebRTC 直连;跨 LAN 即便看到也连不上)
    const id = env.ROOM.idFromName('default');
    const stub = env.ROOM.get(id);
    return stub.fetch(req);
  },
};
