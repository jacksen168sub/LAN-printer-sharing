// 零依赖 HTTPS 静态服务器(自签证书),用于跨设备 LAN 实测。
// WebRTC 需要安全上下文:http://<局域网IP> 不行,必须 HTTPS 或 localhost。
// 手机打开 https://<本机LAN-IP>:3001,点"高级 → 继续前往"接受自签证书警告。
import { createServer as createHttps } from 'node:https';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.HTTPS_PORT || 3001;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
};

let creds;
try {
  creds = {
    key:  await readFile(join(__dirname, 'key.pem')),
    cert: await readFile(join(__dirname, 'cert.pem')),
  };
} catch (e) {
  console.error('缺少 key.pem / cert.pem,请先运行生成证书(见 README)。', e.message);
  process.exit(1);
}

const server = createHttps(creds, async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'https://x').pathname);
  if (p === '/') p = '/index.html';
  const filePath = join(__dirname, normalize(p));
  if (!filePath.startsWith(__dirname)) { res.statusCode = 403; res.end('forbidden'); return; }
  try {
    const data = await readFile(filePath);
    res.setHeader('Content-Type', MIME[extname(filePath)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(data);
  } catch {
    res.statusCode = 404; res.end('not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  WebRTC spike (HTTPS) → https://localhost:${PORT}`);
  console.log(`  跨设备 LAN: 手机连同一 WiFi,打开 https://<本机LAN-IP>:${PORT}`);
  console.log(`  自签证书: 浏览器会警告,点"高级 → 继续前往"即可。\n`);
});
