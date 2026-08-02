// 消息 schema:各 locale 的文案结构契约。带 {param} 的为命名插值。
// 各 locale 数据放在以 locale 命名的文件(zh-CN.ts / en.ts),漏键编译报错。

export interface Messages {
  common: {
    back: string;
    print: string;
    save: string;
    saved: string;
    edit: string;
  };
  home: {
    ownId: string;
    myContent: string;
    previewPrint: string;
    editMyContent: string;
    noContent: string;
    onlineDevices: string; // {count}
    noPeers: string;
    signaling: string;
    signalingStatus: string;
    connected: string;
    connecting: string;
    reconnect: string;
    channel: string;
    ping: string;
    latencyValue: string; // {ms}
    landscape: string;
    portrait: string;
    fold: string;
    messagesDebug: string;
  };
  peer: {
    deviceTitle: string; // {id}
    stateConnecting: string;
    stateOpen: string;
    stateClosed: string;
    stateUnknown: string;
    waitingContent: string;
    waitingHint: string;
    goEdit: string;
  };
  editor: {
    title: string;
    contentType: string;
    layout: string;
    orientation: string;
    landscape: string;
    portrait: string;
    fold: string;
    noFold: string;
    foldToA5: string;
    fontSize: string;
    autoFit: string;
    autoFitTitle: string;
    foldHint: string;
    preview: string;
  };
  print: {
    hint: string;
    empty: string;
    goEdit: string;
  };
}
