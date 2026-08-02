export { Room } from './room';

export interface Env {
  ROOM: DurableObjectNamespace;
  // 房间隔离模式:
  //   'global' = 全员同一房间(最宽松,跨网络也能在列表里看到对方 ID)
  //   'by-ip'  = 按客户端公网 IP 分房间(同 NAT/LAN 归一间,默认)
  // 留空时按 'by-ip' 处理。用 wrangler.toml [vars] 或 Dashboard 环境变量配置。
  ROOM_MODE?: 'global' | 'by-ip';
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
    // 房间隔离:'global' 全员同房;'by-ip' 按公网 IP(同 NAT/LAN 归一间,跨网络互不可见)
    const roomName = env.ROOM_MODE === 'global'
      ? 'default'
      : (req.headers.get('CF-Connecting-IP') ?? 'default');
    const id = env.ROOM.idFromName(roomName);
    const stub = env.ROOM.get(id);
    return stub.fetch(req);
  },
};
