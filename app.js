import { advancePlayback, canCloseRoute, closeRoute, decodeRoute, encodeRoute, isClosedRoute, makeRoute,
  MAX_POINTS, normalizePoints, tripSample, parsePace, formatPace, setRouteSpeed, wrapLongitude } from './route.js?v=14';
import { setupUSB } from './usb.js?v=14';
import { LINGSHUI_STADIUM, QUEEN_MARY_MILE_END, setupCampusFinder, sharedTrackPoints, streetBasemap } from './presets.js?v=14';

const $ = id => document.getElementById(id);
const L = window.L;
const map = L.map('map', { minZoom: 2, maxZoom: 19, zoomControl: true }).setView(LINGSHUI_STADIUM.points[0], 16);
const routeLine = L.polyline([], { color: '#216851', weight: 4, opacity: .95, interactive: false }).addTo(map);
const cursor = L.circleMarker([0, 0], { radius: 8, color: '#fff', weight: 3, fillColor: '#0c4939', fillOpacity: 1, interactive: false });
const pins = L.layerGroup().addTo(map);
const tiles = streetBasemap(L, $('map-status'));

let route = makeRoute([], 10);
let target = null;
const tripLength = () => route.metres ? target ?? route.metres : 0;
let title = '';
let fieldName = '';
let drawing = false;
let pickingFixed = false;
let fixedPoint = null;
const initialMotion = () => ({ metres: 0, elapsed: 0 });
let motion = initialMotion();
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
  const sample = pickingFixed ? null : fixedPoint ? { point: fixedPoint, metres: 0 } : tripSample(route, motion.metres);
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
  $('player-title').closest('.player').toggleAttribute('data-playing', mode === 'playing');
  const fixedMode = Boolean(fixedPoint || pickingFixed || (count === 1 && !drawing));
  $('player-title').textContent = fixedMode ? '固定点定位' : '动态模拟';
  $('route-mode').setAttribute('aria-pressed', String(!fixedMode));
  $('pick-fixed').setAttribute('aria-pressed', String(fixedMode));
  $('state').textContent = ({ ready: '就绪', playing: '模拟中', paused: '已暂停', done: '已完成', fixed: '固定定位中' })[mode];
  if (drawing) $('state').textContent = '绘制中';
  else if (pickingFixed) $('state').textContent = '请选择位置';
  else if (!count && !fixedPoint) $('state').textContent = '等待路线';
  $('play').textContent = fixedMode ? '应用固定点' : mode === 'playing' ? '暂停' : mode === 'paused' ? '继续模拟' : '开始模拟';
  $('play').disabled = drawing || pickingFixed || (!count && !fixedPoint);
  $('reset').disabled = !count && !fixedMode;
  $('export').disabled = drawing || !(count || fixedPoint);
  for (const id of ['undo','clear']) $(id).disabled = !count;
  $('target').closest('.settings').hidden = fixedMode;
  $('total-distance').closest('.stats').hidden = fixedMode;
  $('distance-readout').parentElement.hidden = fixedMode;
  $('speed-readout').parentElement.hidden = fixedMode;
  if (fixedMode) {
    routeLine.remove();
    pins.remove();
  } else {
    routeLine.addTo(map);
    pins.addTo(map);
  }
  $('progress').hidden = fixedMode;
  $('elapsed').parentElement.hidden = fixedMode;
  $('trip-hint').hidden = fixedMode;
  for (const id of ['pace','target']) $(id).disabled = fixedMode || !route.metres;
  $('draw').setAttribute('aria-pressed', String(drawing));
  $('draw').textContent = drawing ? '完成画线' : '地图画轨迹';
  $('close-route').disabled = !drawing || !canCloseRoute(route.points);
  $('map-hint').hidden = !drawing && !pickingFixed;
  $('map-hint').textContent = pickingFixed ? '点击地图选择固定位置'
    : count < 2 ? '依次点击地图，选至少两个不同的点' : '继续加点，或完成／闭合路线';
  $('map').classList.toggle('drawing', drawing || pickingFixed);
  $('route-name').textContent = fixedMode ? '点击地图或输入经纬度选择位置' : title || '用地图或经纬度添加坐标';
  $('point-count').textContent = fixedMode ? (pickingFixed ? '等待选点' : '1 个固定点') : `${count} 个点${isClosedRoute(route.points) ? ' · 已闭合' : ''}`;
  $('total-distance').textContent = fixedPoint ? '0 m' : count ? formatDistance(route.metres) : '—';
  const repeat = isClosedRoute(route.points) ? '超过一圈会继续绕圈' : '超过原长会沿原路折返';
  $('trip-hint').textContent = route.metres && !fixedPoint ? `模拟距离 ${formatDistance(tripLength())} · ${repeat}。` : '';

}

function stopFrame() {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  lastTick = null;
}

function changeRoute(points, name, { speed = route.speed, fit = false } = {}) {
  const next = makeRoute(points, speed);
  usb.release();
  fieldName = '';
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
    motion = advancePlayback(route, motion, (now - lastTick) / 1000, tripLength());
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
  usb.release();
  mode = 'ready';
  importRevision++;
  fixedPoint = fixed;
  drawing = false;
  pickingFixed = false;
  $('latitude').value = fixed[0].toFixed(6);
  $('longitude').value = fixed[1].toFixed(6);
  if (centre) map.setView(fixed, Math.max(map.getZoom(), 16));
  paintSample();
  syncControls();
  notify('已选择坐标，点「应用固定点」同步到 iPhone。');
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
  if (!$('field-picker').hidden) closePicker();
  if (mode === 'playing') return pause();
  if ((!route.points.length && !fixedPoint) || drawing || pickingFixed || !usb.requireReady()) return;
  if (fixedPoint || !route.metres) {
    mode = 'fixed';
  } else {
    if (motion.metres >= tripLength()) motion = initialMotion();
    mode = 'playing';
    lastTick = performance.now();
    frame = requestAnimationFrame(tick);
  }
  usb.start();
  paintSample();
  syncControls();
};
$('reset').onclick = () => {
  stopFrame();
  if (fixedPoint || pickingFixed || route.points.length === 1) {
    usb.release(); fixedPoint = null; pickingFixed = false;
    if (route.points.length === 1) changeRoute([], '');
  }
  mode = 'ready'; motion = initialMotion();
  paintSample(); syncControls(); notify('');
};
$('route-mode').onclick = () => {
  if (!fixedPoint && !pickingFixed && route.points.length !== 1) return;
  usb.release();
  fixedPoint = null; pickingFixed = false; mode = 'ready'; motion = initialMotion();
  if (route.points.length === 1) changeRoute([], '');
  if (route.points.length > 1) map.fitBounds(routeLine.getBounds(), { padding: [35,35], maxZoom:17 });
  paintSample(); syncControls(); notify('');
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
function loadPreset(preset) {
  drawing = false;
  changeRoute(preset.points, preset.name, { fit: true });
  notify('');
}

$('example').onclick = () => { closePicker(); loadPreset(QUEEN_MARY_MILE_END); };
$('stadium').onclick = () => { closePicker(); loadPreset(LINGSHUI_STADIUM); };
$('draw').onclick = () => {
  if (drawing && route.points.length === 1) {
    notify('再在地图上点一个不同的位置，就可以完成轨迹。', true);
    return;
  }
  drawing = !drawing;
  pickingFixed = false;
  if (drawing) {
    usb.release();
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
$('pick-fixed').onclick = () => {
  pause(); usb.release(); mode = 'ready'; pickingFixed = true; drawing = false;
  paintSample(); syncControls();
};
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
function routeFragment() {
  const params = new URLSearchParams();
  params.set('route', encodeRoute(fixedPoint ? { points: [fixedPoint], speed: route.speed } : { ...route, target }));
  if (!fixedPoint && fieldName) params.set('field', fieldName);
  return params.toString();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

const usb = setupUSB(() => fixedPoint ?? tripSample(route, motion.metres)?.point, routeFragment, () => {
  pause();
  if (mode === 'fixed') mode = 'ready';
  syncControls();
});
changeRoute([], '');
if (location.hash.startsWith('#route=')) {
  try {
    const params = new URLSearchParams(location.hash.slice(1));
    const shared = decodeRoute(params.get('route'));
    const { points, speed } = shared;
    target = shared.target ?? null;
    $('target').value = target == null ? '' : String(target / 1000);
    const field = (params.get('field') || '').slice(0,160);
    changeRoute(sharedTrackPoints(points, field), field || '已导入路线', { speed, fit: true });
    fieldName = field;
    syncControls();
    if (field) $('school-status').textContent = '已载入操场：' + field;
  } catch (error) { notify(error.message, true); }
}
else if (new URLSearchParams(location.search).get('preset') === 'mile-end') {
  loadPreset(QUEEN_MARY_MILE_END);
}
setBasemap();
const closePicker = setupCampusFinder({L, showRoute: () => map.invalidateSize({pan:false}), measure: points => makeRoute(points, 10).metres, use(points, name) {
  loadPreset({points, name});
  fieldName = name;
  syncControls();
}});
