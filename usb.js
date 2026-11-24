const $ = id => document.getElementById(id);

export function setupUSB(readPosition, routeLink, onStop) {
  const dialog = $('usb-dialog');
  const openSettings = () => { if (!dialog.open) dialog.showModal(); };
  $('usb-trigger').onclick = openSettings;
  const local = 'http://127.0.0.1:4179';
  if (location.origin !== local) {
    $('usb-open').onclick = () => {
      const url = new URL(local);
      try { url.hash = routeLink(); }
      catch (err) {
        // Empty plans need no handoff. Oversized plans can be exported as GPX.
        if (readPosition()) { $('usb-status').textContent = err.message; return; }
      }
      window.location.assign(url);
    };
    return { requireReady() { openSettings(); return false; }, release() {} };
  }

  $('usb-help').textContent = '用数据线连接并解锁 iPhone，点「连接 USB iPhone」，按手机提示完成授权。';
  $('usb-local').hidden = false;
  $('usb-download').hidden = true;
  let socket, timer, ready = false, pending = false, active = false, clearing = false, lastPoint = '';
  function status(text) { $('usb-status').textContent = text; }
  function controls() {
    $('usb-indicator').textContent = ready ? '已连接' : socket ? '连接中' : '未连接';
    $('usb-trigger').classList.toggle('connected', ready);
    $('usb-clear').disabled = !ready || clearing;
    $('usb-open').textContent = socket ? '断开 USB' : '连接 USB iPhone';
  }
  function send(action, point) {
    pending = true;
    socket.send(JSON.stringify({action, point}));
  }
  function tick() {
    if (!ready || pending || socket?.readyState !== WebSocket.OPEN) return;
    if (clearing) return send('clear');
    if (active) {
      const point = readPosition();
      if (point && String(point) !== lastPoint) {
        lastPoint = String(point);
        return send('set', point);
      }
    }
    send('ping');
  }
  function restore() {
    active = false;
    clearing = true;
    $('output-state').textContent = '正在恢复';
    controls();
    tick();
  }
  $('usb-clear').onclick = () => { restore(); onStop(); };
  $('usb-open').onclick = () => {
    if (socket) { socket.close(); return; }
    const connection = new WebSocket('ws://127.0.0.1:4179/iphone');
    socket = connection;
    let error = '';
    controls();
    status('正在连接 iPhone，请保持手机解锁…');
    connection.onmessage = ({data}) => {
      if (socket !== connection) return;
      const msg = JSON.parse(data);
      pending = false;
      if (msg.error) {
        error = msg.error; status(error); ready = active = false; onStop(); controls();
        connection.close(); return;
      }
      if (msg.state === 'ready') {
        ready = true;
        status('iPhone 已连接，可关闭窗口设置定位。');
        $('output-state').textContent = '等待指令';
        timer = setInterval(tick,750);
      } else if (msg.state === 'sent' && active) {
        $('output-state').textContent = '已同步';
      } else if (msg.state === 'cleared') {
        clearing = false;
        $('output-state').textContent = '已恢复';
        status('iPhone 已确认恢复定位指令。');
      }
      if (clearing) tick();
      controls();
    };
    connection.onerror = () => { error = 'USB 连接失败，请检查 Windows 助手和手机连接。'; status(error); };
    connection.onclose = () => {
      if (socket !== connection) return;
      clearInterval(timer); socket = null;
      ready = active = clearing = pending = false;
      lastPoint = '';
      onStop(); controls();
      $('output-state').textContent = '已断开';
      status(error || 'USB 已断开。请在 iPhone 地图上确认定位已恢复。');
    };
  };
  window.addEventListener('pagehide', () => socket?.close());
  controls();
  return {
    requireReady() {
      if (ready && !clearing && socket?.readyState === WebSocket.OPEN) return true;
      if (clearing) status('正在恢复定位，完成后可以重新开始。');
      openSettings();
      return false;
    },
    start() {
      lastPoint = ''; active = true;
      $('output-state').textContent = '正在同步';
      tick();
    },
    release() { if (active && ready) restore(); }
  };
}
