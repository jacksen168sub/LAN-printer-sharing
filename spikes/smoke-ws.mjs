// 临时冒烟测试:验证 Worker DO 的 presence 广播与定向转发。
// 跑:node spikes/smoke-ws.mjs
const URL = 'ws://localhost:8787';
const ws = (id) => {
  const s = new WebSocket(URL);
  s.onopen = () => s.send(JSON.stringify({ kind: 'join', id }));
  s.onmessage = (e) => console.log(`  ${id} <- ${e.data}`);
  return s;
};
const A = ws('AAAA'), B = ws('BBBB');
setTimeout(() => {
  // A 经 DO 转发一条 sdp 给 B
  A.send(JSON.stringify({ kind: 'sdp', from: 'AAAA', to: 'BBBB', sdp: { type: 'offer', sdp: 'fake' } }));
}, 600);
setTimeout(() => { A.close(); B.close(); console.log('done'); process.exit(0); }, 1500);
