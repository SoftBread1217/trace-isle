import { decodeRoute, encodeRoute, makeRoute, MAX_POINTS, normalizePoints, sampleAt, wrapLongitude } from './route.js';

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
let elapsed = 0;
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
  const sample = sampleAt(route, elapsed);
  if (sample) {
    const [lat, lon] = sample.point;
    $('lat-readout').textContent = lat.toFixed(6);
    $('lon-readout').textContent = lon.toFixed(6);
    $('distance-readout').textContent = formatDistance(sample.metres);
    const viewed = map.getCenter().lng;
    cursor.setLatLng([lat, viewed + wrapLongitude(lon - viewed)]);
    if (!map.hasLayer(cursor)) cursor.addTo(map);
  } else {
    for (const id of ['lat-readout', 'lon-readout', 'distance-readout']) $(id).textContent = '—';
    cursor.remove();
  }
  $('elapsed').textContent = `${formatClock(elapsed)} / ${formatClock(route.seconds)}`;
  $('progress').value = route.seconds ? String(Math.round(1000 * elapsed / route.seconds)) : '0';
}

function syncControls() {
  const count = route.points.length;
  $('state').textContent = ({ ready: '就绪', playing: '播放中', paused: '已暂停', done: '已结束', fixed: '固定点已发送' })[mode];
  if (!count) $('state').textContent = '等待路线';
  if (mode === 'playing') $('play').textContent = '暂停';
  else if (count === 1) $('play').textContent = '发送固定点';
  else if (mode === 'paused') $('play').textContent = '继续';
  else if (mode === 'done') $('play').textContent = '重新播放';
  else $('play').textContent = '播放';
  for (const id of ['play', 'share', 'export', 'undo', 'clear', 'reset']) $(id).disabled = !count;
  $('progress').disabled = !route.seconds;
  $('draw').setAttribute('aria-pressed', String(drawing));
  $('draw').textContent = drawing ? '结束加点' : '地图加点';
  $('map-hint').hidden = !drawing;
  $('map').classList.toggle('drawing', drawing);
  $('route-name').textContent = title || '用地图或经纬度添加坐标';
  $('point-count').textContent = `${count} 个点`;
  $('total-distance').textContent = count ? formatDistance(route.metres) : '—';
  $('total-time').textContent = count ? formatClock(Math.ceil(route.seconds)) : '—';
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
  elapsed = 0;
  mode = 'ready';
  title = next.points.length ? name : '';
  route = next;
  $('speed').value = String(speed);
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

function tick(now) {
  if (mode !== 'playing') return;
  if (lastTick !== null) elapsed = Math.min(route.seconds, elapsed + (now - lastTick) / 1000 * Number($('rate').value));
  lastTick = now;
  if (now - lastPaint >= 75 || elapsed >= route.seconds) {
    paintSample();
    lastPaint = now;
  }
  if (elapsed >= route.seconds) {
    stopFrame();
    mode = 'done';
    syncControls();
    return;
  }
  frame = requestAnimationFrame(tick);
}

function pause() {
  if (mode !== 'playing') return;
  stopFrame();
  mode = 'paused';
  paintSample();
  syncControls();
}

function appendPoint(point) {
  changeRoute([...route.points, point], '手绘路线');
  notify('');
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
  if (!route.points.length) return;
  drawing = false;
  if (!route.seconds) {
    mode = 'fixed';
    paintSample();
  } else {
    if (elapsed >= route.seconds) elapsed = 0;
    mode = 'playing';
    paintSample();
    frame = requestAnimationFrame(tick);
  }
  syncControls();
};
$('reset').onclick = () => { stopFrame(); mode = 'ready'; elapsed = 0; paintSample(); syncControls(); };
$('progress').oninput = () => {
  stopFrame();
  elapsed = Number($('progress').value) / 1000 * route.seconds;
  mode = elapsed === route.seconds ? 'done' : 'paused';
  paintSample();
  syncControls();
};
$('speed').onchange = () => {
  const fraction = route.seconds ? elapsed / route.seconds : 0;
  try {
    const updated = makeRoute(route.points, Number($('speed').value));
    route = updated;
    elapsed = fraction * updated.seconds;
    lastTick = null;
    paintSample();
    syncControls();
    notify('');
  } catch (error) {
    $('speed').value = String(route.speed);
    notify(error.message, true);
  }
};
$('example').onclick = () => { drawing = false; changeRoute(example, '示例路线 · 悉尼海港', { fit: true }); notify(''); };
$('draw').onclick = () => { drawing = !drawing; if (drawing) pause(); syncControls(); };
$('undo').onclick = () => { changeRoute(route.points.slice(0, -1), title); notify(''); };
$('clear').onclick = () => { changeRoute([], ''); notify(''); };
$('basemap').onchange = setBasemap;
map.on('moveend', paintSample);
map.on('click', event => {
  if (!drawing) return;
  try { appendPoint([event.latlng.lat, wrapLongitude(event.latlng.lng)]); }
  catch (error) { notify(error.message, true); }
});
$('coordinate-form').onsubmit = event => {
  event.preventDefault();
  try {
    const point = [Number($('latitude').value), Number($('longitude').value)];
    appendPoint(point);
    map.setView(point, Math.max(map.getZoom(), 16));
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
  const pointTag = route.points.length === 1 ? 'wpt' : 'trkpt';
  const points = route.points.map(([lat, lon]) => `<${pointTag} lat="${lat}" lon="${lon}"/>`).join('\n');
  const body = route.points.length === 1 ? points : `<trk><name>Trace Isle</name><trkseg>${points}</trkseg></trk>`;
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
    url.hash = `route=${encodeRoute(route)}`;
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
