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
 * 归一化公网 IP 为内部房间键(仅用于派生房间码,不直接作为房间标识):
 *   IPv6 → 取 /64 前缀(前 4 组)。同 LAN 共享 /64。
 *   IPv4 → 完整地址。NAT 下同 LAN 共享公网 IPv4。
 */
function getRoomKey(ip: string): string {
  ip = ip.trim();
  if (ip.includes(':')) {
    return 'v6-' + expandIpv6(ip).slice(0, 4).join(':');
  }
  return 'v4-' + ip;
}

const CODE_DIGITS = 6;
const CODE_MOD = 10 ** CODE_DIGITS;

/**
 * 由公网 IP 派生 6 位十进制房间码:SHA-256(房间键)取前 32 位 → mod 10^6,零填充。
 * 单向哈希:码不泄露 IP;同 LAN(同房间键)→ 同码;不同 LAN 碰撞概率 ~1/10^6。
 */
async function computeAutoCode(ip: string): Promise<string> {
  const key = getRoomKey(ip);
  const data = new TextEncoder().encode(key);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const n = new DataView(buf).getUint32(0) % CODE_MOD;
  return n.toString().padStart(CODE_DIGITS, '0');
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'content-type': 'application/json; charset=utf-8',
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');

    const ip = req.headers.get('CF-Connecting-IP') ?? 'default';
    const manualRoom = url.searchParams.get('room');
    // 自动房间码:按公网 IP 派生(同 LAN 同码)。手动 ?room=CODE 覆盖。
    const autoCode = await computeAutoCode(ip);
    const room = manualRoom ?? autoCode;

    // 返回公网 IP + 自动码 + 当前房间,供前端展示与排查分组
    if (url.pathname === '/ip') {
      return new Response(JSON.stringify({ ip, autoCode, room }), { headers: CORS_HEADERS });
    }

    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('LAN printer signaling — use WebSocket.', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    // 房间标识 = 房间码(6 位自动码,或手动 ?room=CODE)。DO 按码分房,不再用 v4-/v6- 前缀。
    const id = env.ROOM.idFromName(room);
    const stub = env.ROOM.get(id);
    return stub.fetch(req);
  },
};
