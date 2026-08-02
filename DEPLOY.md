# 部署到 Cloudflare(两个服务都连 GitHub,push 自动部署)

两个服务都连接 GitHub 仓库,后续 push 代码自动构建部署:

| 服务 | 仓库路径 | CF 产品 | 地址 |
|------|----------|---------|------|
| 信令 Worker | `worker/` | **Workers Builds**(Worker 连 Git) | `wss://…workers.dev` |
| 前端 | `app/` | **Pages**(连 Git) | `https://…pages.dev` |

> 顺序很重要:**先建 Worker 拿到 `wss://` 地址,再在 Pages 配置该地址作为环境变量**。
> 前端是 HTTPS,信令必须用 `wss://`(否则浏览器按混合内容拦截)。CF 两边都自带 TLS。

---

## 0. 前置

- 代码已推到 GitHub
- Cloudflare 账号
- 本地能跑 `npx wrangler login`(仅首次手动部署 Worker 调试用,可选)

---

## 1. 信令 Worker:Workers Builds 连 GitHub

Worker 配置见 [worker/wrangler.toml](worker/wrangler.toml):name = `lan-printer-sharing`,含一个 Durable Object `Room`(首次部署自动建迁移)。

> 本项目是 pnpm monorepo,worker 在 `worker/` 子目录、且 `worker/package.json` 依赖 `shared` workspace。`shared` 在 [room.ts:1](worker/src/room.ts#L1) 是 `import type`(打包时擦除),但 `pnpm install` 仍需在仓库根执行以链接 workspace。所以 **Root directory 设为项目根**,deploy 命令用 `--config` 指向 worker 的 toml。

### 步骤

1. CF Dashboard → **Workers & Pages** → **Create** → **Worker** → **Connect to Git**
2. 选 GitHub 仓库,授权
3. 在 **Settings → Build** 配置:

| 配置项 | 值 |
|--------|-----|
| Git branch | `main` |
| **Root directory** | `/`(项目根,留空即根;此处有 `pnpm-lock.yaml`,CF 才能正确识别 pnpm) |
| **Build command** | `pnpm install --frozen-lockfile` |
| **Deploy command** | `npx wrangler deploy --config worker/wrangler.toml` |

4. Save and Deploy

> - `--config worker/wrangler.toml` 让 wrangler 用 worker 的配置;toml 里的 `main = "src/index.ts"` 相对 toml 解析为 `worker/src/index.ts`。
> - 首次部署会自动执行 Durable Object 迁移(`new_sqlite_classes = ["Room"]`,免费计划要求 SQLite 后端)。
> - Worker 无需环境变量(纯转发信令,不存业务数据)。

### 拿到信令地址

部署成功后,在 Worker 详情页看到地址:

```
https://lan-printer-sharing.<你的子域>.workers.dev
```

对应信令 URL(把 `https` 换 `wss`):

```
wss://lan-printer-sharing.<你的子域>.workers.dev
```

验证:浏览器开 `https://lan-printer-sharing.<你的子域>.workers.dev/health`,返回 `ok` 即正常。

---

## 2. 前端:CF Pages 连 GitHub

1. CF Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 选同一 GitHub 仓库
3. 构建配置:

| 配置项 | 值 |
|--------|-----|
| Project name | `lan-printer` |
| Production branch | `main` |
| Framework preset | `Vite` |
| Build command | `pnpm build` |
| Build output directory | `app/dist` |
| Root directory | `/`(项目根) |

> CF Pages 检测到根目录 `pnpm-lock.yaml` 会自动 `pnpm install`,无需在 build command 里写 install。
> 根 `package.json` 的 `packageManager: pnpm@10.30.1` 会被 corepack 识别。

4. **Settings → Environment variables**(Production 和 Preview 都设):

| 变量 | 值 |
|------|-----|
| `VITE_SIGNALING_URL` | `wss://lan-printer-sharing.<你的子域>.workers.dev`(第 1 步拿到) |
| `NODE_VERSION` | `20` |

> ⚠️ `VITE_SIGNALING_URL` 必须设。[network.ts](app/src/stores/network.ts#L7) 读它;不设则默认 `ws://localhost:8787`,线上 HTTPS 页面会拦截,信令连不上、PeerView 永远收不到内容。

5. Save and Deploy

完成后得到 `https://lan-printer.pages.dev`(生产域名)。之后每次 push 到 `main`,前端自动重建部署。

---

## 3. 验证(两台设备实测)

1. A、B 都打开 Pages 生产域名,首页各自显示本机 ID
2. 互相出现在"同局域网设备"列表(信令通)
3. A 编辑内容 → 保存;B 点 A 的 ID → PeerView 看到预览 → 打印;反向同样验证

### 排查

| 现象 | 排查 |
|------|------|
| 设备列表空 | F12 看 WebSocket 是否连上;确认 Pages 环境变量 `VITE_SIGNALING_URL` 是 `wss://` 且 Worker 已部署 |
| 看到对方但点进去"尚未收到内容" | 等几秒等 DataChannel 建连;对方是否已保存;控制台 `__lps.peerStates` / `__lps.peerContents` |
| DataChannel 一直 connecting | NAT/防火墙问题。同 Wi-Fi 一般靠 STUN srflx 可通;路由器不支持 hairpinning 时需加 TURN |
| 打印内容偏移 | 打印对话框选 A4、无边距、关闭页眉页脚 |

### 调试钩子(浏览器控制台)

```js
__lps.peers              // 在线 peer
__lps.peerStates         // 各 peer 的 DC 状态
__lps.peerContents       // 收到的对端内容
__lps.reqContent('xxxx') // 主动拉取某 peer 内容
```

---

## 4. 日常更新(push 即自动部署)

两个服务都连了 Git,push 到 `main` 后各自自动构建部署:

| 改了什么 | 自动部署? |
|----------|-----------|
| 仅前端 `app/`(或 `shared/`) | ✅ Pages 自动 |
| 仅 `worker/`(或 `shared/`) | ✅ Workers Builds 自动 |
| 同时改了前端 + Worker | 两个都自动重新部署 |

### 可选:用 watch paths 避免无关构建

- **Worker**:Settings → Build → Build watch paths 设为 `worker/` 和 `shared/`,只有这两个目录改动才触发 Worker 部署
- **Pages**:同样可配 watch paths 限定 `app/` 和 `shared/`

不配也行,只是 push 时两个服务都会重建(幂等,无害)。

---

## 5. 连通性说明(ICE / STUN / TURN)

- ICE 配了 Google STUN([WebRTCTransport.ts](app/src/transport/WebRTCTransport.ts#L5-L8)),拿 srflx 候选,规避 mDNS `.local` 跨设备解析失败
- **未配 TURN**。同局域网:STUN srflx + NAT hairpinning 通常够用(此前两台手机已验证可通)
- 某些严格 NAT 下 P2P 建连失败时,在 `ICE_SERVERS` 补 `turn:` 配置即可(会中继流量,非纯 P2P)

---

## 6. 可选:自定义域名

- **Pages**:Dashboard → 选 `lan-printer` → Custom domains → 绑定(自动签证书)
- **Worker**:Dashboard → 选 `lan-printer-sharing` → Triggers → Custom Domains
- 绑域后,把 Pages 环境变量 `VITE_SIGNALING_URL` 改成新的 `wss://你的域名`,触发一次新部署即可

---

## 附:关键文件速查

| 文件 | 作用 |
|------|------|
| [worker/wrangler.toml](worker/wrangler.toml) | Worker 名、Durable Object 绑定、迁移 |
| [worker/src/index.ts](worker/src/index.ts) | 信令入口:WebSocket 升级 → Room DO |
| [app/src/stores/network.ts](app/src/stores/network.ts) | 读取 `VITE_SIGNALING_URL`,WebRTC 管理 |
| [app/vite.config.ts](app/vite.config.ts) | Vite 构建配置 |
| [app/.env.example](app/.env.example) | 环境变量模板(本地开发参考) |

---

## 参考

- [Workers Builds 配置(Build command / Deploy command / Root directory)](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Workers Builds 高级用法:Monorepo(根目录隔离 + watch paths)](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/)
