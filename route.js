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
  validateSpeed(speed);
  const normalized = normalizePoints(points);
  const offsets = normalized.length ? [0] : [];
  for (let i = 1; i < normalized.length; i++) {
    offsets.push(offsets[i - 1] + distance(normalized[i - 1], normalized[i]));
  }
  const metres = offsets.at(-1) ?? 0;
  return { points: normalized, offsets, metres, seconds: metres / (speed / 3.6), speed };
}

export function sampleAt(route, seconds) {
  if (!route.points.length) return null;
  const elapsed = Math.max(0, Math.min(route.seconds, seconds));
  if (!elapsed) return { point: route.points[0], metres: 0, elapsed };
  if (elapsed === route.seconds) return { point: route.points.at(-1), metres: route.metres, elapsed };
  const metres = elapsed * route.speed / 3.6;
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
    elapsed,
  };
}

export function encodeRoute({ points, speed }) {
  validateSpeed(speed);
  const pins = normalizePoints(points).map(point => point.map(value => Math.round(value * 1e6)));
  if (!pins.length) throw new Error('至少需要一个坐标点。');
  const code = btoa(JSON.stringify([1, speed, pins])).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (code.length > 7800) throw new Error('路线太长，请改用 GPX 文件分享。');
  return code;
}

export function decodeRoute(code) {
  try {
    if (!/^[\w-]{1,7800}$/.test(code)) throw new Error();
    const data = JSON.parse(atob(code.replace(/-/g, '+').replace(/_/g, '/')));
    if (!Array.isArray(data) || data.length !== 3 || data[0] !== 1 || !Array.isArray(data[2])) {
      throw new Error();
    }
    const [, speed, pins] = data;
    validateSpeed(speed);
    if (!pins.length || pins.length > MAX_POINTS || pins.some(point =>
      !Array.isArray(point) || !point.every(Number.isSafeInteger))) throw new Error();
    return { points: normalizePoints(pins.map(point => point.map(value => value / 1e6))), speed };
  } catch {
    throw new Error('路线链接无效，请重新分享或导入 GPX。');
  }
}
