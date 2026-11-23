const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.hash.slice(1));
let peer, timer;
function stop(detail) {
  clearInterval(timer);
  const old = peer;
  peer = null;
  old?.destroy();
  $('connection').textContent = detail;
  $('retry').hidden = false;
  $('mode').textContent = '未连接';
}
function start() {
  const host = params.get('host'), token = params.get('token');
  if (!host || !token) return stop('请在电脑上点「连接手机」，用相机扫描二维码。');
  $('retry').hidden = true;
  $('connection').textContent = '正在连接电脑…';
  $('mode').textContent = '等待数据';
  let last = Date.now();
  try {
    const active = new window.Peer();
    peer = active;
    active.on('open', () => {
      if (peer !== active) return;
      const conn = active.connect(host, { reliable: true, serialization: 'json', metadata: { token } });
      conn.on('data', data => {
        if (peer !== active || data?.type !== 'sample' || !Number.isSafeInteger(data.seq)) return;
        for (const key of ['lat', 'lon', 'distance', 'pace', 'mode']) $(key).textContent = String(data[key] ?? '—');
        last = Date.now();
        $('stamp').textContent = '上次接收 ' + new Date(last).toLocaleTimeString();
        $('connection').textContent = '已连接电脑 · 正在接收';
        conn.send({ type: 'ack', seq: data.seq });
      });
      conn.on('close', () => { if (peer === active) stop('连接已断开，请在电脑上查看连接状态。'); });
      conn.on('error', () => { if (peer === active) stop('连接失败，请检查网络或重新扫码。'); });
    });
    active.on('error', () => { if (peer === active) stop('配对不可用，请在电脑上重新打开「连接手机」并扫码。'); });
    timer = setInterval(() => { if (Date.now() - last > 20000) stop('没有收到电脑数据，请检查网络并保持两端网页在前台。'); }, 1000);
  } catch { stop('浏览器无法连接，请用 Safari 打开接收链接。'); }
}
$('retry').onclick = start;
window.addEventListener('pagehide', () => stop('连接已断开。'));
start();
