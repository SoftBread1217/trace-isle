import { advancePlayback, canCloseRoute, closeRoute, decodeRoute, encodeRoute, isClosedRoute, makeRoute,
  MAX_POINTS, normalizePoints, tripSample, parsePace, formatPace, setRouteSpeed, wrapLongitude } from './route.js?v=4';
import { setupPairing } from './pair.js?v=5';
import { setupUSB } from './usb.js?v=5';
import { LINGSHUI_STADIUM, SYDNEY_HARBOUR } from './presets.js?v=3';

const $ = id => document.getElementById(id);
const L = window.L;
const map = L.map('map', { minZoom: 2, maxZoom: 19, zoomControl: true }).setView(SYDNEY_HARBOUR.points[0], 16);
const routeLine = L.polyline([], { color: '#216851', weight: 4, opacity: .95, interactive: false }).addTo(map);
const cursor = L.circleMarker([0, 0], { radius: 8, color: '#fff', weight: 3, fillColor: '#0c4939', fillOpacity: 1, interactive: false });
const pins = L.layerGroup().addTo(map);
const tileCredit = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: tileCredit, maxZoom: 19 });
tiles.on('tileerror', () => { $('map-status').textContent = '底图暂不可用'; });
tiles.on('tileload', () => { $('map-status').textContent = ''; });

let route = makeRoute([], 10);
let target = null;
const tripLength = () => route.metres ? target ?? route.metres : 0;
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
  const sample = fixedPoint ? { point: fixedPoint, metres: 0 } : tripSample(route, motion.metres);
  if (sample) {
    const [lat, lon] = sample.point;
    $('lat-readout').textContent = lat.toFixed(6);
    $('lon-readout').textContent = lon.toFixed(6);
    $('distance-readout').textContent = formatDistance(sample.metres);
    $('speed-readout').textContent = !fixedPoint && mode === 'playing' ? formatPace(route.speed) + ' /km' : '—';
    const viewed = map.getCenter().lng;
    cursor.setLatLng([lat, viewed + wrapLongitude(lon - viewed)]);
    if (!map.hasLayer(cursor)) cursor.addTo(map);
  } else {
    for (const id of ['lat-readout', 'lon-readout', 'distance-readout', 'speed-readout']) $(id).textContent = '—';
    cursor.remove();
  }
  const remaining = Math.max(0, tripLength() - motion.metres) / (route.speed / 3.6);
  $('total-time').textContent = fixedPoint || !route.points.length ? '—' : formatClock(Math.ceil(remaining - 1e-9));
  $('elapsed').textContent = fixedPoint ? '定点模式' : `已用 ${formatClock(motion.elapsed)}`;
  $('progress').value = !fixedPoint && tripLength() ? String(Math.round(1000 * motion.metres / tripLength())) : '0';
}

function syncControls() {
  const count = route.points.length;
  $('state').textContent = ({ ready: '就绪', playing: '播放中', paused: '已暂停', done: '已结束', fixed: '固定点已发送' })[mode];
  if (!count) $('state').textContent = '等待路线';
  if (fixedPoint) {
    $('state').textContent = '固定定位';
    $('play').textContent = '固定点已应用';
  } else if (drawing) {
    $('state').textContent = '画线中';
    $('play').textContent = count < 2 ? '轨迹至少需要两个点' : '先完成画线';
  } else if (mode === 'playing') $('play').textContent = '暂停';
  else if (count === 1) $('play').textContent = '发送固定点';
  else if (mode === 'paused') $('play').textContent = '继续';
  else if (mode === 'done') $('play').textContent = '重新播放';
  else $('play').textContent = '播放轨迹';
  for (const id of ['share', 'export']) $(id).disabled = !(count || fixedPoint) || drawing;
  for (const id of ['undo', 'clear']) $(id).disabled = !count;
  for (const id of ['play', 'reset']) {
    $(id).hidden = Boolean(fixedPoint);
    $(id).disabled = !count || drawing;
  }
  for (const id of ['pace', 'rate', 'target']) $(id).disabled = Boolean(fixedPoint) || !route.metres;
  $('return-to-route').hidden = !fixedPoint;
  $('progress').disabled = !route.metres || Boolean(fixedPoint) || drawing;
  $('draw').setAttribute('aria-pressed', String(drawing));
  $('draw').textContent = drawing ? '完成画线' : '地图画轨迹';
  $('close-route').disabled = !drawing || !canCloseRoute(route.points);
  $('pick-fixed').setAttribute('aria-pressed', String(pickingFixed));
  $('map-hint').hidden = !drawing && !pickingFixed;
  $('map-hint').textContent = pickingFixed ? '点地图应用固定位置'
    : count < 2 ? '依次点击地图，选至少两个不同的点' : '继续加点，或完成／闭合路线';
  $('map').classList.toggle('drawing', drawing || pickingFixed);
  $('route-name').textContent = title || '用地图或经纬度添加坐标';
  $('point-count').textContent = `${count} 个点${isClosedRoute(route.points) ? ' · 已闭合' : ''}`;
  $('total-distance').textContent = fixedPoint ? '0 m' : count ? formatDistance(route.metres) : '—';
  const repeat = isClosedRoute(route.points) ? '超过一圈会继续绕圈' : '超过原长会沿原路折返';
  $('trip-hint').textContent = route.metres && !fixedPoint ? `本次回放 ${formatDistance(tripLength())} · ${repeat}。` : '';
  for (const button of document.querySelectorAll('[data-pace-step]')) {
    button.disabled = $('pace').disabled || (Number(button.dataset.paceStep) < 0 ? route.speed >= 120 : route.speed <= 1);
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
  $('pace').value = formatPace(speed);
  $('setting-error').textContent = '';
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
    motion = advancePlayback(route, motion, (now - lastTick) / 1000 * playbackRate, tripLength());
    lastTick = now;
  }
  if (motion.metres >= tripLength()) {
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
  const points = isClosedRoute(route.points) ? route.points.slice(0, -1) : route.points;
  if (points.length === 0) drawing = true;
  changeRoute([...points, point], '手绘路线');
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

function setSpeed(speed) {
  if (fixedPoint || speed === route.speed) return;
  const next = setRouteSpeed(route, speed);
  advanceTo(performance.now());
  route = next;
  $('pace').value = formatPace(speed);
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
  if (!route.points.length || fixedPoint || drawing) return;
  drawing = false;
  pickingFixed = false;
  if (!route.metres) {
    mode = 'fixed';
    paintSample();
  } else {
    if (motion.metres >= tripLength()) motion = initialMotion();
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
  motion = { metres: fraction * tripLength(), elapsed: fraction * tripLength() / (route.speed / 3.6) };
  mode = fraction === 1 ? 'done' : 'paused';
  paintSample();
  syncControls();
};
$('pace').onchange = () => {
  try {
    setSpeed(parsePace($('pace').value));
    $('setting-error').textContent = '';
  } catch (error) {
    $('setting-error').textContent = error.message;
  }
  $('pace').value = formatPace(route.speed);
};
$('target').onchange = () => {
  const field = $('target');
  const next = field.value ? Math.round(field.valueAsNumber * 1000) : null;
  advanceTo(performance.now());
  if (!field.validity.valid || (next ?? route.metres) < motion.metres) {
    field.value = target === null ? '' : String(target / 1000);
    $('setting-error').textContent = '目标须在 0.001–1000 公里内，且不能短于已走距离。缩短行程前可先重置。';
    return;
  }
  target = next;
  if (mode === 'done' && motion.metres < tripLength()) mode = 'paused';
  advanceTo(performance.now());
  $('setting-error').textContent = '';
  paintSample();
  syncControls();
};
for (const input of [$('pace'), $('target')]) {
  input.onkeydown = event => { if (event.key === 'Enter') input.blur(); };
}
for (const button of document.querySelectorAll('[data-pace-step]')) {
  button.onclick = () => {
    const seconds = Math.round(3600 / route.speed) + Number(button.dataset.paceStep);
    setSpeed(3600 / Math.max(30, Math.min(3600, seconds)));
    $('setting-error').textContent = '';
  };
}
$('rate').onchange = () => {
  advanceTo(performance.now());
  playbackRate = Number($('rate').value);
  paintSample();
};
function loadPreset(preset) {
  drawing = false;
  changeRoute(preset.points, preset.name, { fit: true });
  notify('');
}

$('example').onclick = () => loadPreset(SYDNEY_HARBOUR);
$('stadium').onclick = () => loadPreset(LINGSHUI_STADIUM);
$('draw').onclick = () => {
  if (drawing && route.points.length === 1) {
    notify('再在地图上点一个不同的位置，就可以完成轨迹。', true);
    return;
  }
  drawing = !drawing;
  pickingFixed = false;
  if (drawing) {
    fixedPoint = null;
    pause();
    paintSample();
  }
  syncControls();
  notify('');
};
$('close-route').onclick = () => {
  try {
    const points = closeRoute(route.points);
    drawing = false;
    changeRoute(points, title);
    notify('已把轨迹终点连接回起点。');
  } catch (error) { notify(error.message, true); }
};
$('pick-fixed').onclick = () => { pickingFixed = !pickingFixed; drawing = false; if (pickingFixed) pause(); syncControls(); };
$('undo').onclick = () => {
  if (route.points.length === 2) drawing = true;
  changeRoute(route.points.slice(0, -1), title);
  notify('');
};
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
    url.hash = `route=${encodeRoute(fixedPoint ? { points: [fixedPoint], speed: route.speed } : { ...route, target })}`;
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
loadPreset(SYDNEY_HARBOUR);
if (location.hash.startsWith('#route=')) {
  try {
    const shared = decodeRoute(location.hash.slice(7));
    const { points, speed } = shared;
    target = shared.target ?? null;
    $('target').value = target == null ? '' : String(target / 1000);
    changeRoute(points, '分享的测试路线', { speed, fit: true });
  } catch (error) { notify(error.message, true); }
}
setupPairing(() => ({
  lat: $('lat-readout').textContent, lon: $('lon-readout').textContent,
  distance: $('distance-readout').textContent, pace: $('speed-readout').textContent,
  mode: $('state').textContent
}));
setupUSB(() => fixedPoint ?? tripSample(route, motion.metres)?.point,
  () => 'route=' + encodeRoute(fixedPoint ? { points: [fixedPoint], speed: route.speed } : { ...route, target }));
