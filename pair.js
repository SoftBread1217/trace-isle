const $ = id => document.getElementById(id);

export function setupPairing(readSample) {
  let peer, channel, timer, deadline;
  let token, sent, confirmed, lastAck;

  function status(short, detail) {
    $('device-state').textContent = short;
    $('pair-status').textContent = detail;
  }
  function release() {
    clearInterval(timer);
    clearTimeout(deadline);
    const old = peer;
    peer = channel = null;
    old?.destroy();
    $('pair-qr').hidden = $('pair-label').hidden = true;
    $('pair-url').value = '';
    $('pair-end').disabled = true;
    $('connect').textContent = '连接手机';
  }
  function fail(message) {
    release();
    $('pair-retry').hidden = false;
    status('未连接', message);
  }
  function start() {
    release();
    $('pair-retry').hidden = true;
    try {
      token = crypto.randomUUID();
      const active = new window.Peer();
      peer = active;
      $('pair-end').disabled = false;
      $('connect').textContent = '查看连接';
      status('准备配对', '正在获取手机接收链接…');
      deadline = setTimeout(() => fail('配对服务没有回应，请检查两端网络并重试。'), 20000);
      active.on('open', id => {
        if (peer !== active) return;
        clearTimeout(deadline);
        const url = new URL('receive.html?v=4', location.href);
        url.hash = new URLSearchParams({ host: id, token }).toString();
        $('pair-url').value = url.href;
        $('pair-label').hidden = false;
        const qr = window.qrcode(0, 'M');
        qr.addData(url.href);
        qr.make();
        $('pair-qr').src = qr.createDataURL(5, 20);
        $('pair-qr').hidden = false;
        status('等待手机扫码', '等待手机打开接收页。也可以复制上方链接到 Safari。');
      });
      active.on('connection', incoming => {
        if (peer !== active || incoming.metadata?.token !== token || channel) {
          incoming.on('open', () => incoming.close());
          return;
        }
        channel = incoming;
        sent = confirmed = 0;
        lastAck = Date.now();
        status('等待接收确认', '正在和手机建立数据连接。');
        function update() {
          if (channel !== incoming) return;
          if (Date.now() - lastAck > 12000) return fail('接收页未回应。请让手机页面保持在前台，重新连接。');
          if (incoming.open) incoming.send({ type: 'sample', seq: ++sent, ...readSample() });
        }
        incoming.on('data', msg => {
          if (channel !== incoming || msg?.type !== 'ack' || !Number.isSafeInteger(msg.seq) ||
              msg.seq <= confirmed || msg.seq > sent) return;
          confirmed = msg.seq;
          lastAck = Date.now();
          status('接收页已连接', '接收页已确认最新数据 · ' + new Date(lastAck).toLocaleTimeString());
        });
        incoming.on('open', update);
        incoming.on('close', () => { if (channel === incoming) fail('手机接收页已断开，可重新扫码。'); });
        incoming.on('error', () => { if (channel === incoming) fail('接收通道中断，请重新连接。'); });
        timer = setInterval(update, 500);
      });
      active.on('error', () => { if (peer === active) fail('无法建立连接。请检查网络，允许实时连接后重试。'); });
      active.on('disconnected', () => { if (peer === active && !channel?.open) fail('配对服务已断开，请重新连接。'); });
    } catch { fail('此浏览器无法启动配对，请在 HTTPS 网页中使用新版 Edge 或 Safari。'); }
  }
  $('connect').onclick = () => {
    $('pair-dialog').showModal();
    if (!peer) start();
  };
  $('pair-url').onclick = () => $('pair-url').select();
  $('pair-retry').onclick = start;
  $('pair-end').onclick = () => { release(); status('未连接', '已结束本次配对。'); $('pair-retry').hidden = false; };
  $('pair-close').onclick = () => $('pair-dialog').close();
  window.addEventListener('pagehide', () => { release(); status('未连接', '本次配对已结束。'); $('pair-retry').hidden = false; });
}
