# LAN 打印共享

同一局域网内的设备互相访问各自编辑的内容,并打印对方的内容。纯前端 + 轻量信令,数据 P2P 直传,编辑内容持久化在浏览器本地。

## 功能

- **内容编辑**:支持 [地点/电话/联系人] 和 纯文本 两种模板(模板用 registry 注册,便于扩展)
- **智能识别**:粘贴混排文本,自动拆分到 地点/电话/联系人 三个字段
- **黄金分割自适应字号**:取所有字段中最长的一行,按 纸宽 / φ(≈61.8%)反推字号,全部字段统一;切换纸张方向/对折时自动重算
- **打印布局**:A4 横向 / A4 纵向 / A4 长边对折→A5 展示区,mm 精确缩放,所见即所打
- **局域网互发现**:CF Worker 信令中转 SDP/ICE,WebRTC DataChannel P2P 直连
- **预览/打印对端内容**:点其他设备 → 预览其内容 → 调用浏览器打印
- **本地持久化**:编辑内容与布局存 LocalStorage,刷新不丢

## 架构

```
┌─────────────┐   WSS 信令(SDP/ICE)   ┌──────────────┐
│  CF Worker  │ ◄──────────────────────► │  CF Worker   │
│  (前端静态)  │                          │ (信令 DO:Room)│
└─────────────┘                          └──────────────┘
      │                                         │
      │  WebRTC DataChannel(P2P,直传内容)        │
      └─────────────────────────────────────────┘
                   LocalStorage 持久化
```

- **前端**:Vue 3 + Vite + TypeScript,部署到 CF Pages
- **信令**:CF Worker + Durable Object,只转发 SDP/ICE 与 presence,不存业务数据
- **传输**:WebRTC DataChannel(P2P),传输层抽象为 `Transport` 接口,便于将来替换
- **存储**:浏览器 LocalStorage

## 技术栈

- Vue 3 + Vite + TypeScript
- WebRTC(DataChannel + ICE,配 Google STUN)
- Cloudflare Workers(Pages + Worker/Durable Objects)
- Material Web(部分回退为原生 button 以保证点击可靠性)
- pnpm workspaces monorepo

## 项目结构

```
.
├── app/          # 前端(Vue + Vite)
│   └── src/
│       ├── components/   # PrintSheet, FieldEditor
│       ├── pages/        # HomeView, EditorView, PrintView, PeerView
│       ├── templates/    # 内容模板 registry + Editor/Renderer
│       ├── transport/    # Transport 接口 + WebRTCTransport + SignalingClient
│       ├── stores/       # identity(LocalStorage), network(WebRTC 状态)
│       └── lib/          # smart-parse, auto-font
├── worker/       # CF Worker 信令(Durable Object: Room)
├── shared/       # 前后端共享类型(protocol.ts)
└── spikes/       # Phase 0 WebRTC 连通性验证(历史记录)
```

## 本地开发

```bash
pnpm install
pnpm dev          # 并行启动 app(vite :5173)+ worker(wrangler dev :8787)
```

信令地址默认 `ws://localhost:8787`(见 [app/src/stores/network.ts](app/src/stores/network.ts#L7)),本地开发无需额外配置。

> 本地跨设备测试 WebRTC 需 HTTPS(安全上下文)。可用 `spikes/webrtc/serve-https.mjs` 起自签 HTTPS 服务器,详见 [spikes/webrtc/README.md](spikes/webrtc/README.md)。

## 部署

两个服务都连 GitHub,push 自动部署到 Cloudflare。完整步骤见 [DEPLOY.md](DEPLOY.md)。

## 路线图

- ✅ Phase 0:WebRTC 连通性验证(见 [spikes/webrtc/README.md](spikes/webrtc/README.md))
- ✅ Phase 2:单设备编辑/持久化/预览/打印
- ✅ Phase 3:WebRTC 同步 PeerContent + PeerView 预览/打印对端内容
- 🔜 后续:可选 TURN 兜底、更多纸张尺寸/模板、E2E 加密
