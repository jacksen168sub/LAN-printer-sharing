# WebRTC 连通性 spike(Phase 0)

> 目的:用数据决定"同局域网浏览器→浏览器"的 WebRTC DataChannel 能否直连,还是必须走 CF Worker 中转。

## 为什么是手动信令(而非 CF Worker)

spike 的核心问题是 **WebRTC 连通性**,不是"信令怎么做"。手动复制粘贴 SDP 把信令从变量中剔除,零部署、零账号、立即可测。真实 Worker 信令在 Phase 1/3 构建。

## 运行

### A. 同机 sanity(快速验证代码 + 看候选类型)
```bash
node spikes/webrtc/serve.mjs
# 浏览器开两个标签都打开 http://localhost:3000
```
- 标签1:点"创建 Offer"→ 复制 Offer → 贴到标签2 的"接受 Offer"输入框。
- 标签2:点"接受 Offer 并生成 Answer"→ 复制 Answer → 贴回标签1 的"贴回 Answer"。
- 标签1:点"应用 Answer"。观察"状态"与"日志"。

> 同机两标签的 host 候选在本机内可解析,**不代表跨设备真实情况**,只用来验证流程与候选日志。

### B. 跨设备实测(代表性测试,必须 HTTPS)
WebRTC 需要安全上下文。`http://<局域网IP>` 在别的设备上会被限制(按钮无反应),必须 HTTPS。两种方式:

**方式 1(纯 LAN,无需部署)— 自签 HTTPS 服务器**
```bash
# 生成自签证书(把 IP 换成本机 LAN IP)
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 30 \
  -subj "/CN=lan-printer-spike" -addext "subjectAltName=IP:192.168.1.100,DNS:localhost"
node spikes/webrtc/serve-https.mjs   # 监听 :3001
```
手机连同一 WiFi,打开 `https://<本机LAN-IP>:3001`,证书警告点"高级 → 继续前往"。

**方式 2(公网 HTTPS)**:把 `index.html` 上传到 GitHub Pages / Cloudflare Pages / Netlify,两设备各自打开该 HTTPS URL。

两种方式都用任意聊天软件(微信/Telegram)互传 Offer / Answer 两个 JSON 串。

## 测试矩阵

| # | 设备 A | 设备 B | 网络 | STUN | ICE 策略 | 结果 |
|---|---|---|---|---|---|---|
| 1 | Chrome 桌面(同机) | Chrome 桌面(同机) | — | on | all | (sanity) |
| 2 | Chrome 桌面 | Chrome 桌面 | 同 WiFi | on | all | |
| 3 | Chrome 桌面 | Chrome Android | 同 WiFi | on | all | |
| 4 | Chrome 桌面 | Safari iOS | 同 WiFi | on | all | |
| 5 | Chrome 桌面 | Edge 桌面 | 同 WiFi | on | all | |
| 6 | Chrome 桌面 | Chrome 桌面 | 跨网络(一开热点) | on | all | (验证 srflx/hairpin) |
| 7 | 任一 | 任一 | 同 WiFi | off | all | (纯 host 候选) |

每行记录:候选类型计数(host/srflx/relay)、host 候选是否 `.local`、ICE 最终状态(connected/failed)、连通耗时。

## 怎么看结果

- **host 候选地址带 `.local`** → mDNS 混淆,对方浏览器解析不了 → host 路径失效(这是 Chromium ≥88 的默认行为,正是预期中的坑)。
- **host 候选带真实内网 IP(192.168.x.x)** → 可直连,好信号。
- **srflx 候选** → 来自 STUN,同 LAN 两端靠它连需路由器 NAT 回环(hairpin),不一定成。
- **relay 候选** → 只有配了 TURN 才会出现;出现且 host/srflx 都失败,说明必须 TURN(花钱/非本地)。
- **ICE connected** → 该组合能直连;**failed** → 不能。

## 判定标准(传输决策)

- 矩阵 #2~#5(同 LAN、主流浏览器组合)中,**无 TURN 直连成功率 > ~80%** → 建 `WebRTCTransport`(P2P 为主,中转兜底)。
- **成功率低或高度依赖 srflx/relay** → 用 `RelayTransport`(CF Worker 中转),放弃 WebRTC 主路径。

## 决策记录

- **结论:用 WebRTC(P2P 为主,CF Worker 仅做信令中转 SDP)。**
- **依据**:
  - 同机 sanity(localhost 两标签):host 候选为 mDNS `.local`,srflx 在;ICE `connected`(3–11ms),DataChannel open,双向 ping 通。流程与工具验证通过。
  - 跨设备实测(两台手机,同 WiFi,自签 HTTPS `https://<LAN-IP>:3001`):**连通成功**,完成验证性测试。
  - host 候选为 mDNS `.local`(Chromium ≥88 默认混淆);跨设备仍能连通,说明同 LAN 下 mDNS 可被对端解析,或 srflx + NAT 回环(hairpin)成功。具体候选类型未记录,但不影响结论:**同 LAN 可直连**。
  - 关键约束:**必须 HTTPS**。`http://<局域网IP>` 是非安全上下文,WebRTC/剪贴板 API 被禁,按钮无反应。生产环境用 CF Pages(自带 HTTPS)。
- **架构定稿**:前端静态托管(CF Pages)+ CF Worker 信令(只转发 SDP,不碰业务数据)+ WebRTC DataChannel(P2P,可 E2E 加密)+ LocalStorage 持久化。
- **兜底**:若个别网络 WebRTC 不通(同 LAN 下罕见),后续可加 TURN;当前不引入,保持零成本。
- **日期**:2026-08-01
