// 零依赖静态服务器,仅用于本地 sanity 测试。
// 跨设备实测请把 index.html 放到 HTTPS 静态主机(GitHub Pages / Cloudflare Pages / Netlify drop),
// 因为 WebRTC 需要安全上下文(HTTPS 或 localhost),http://<局域网IP> 在非本机浏览器里会被限制。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
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
  log(`\n  WebRTC spike → http://localhost:${PORT}\n`);
  log(`  同机 sanity: 浏览器开两个标签都打开上面地址,按页面步骤交换 SDP。`);
  log(`  跨设备实测: 把 index.html 上传到 HTTPS 静态主机,两设备各自打开其 HTTPS URL。\n`);
});
function log(s){ console.log(s); }
