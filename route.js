export const MAX_POINTS = 4000;
const EARTH_RADIUS = 6371008.8;
const radians = degrees => degrees * Math.PI / 180;
export const wrapLongitude = longitude => ((longitude + 180) % 360 + 360) % 360 - 180;

export function normalizePoints(points) {
  if (!Array.isArray(points) || points.length > MAX_POINTS) {
    throw new Error(`路线最多包含 ${MAX_POINTS} 个坐标点。`);
  }
  const normalized = [];
  for (const point of points) {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) ||
        Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180) {
      throw new Error('路线含有无效坐标，请检查经度和纬度。');
    }
    const previous = normalized.at(-1);
    if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) normalized.push([...point]);
  }
  return normalized;
}

export function isClosedRoute(points) {
  const first = points[0];
  const last = points.at(-1);
  return points.length >= 4 && first[0] === last[0] && first[1] === last[1];
}

export function canCloseRoute(points) {
  return points.length < MAX_POINTS && !isClosedRoute(points) &&
    new Set(points.map(point => `${point[0]},${point[1]}`)).size >= 3;
}

export function closeRoute(points) {
  const normalized = normalizePoints(points);
  if (new Set(normalized.map(point => `${point[0]},${point[1]}`)).size < 3) {
    throw new Error('闭合路线至少需要三个不同的点。');
  }
  if (isClosedRoute(normalized)) return normalized;
  if (normalized.length === MAX_POINTS) throw new Error('路线已达点数上限，撤销一个点后再闭合。');
  return [...normalized, [...normalized[0]]];
}

function validateSpeed(speed) {
  if (!Number.isFinite(speed) || speed < 1 || speed > 120) {
    throw new Error('速度应为 1–120 公里/小时。');
  }
}

function distance(from, to) {
  const deltaLatitude = radians(to[0] - from[0]);
  const deltaLongitude = radians(wrapLongitude(to[1] - from[1]));
  const h = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(radians(from[0])) *
    Math.cos(radians(to[0])) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function makeRoute(points, speed) {
  const normalized = normalizePoints(points);
  const offsets = normalized.length ? [0] : [];
  for (let i = 1; i < normalized.length; i++) {
    offsets.push(offsets[i - 1] + distance(normalized[i - 1], normalized[i]));
  }
  const metres = offsets.at(-1) ?? 0;
  return setRouteSpeed({ points: normalized, offsets, metres }, speed);
}

export function setRouteSpeed(route, speed) {
  validateSpeed(speed);
  return { ...route, speed, seconds: route.metres / (speed / 3.6) };
}

export function parsePace(text) {
  const match = /^(\d{1,2})[:：]([0-5]\d)$/.exec(text.trim());
  const seconds = match && Number(match[1]) * 60 + Number(match[2]);
  if (!seconds || seconds < 30 || seconds > 3600) throw new Error('配速请填 0:30 到 60:00，例如 5:30。');
  return 3600 / seconds;
}

export function formatPace(speed) {
  const seconds = Math.round(3600 / speed);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function tripSample(route, metres) {
  if (!route.metres || metres <= route.metres) return sampleAtDistance(route, metres);
  const cycle = isClosedRoute(route.points) ? route.metres : route.metres * 2;
  const phase = metres % cycle;
  const along = phase > route.metres ? cycle - phase : phase;
  return { point: sampleAtDistance(route, along).point, metres };
}

export function advancePlayback(route, current, seconds, target = route.metres) {
  const speed = route.speed / 3.6;
  const remaining = Math.max(0, target - current.metres);
  const delta = Math.max(0, seconds);
  if (delta >= remaining / speed) {
    return { metres: target, elapsed: current.elapsed + remaining / speed };
  }
  return { metres: current.metres + delta * speed, elapsed: current.elapsed + delta };
}

export function sampleAtDistance(route, distanceMetres) {
  if (!route.points.length) return null;
  const metres = Math.max(0, Math.min(route.metres, distanceMetres));
  if (!metres) return { point: route.points[0], metres: 0 };
  if (metres === route.metres) return { point: route.points.at(-1), metres };
  let low = 1;
  let high = route.offsets.length - 1;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (route.offsets[mid] < metres) low = mid + 1;
    else high = mid;
  }
  const start = route.points[low - 1];
  const end = route.points[low];
  const ratio = (metres - route.offsets[low - 1]) / (route.offsets[low] - route.offsets[low - 1]);
  return {
    point: [start[0] + (end[0] - start[0]) * ratio,
      wrapLongitude(start[1] + wrapLongitude(end[1] - start[1]) * ratio)],
    metres,
  };
}

export function sampleAt(route, seconds) {
  const elapsed = Math.max(0, Math.min(route.seconds, seconds));
  const sample = sampleAtDistance(route, elapsed === route.seconds ? route.metres : elapsed * route.speed / 3.6);
  return sample && { ...sample, elapsed };
}

function validTarget(metres) {
  return Number.isSafeInteger(metres) && metres >= 1 && metres <= 1_000_000;
}

export function encodeRoute({ points, speed, target }) {
  validateSpeed(speed);
  const pins = normalizePoints(points).map(point => point.map(value => Math.round(value * 1e6)));
  if (!pins.length) throw new Error('至少需要一个坐标点。');
  if (target != null && !validTarget(target)) throw new Error('目标距离超出范围。');
  const data = target == null ? [1, speed, pins] : [2, speed, pins, target];
  const code = btoa(JSON.stringify(data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (code.length > 7800) throw new Error('路线太长，请改用 GPX 文件分享。');
  return code;
}

export function decodeRoute(code) {
  try {
    if (!/^[\w-]{1,7800}$/.test(code)) throw new Error();
    const data = JSON.parse(atob(code.replace(/-/g, '+').replace(/_/g, '/')));
    if (!Array.isArray(data) || !Array.isArray(data[2]) ||
        !(data[0] === 1 && data.length === 3 || data[0] === 2 && data.length === 4 && validTarget(data[3]))) {
      throw new Error();
    }
    const [, speed, pins] = data;
    validateSpeed(speed);
    if (!pins.length || pins.length > MAX_POINTS || pins.some(point =>
      !Array.isArray(point) || !point.every(Number.isSafeInteger))) throw new Error();
    return { points: normalizePoints(pins.map(point => point.map(value => value / 1e6))), speed,
      ...(data[0] === 2 ? { target: data[3] } : {}) };
  } catch {
    throw new Error('路线链接无效，请重新分享或导入 GPX。');
  }
}
