// 前后端共享:信令协议 + 业务数据类型
// 加新模板/新纸张尺寸时,只扩下方 union,不动传输层与信令。

export type PeerId = string;

// ===== 信令(WebSocket)消息 =====
export interface JoinMsg { kind: 'join'; id: PeerId; }
export interface LeaveMsg { kind: 'leave'; id: PeerId; }
export interface PresenceMsg { kind: 'presence'; peers: PeerId[]; }
export interface SdpMsg {
  kind: 'sdp';
  from: PeerId;
  to: PeerId;
  sdp: { type: 'offer' | 'answer'; sdp: string };
}
export interface IceMsg {
  kind: 'ice';
  from: PeerId;
  to: PeerId;
  candidate: IceCandidateInit | null; // null = gathering done
}
export type SignalMsg = JoinMsg | LeaveMsg | PresenceMsg | SdpMsg | IceMsg;

// 自定义 IceCandidateInit(不依赖 DOM lib,前后端通用)
export interface IceCandidateInit {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment: string | null;
}

// ===== 业务数据(走 DataChannel)=====
export type Align = 'left' | 'center' | 'right';

/**
 * 单个字段样式:地点/电话/联系人 各一个,纯文本模板也复用。
 * 多行用 \n 保留换行。fontSize 单位 pt。
 */
export interface FieldStyle {
  text: string;
  align: Align;
  fontSize: number;
}

/** [地点/电话/联系人] 模板:三个独立框,智能识别后分别填入。 */
export interface ContactContent {
  type: 'contact';
  location: FieldStyle;
  phone: FieldStyle;
  contact: FieldStyle;
}

/** 一条纯文本模板。 */
export interface TextContent {
  type: 'text';
  text: FieldStyle;
}

// 预留:未来加新模板只需在这里扩 union
export type Content = ContactContent | TextContent;
export type ContentType = Content['type'];

/** 打印布局 */
export interface PrintLayout {
  paper: 'A4'; // 预留:未来加 'A5' 等
  orientation: 'landscape' | 'portrait';
  fold: 'none' | 'half-long-edge'; // A4 长边对折 → A5 展示区
}

export interface PeerContent {
  content: Content;
  layout: PrintLayout;
  updatedAt: number;
}

/** DataChannel 消息封装 */
export interface DcEnvelope {
  from: PeerId;
  type: 'content' | 'ping' | 'pong' | 'req-content';
  payload: unknown;
}
