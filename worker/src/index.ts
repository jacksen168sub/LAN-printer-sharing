export { Room } from './room';

export interface Env {
  ROOM: DurableObjectNamespace;
}

/** 把 IPv6 地址展开为 8 组(处理 :: 缩写),去 zone id、转小写。 */
function expandIpv6(ip: string): string[] {
  ip = ip.split('%')[0].toLowerCase();
  const parts = ip.split(':');
  const idx = parts.indexOf('');
  if (idx < 0) return parts;
  const left = parts.slice(0, idx).filter((g) => g !== '');
  const right = parts.slice(idx + 1).filter((g) => g !== '');
  const zeros = Array(Math.max(0, 8 - left.length - right.length)).fill('0');
  return [...left, ...zeros, ...right];
}

/**
 * 归一化公网 IP 为房间键:
 *   IPv6 → 取 /64 前缀(前 4 组)。同 LAN 共享 /64,归一间。
 *   IPv4 → 完整地址。NAT 下同 LAN 共享公网 IPv4,归一间。
 * 跨网络(不同 /64 或不同公网 IPv4)自然分房,互不可见。
 */
function getRoomKey(ip: string): string {
  ip = ip.trim();
  if (ip.includes(':')) {
    return 'v6-' + expandIpv6(ip).slice(0, 4).join(':');
  }
  return 'v4-' + ip;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'content-type': 'application/json; charset=utf-8',
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');

    // 返回客户端公网 IP 与房间键,供前端展示与排查分组。?room= 指定时返回该房间。
    if (url.pathname === '/ip') {
      const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
      const room = url.searchParams.get('room') ?? (ip === 'unknown' ? 'unknown' : getRoomKey(ip));
      return new Response(JSON.stringify({ ip, room }), { headers: CORS_HEADERS });
    }

    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('LAN printer signaling — use WebSocket.', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    // 房间:?room=CODE 显式指定;否则按公网 IP 归一化(IPv6 /64 前缀 / IPv4 完整地址)。
    const ip = req.headers.get('CF-Connecting-IP') ?? 'default';
    const roomName = url.searchParams.get('room') ?? getRoomKey(ip);
    const id = env.ROOM.idFromName(roomName);
    const stub = env.ROOM.get(id);
    return stub.fetch(req);
  },
};
