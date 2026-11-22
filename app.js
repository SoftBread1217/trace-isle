import { advancePlayback, decodeRoute, encodeRoute, makeRoute, MAX_POINTS, normalizePoints,
  sampleAtDistance, setRouteSpeed, wrapLongitude } from './route.js';

const $ = id => document.getElementById(id);
const L = window.L;
const example = [
  [-33.85662, 151.21527], [-33.85729, 151.21498], [-33.85803, 151.21443],
  [-33.85861, 151.21349], [-33.85948, 151.21323], [-33.86020, 151.21204],
];
const map = L.map('map', { minZoom: 2, maxZoom: 19, zoomControl: true }).setView(example[0], 16);
const routeLine = L.polyline([], { color: '#216851', weight: 4, opacity: .95, interactive: false }).addTo(map);
const cursor = L.circleMarker([0, 0], { radius: 8, color: '#fff', weight: 3, fillColor: '#0c4939', fillOpacity: 1, interactive: false });
const pins = L.layerGroup().addTo(map);
const tileCredit = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: tileCredit, maxZoom: 19 });
tiles.on('tileerror', () => { $('map-status').textContent = '底图暂不可用'; });
tiles.on('tileload', () => { $('map-status').textContent = ''; });

let route = makeRoute([], 5);
let title = '';
let drawing = false;
let pickingFixed = false;
let fixedPoint = null;
const initialMotion = () => ({ metres: 0, elapsed: 0 });
let motion = initialMotion();
let playbackRate = Number($('rate').value);
let mode = 'ready';
let frame = null;
let lastTick = null;
let lastPaint = 0;
let importRevision = 0;

function notify(message, error = false) {
  const element = $('notice');
  element.textContent = message;
  element.hidden = !message;
  element.classList.toggle('error', error);
}

function formatClock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const ss = String(whole % 60).padStart(2, '0');
  const mm = String(Math.floor(whole / 60) % 60).padStart(2, '0');
  return whole >= 3600 ? `${Math.floor(whole / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatDistance(metres) {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(2)} km`;
}

function visiblePoints(points) {
  const mapped = [];
  for (const [lat, lon] of points) {
    const previous = mapped.at(-1)?.[1] ?? lon;
    mapped.push([lat, previous + wrapLongitude(lon - previous)]);
  }
  return mapped;
}

function paintSample() {
  const sample = fixedPoint ? { point: fixedPoint, metres: 0 } : sampleAtDistance(route, motion.metres);
  if (sample) {
    const [lat, lon] = sample.point;
    $('lat-readout').textContent = lat.toFixed(6);
    $('lon-readout').textContent = lon.toFixed(6);
    $('distance-readout').textContent = formatDistance(sample.metres);
    $('speed-readout').textContent = `${!fixedPoint && mode === 'playing' ? route.speed.toFixed(1) : '0.0'} km/h`;
    const viewed = map.getCenter().lng;
    cursor.setLatLng([lat, viewed + wrapLongitude(lon - viewed)]);
    if (!map.hasLayer(cursor)) cursor.addTo(map);
  } else {
    for (const id of ['lat-readout', 'lon-readout', 'distance-readout', 'speed-readout']) $(id).textContent = '—';
    cursor.remove();
  }
  const remaining = Math.max(0, route.metres - motion.metres) / (route.speed / 3.6);
  $('total-time').textContent = fixedPoint || !route.points.length ? '—' : formatClock(Math.ceil(remaining));
  $('elapsed').textContent = fixedPoint ? '定点模式' : `已用 ${formatClock(motion.elapsed)}`;
  $('progress').value = !fixedPoint && route.metres ? String(Math.round(1000 * motion.metres / route.metres)) : '0';
}

function syncControls() {
  const count = route.points.length;
  $('state').textContent = ({ ready: '就绪', playing: '播放中', paused: '已暂停', done: '已结束', fixed: '固定点已发送' })[mode];
  if (!count) $('state').textContent = '等待路线';
  if (fixedPoint) {
    $('state').textContent = '固定定位';
    $('play').textContent = '固定点已应用';
  } else if (mode === 'playing') $('play').textContent = '暂停';
  else if (count === 1) $('play').textContent = '发送固定点';
  else if (mode === 'paused') $('play').textContent = '继续';
  else if (mode === 'done') $('play').textContent = '重新播放';
  else $('play').textContent = '播放';
  for (const id of ['share', 'export']) $(id).disabled = !(count || fixedPoint);
  for (const id of ['undo', 'clear']) $(id).disabled = !count;
  for (const id of ['play', 'reset']) {
    $(id).hidden = Boolean(fixedPoint);
    $(id).disabled = !count;
  }
  for (const id of ['speed', 'speed-slider', 'rate']) $(id).disabled = Boolean(fixedPoint);
  $('return-to-route').hidden = !fixedPoint;
  $('progress').disabled = !route.metres || Boolean(fixedPoint);
  $('draw').setAttribute('aria-pressed', String(drawing));
  $('draw').textContent = drawing ? '结束加点' : '地图加点';
  $('pick-fixed').setAttribute('aria-pressed', String(pickingFixed));
  $('map-hint').hidden = !drawing && !pickingFixed;
  $('map-hint').textContent = pickingFixed ? '点地图应用固定位置' : '点击地图添加坐标点';
  $('map').classList.toggle('drawing', drawing || pickingFixed);
  $('route-name').textContent = title || '用地图或经纬度添加坐标';
  $('point-count').textContent = `${count} 个点`;
  $('total-distance').textContent = fixedPoint ? '0 m' : count ? formatDistance(route.metres) : '—';
  for (const button of document.querySelectorAll('[data-speed-step]')) {
    button.disabled = Boolean(fixedPoint) || (Number(button.dataset.speedStep) < 0 ? route.speed <= 1 : route.speed >= 120);
  }
}

function stopFrame() {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  lastTick = null;
}

function changeRoute(points, name, { speed = route.speed, fit = false } = {}) {
  const next = makeRoute(points, speed);
  importRevision++;
  stopFrame();
  fixedPoint = null;
  pickingFixed = false;
  motion = initialMotion();
  mode = 'ready';
  title = next.points.length ? name : '';
  route = next;
  $('speed').value = String(speed);
  $('speed-slider').value = String(speed);
  const positions = visiblePoints(route.points);
  routeLine.setLatLngs(positions);
  pins.clearLayers();
  positions.slice(0, 36).forEach(position => {
    L.circleMarker(position, { radius: 3, color: '#15473a', weight: 1.5, fillOpacity: .65, interactive: false }).addTo(pins);
  });
  if (fit && positions.length === 1) map.setView(positions[0], 17);
  if (fit && positions.length > 1) map.fitBounds(routeLine.getBounds(), { padding: [35, 35], maxZoom: 17 });
  paintSample();
  syncControls();
}

function advanceTo(now) {
  if (mode !== 'playing') return;
  if (lastTick === null) lastTick = now;
  if (now > lastTick) {
    motion = advancePlayback(route, motion, (now - lastTick) / 1000 * playbackRate);
    lastTick = now;
  }
  if (motion.metres >= route.metres) {
    stopFrame();
    mode = 'done';
    syncControls();
  }
}

function tick(now) {
  advanceTo(now);
  if (now - lastPaint >= 75 || mode === 'done') {
    paintSample();
    lastPaint = now;
  }
  if (mode === 'playing') frame = requestAnimationFrame(tick);
}

function pause() {
  if (mode !== 'playing') return;
  advanceTo(performance.now());
  stopFrame();
  if (mode === 'playing') mode = 'paused';
  paintSample();
  syncControls();
}

function appendPoint(point) {
  changeRoute([...route.points, point], '手绘路线');
  notify('');
}

function applyFixedPoint(point, { centre = true } = {}) {
  const [fixed] = normalizePoints([point]);
  pause();
  importRevision++;
  fixedPoint = fixed;
  drawing = false;
  pickingFixed = false;
  $('latitude').value = fixed[0].toFixed(6);
  $('longitude').value = fixed[1].toFixed(6);
  if (centre) map.setView(fixed, Math.max(map.getZoom(), 16));
  paintSample();
  syncControls();
  notify('固定位置已发送到页面的定位接收器。');
}

function setSpeed(speed, source) {
  if (fixedPoint || speed === route.speed) return;
  const next = setRouteSpeed(route, speed);
  advanceTo(performance.now());
  route = next;
  if (source !== 'number') $('speed').value = String(speed);
  $('speed-slider').value = String(speed);
  paintSample();
  syncControls();
}

function setBasemap() {
  $('map-status').textContent = '';
  if ($('basemap').checked) tiles.addTo(map);
  else tiles.remove();
}

function readGPX(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('不支持包含文档类型或实体的 GPX。');
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  const find = name => [...xml.getElementsByTagNameNS('*', name)];
  if (find('parsererror').length || xml.documentElement?.localName !== 'gpx') throw new Error('文件不是有效的 GPX。');
  const tracks = find('trkseg').map(segment => [...segment.children].filter(point => point.localName === 'trkpt')).filter(points => points.length);
  const routes = find('rte').map(segment => [...segment.children].filter(point => point.localName === 'rtept')).filter(points => points.length);
  const groups = tracks.length ? tracks : routes.length ? routes : [find('wpt')];
  if (groups.length !== 1) throw new Error('这个 GPX 包含多段路线，请先导出想测试的单段路线。');
  const entries = groups[0];
  if (!entries.length) throw new Error('GPX 文件里没有坐标点。');
  if (entries.length > MAX_POINTS) throw new Error(`GPX 最多可导入 ${MAX_POINTS} 个点。`);
  return normalizePoints(entries.map(point => ['lat', 'lon'].map(name => {
    const value = point.getAttribute(name);
    return value?.trim() ? Number(value) : NaN;
  })));
}

$('play').onclick = () => {
  if (mode === 'playing') return pause();
  if (!route.points.length || fixedPoint) return;
  drawing = false;
  pickingFixed = false;
  if (!route.metres) {
    mode = 'fixed';
    paintSample();
  } else {
    if (motion.metres >= route.metres) motion = initialMotion();
    mode = 'playing';
    lastTick = performance.now();
    paintSample();
    frame = requestAnimationFrame(tick);
  }
  syncControls();
};
$('reset').onclick = () => { stopFrame(); mode = 'ready'; motion = initialMotion(); paintSample(); syncControls(); };
$('return-to-route').onclick = () => {
  fixedPoint = null;
  if (route.points.length === 1) map.setView(route.points[0], 17);
  if (route.points.length > 1) map.fitBounds(routeLine.getBounds(), { padding: [35, 35], maxZoom: 17 });
  paintSample();
  syncControls();
  notify('');
};
$('progress').oninput = () => {
  stopFrame();
  const fraction = Number($('progress').value) / 1000;
  motion = { metres: fraction * route.metres, elapsed: fraction * route.seconds };
  mode = fraction === 1 ? 'done' : 'paused';
  paintSample();
  syncControls();
};
$('speed').oninput = () => {
  if ($('speed').validity.valid && $('speed').value) setSpeed($('speed').valueAsNumber, 'number');
};
$('speed').onchange = () => {
  try {
    if (!$('speed').validity.valid) throw new Error('请输入 1–120 公里/小时，最多保留一位小数。');
    setSpeed($('speed').valueAsNumber);
    $('speed').value = String(route.speed);
    notify('');
  } catch (error) {
    $('speed').value = String(route.speed);
    notify(error.message, true);
  }
};
$('speed-slider').oninput = () => setSpeed($('speed-slider').valueAsNumber);
for (const button of document.querySelectorAll('[data-speed-step]')) {
  button.onclick = () => {
    const increased = Math.round((route.speed + Number(button.dataset.speedStep)) * 10) / 10;
    setSpeed(Math.max(1, Math.min(120, increased)));
  };
}
$('rate').onchange = () => {
  advanceTo(performance.now());
  playbackRate = Number($('rate').value);
  paintSample();
};
$('example').onclick = () => { drawing = false; changeRoute(example, '示例路线 · 悉尼海港', { fit: true }); notify(''); };
$('draw').onclick = () => { drawing = !drawing; pickingFixed = false; if (drawing) pause(); syncControls(); };
$('pick-fixed').onclick = () => { pickingFixed = !pickingFixed; drawing = false; syncControls(); };
$('undo').onclick = () => { changeRoute(route.points.slice(0, -1), title); notify(''); };
$('clear').onclick = () => { changeRoute([], ''); notify(''); };
$('basemap').onchange = setBasemap;
map.on('moveend', paintSample);
map.on('click', event => {
  if (!drawing && !pickingFixed) return;
  const point = [event.latlng.lat, wrapLongitude(event.latlng.lng)];
  try {
    if (pickingFixed) applyFixedPoint(point, { centre: false });
    else appendPoint(point);
  }
  catch (error) { notify(error.message, true); }
});
$('coordinate-form').onsubmit = event => {
  event.preventDefault();
  try {
    const point = [Number($('latitude').value), Number($('longitude').value)];
    if (event.submitter?.id === 'add-point') {
      appendPoint(point);
      map.setView(point, Math.max(map.getZoom(), 16));
    } else applyFixedPoint(point);
  } catch (error) { notify(error.message, true); }
};
$('import').onclick = () => $('gpx').click();
$('gpx').onchange = async () => {
  const file = $('gpx').files[0];
  $('gpx').value = '';
  if (!file) return;
  const revision = ++importRevision;
  try {
    if (file.size > 2_000_000) throw new Error('GPX 文件大小不能超过 2 MB。');
    const points = readGPX(await file.text());
    if (revision !== importRevision) return;
    drawing = false;
    changeRoute(points, file.name, { fit: true });
    notify(`导入成功，共 ${points.length} 个坐标点。`);
  } catch (error) { if (revision === importRevision) notify(error.message, true); }
};
$('export').onclick = () => {
  const selected = fixedPoint ? [fixedPoint] : route.points;
  const pointTag = selected.length === 1 ? 'wpt' : 'trkpt';
  const points = selected.map(([lat, lon]) => `<${pointTag} lat="${lat}" lon="${lon}"/>`).join('\n');
  const body = selected.length === 1 ? points : `<trk><name>Trace Isle</name><trkseg>${points}</trkseg></trk>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Trace Isle" xmlns="http://www.topografix.com/GPX/1/1">${body}</gpx>`;
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/gpx+xml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'trace-isle.gpx';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 20_000);
};
$('share').onclick = () => {
  try {
    const url = new URL(location.href);
    url.hash = `route=${encodeRoute(fixedPoint ? { points: [fixedPoint], speed: route.speed } : route)}`;
    $('share-url').value = url.href;
    $('share-status').textContent = '';
    $('share-dialog').showModal();
  } catch (error) { notify(error.message, true); }
};
$('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('share-url').value);
    $('share-status').textContent = '已复制。';
  } catch {
    $('share-url').focus();
    $('share-url').select();
    $('share-status').textContent = '链接已选中，可以手动复制。';
  }
};
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

setBasemap();
changeRoute(example, '示例路线 · 悉尼海港', { fit: true });
if (location.hash.startsWith('#route=')) {
  try {
    const { points, speed } = decodeRoute(location.hash.slice(7));
    changeRoute(points, '分享的测试路线', { speed, fit: true });
  } catch (error) { notify(error.message, true); }
}
