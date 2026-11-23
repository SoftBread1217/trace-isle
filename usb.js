const $ = id => document.getElementById(id);

export function setupUSB(readPosition, routeLink) {
  const dialog = $('usb-dialog');
  $('usb-trigger').onclick = () => dialog.showModal();
  const local = 'http://127.0.0.1:4179';
  if (location.origin !== local) {
    $('usb-open').onclick = () => {
      const url = new URL(local);
      try { url.hash = routeLink(); } catch { /* Long GPX routes can be imported locally. */ }
      window.location.assign(url);
    };
    return;
  }
  $('usb-title').textContent = 'iPhone 真机定位';
  $('usb-help').textContent = '用数据线连接 iPhone 并解锁。连接后选点或轨迹，点「应用到 iPhone」。';
  $('usb-local').hidden = false;
  $('usb-download').hidden = true;
  $('usb-open').textContent = '连接 USB iPhone';
  let socket, timer, pending, streaming, ready, lastPoint, clearRequested;
  const status = message => { $('usb-status').textContent = message; };
  function controls() {
    $('usb-indicator').textContent = ready ? '已连接' : socket ? '连接中' : '未连接';
    $('usb-trigger').classList.toggle('connected', Boolean(ready));
    $('usb-apply').disabled = !ready || streaming || clearRequested;
    $('usb-clear').disabled = !ready;
    $('usb-open').textContent = socket ? '断开 USB' : '连接 USB iPhone';
  }
  function send(action, point) {
    if (socket?.readyState !== WebSocket.OPEN) return;
    pending = true;
    socket.send(JSON.stringify({ action, point }));
  }
  function tick() {
    if (!ready || pending) return;
    if (clearRequested) return send('clear');
    const point = readPosition();
    if (streaming && !point) {
      streaming = false;
      send('clear');
      controls();
    } else if (streaming && String(point) !== lastPoint) {
      lastPoint = String(point);
      send('set', point);
    } else send('ping');
  }
  $('usb-open').onclick = () => {
    if (socket) { socket.close(); return; }
    const active = new WebSocket('ws://127.0.0.1:4179/iphone');
    socket = active;
    ready = streaming = pending = clearRequested = false;
    let error = '';
    controls();
    status('正在打开真机定位服务，请保持手机解锁…');
    active.onmessage = ({ data }) => {
      if (socket !== active) return;
      const msg = JSON.parse(data);
      pending = false;
      if (msg.error) { error = msg.error; status(error); return; }
      if (msg.state === 'ready') {
        ready = true;
        status('USB 已连接 · iPhone 定位服务已就绪');
        timer = setInterval(tick, 750);
      }
      if (msg.state === 'sent' && streaming) status('模拟坐标已发至 iPhone · 打开苹果「地图」查看蓝点');
      if (msg.state === 'cleared') {
        clearRequested = false;
        status('已向 iPhone 发送恢复指令');
      }
      if (clearRequested) tick();
      controls();
    };
    active.onerror = () => { error = '无法连接 Windows 助手，请重新启动助手。'; status(error); };
    active.onclose = () => {
      if (active !== socket) return;
      clearInterval(timer);
      socket = null;
      const hadOutput = streaming || pending;
      ready = streaming = pending = false;
      status(error || (hadOutput ? 'USB 会话已结束。请在地图确认恢复，需要时重新连接并点「恢复真实定位」。' : 'USB 未连接'));
      controls();
    };
  };
  $('usb-apply').onclick = () => {
    if (!readPosition()) return status('请先在地图上选择坐标或载入一条路线。');
    lastPoint = '';
    streaming = true;
    status('正在向 iPhone 发送位置…');
    controls();
    tick();
  };
  $('usb-clear').onclick = () => {
    streaming = false;
    lastPoint = '';
    status('正在恢复真实定位…');
    clearRequested = true;
    tick();
    controls();
  };
  window.addEventListener('pagehide', () => socket?.close());
  status('USB 未连接');
  controls();
  return () => { if (streaming) $('usb-clear').click(); };
}
