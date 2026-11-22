import test from 'node:test';
import assert from 'node:assert/strict';
import { advancePlayback, decodeRoute, encodeRoute, makeRoute, normalizePoints, sampleAt, sampleAtDistance, setRouteSpeed } from '../route.js';

test('rejects coordinates outside the supported ranges and drops neighboring duplicates', () => {
  assert.deepEqual(normalizePoints([[12, 34], [12, 34], [13, 34]]), [[12, 34], [13, 34]]);
  for (const invalid of [[[91, 0]], [[0, 181]], [[null, 0]], [['', 0]], [[0, 0, 0]]]) {
    assert.throws(() => normalizePoints(invalid), /坐标/);
  }
});

test('advances proportionally to distance, clamps seeks, and reports the last sample', () => {
  const route = makeRoute([[0, 0], [0, 0.001], [0, 0.003]], 6);
  assert.ok(route.metres > 333 && route.metres < 335);
  assert.deepEqual(sampleAt(route, -10).point, [0, 0]);
  assert.ok(Math.abs(sampleAt(route, route.seconds / 2).point[1] - 0.0015) < 1e-9);
  assert.deepEqual(sampleAt(route, route.seconds + 2).point, [0, 0.003]);
});

test('a single position is stationary and a route crossing the date line stays near it', () => {
  assert.deepEqual(sampleAt(makeRoute([[12, 34]], 6), 10).point, [12, 34]);
  const short = makeRoute([[0, 179.9], [0, -179.9]], 6);
  assert.ok(short.metres < 23_000);
  assert.ok(Math.abs(sampleAt(short, short.seconds / 2).point[1]) > 179.99);
});

test('shares the route and speed and rejects corrupted fragment data', () => {
  const route = { points: [[12.123456, 34.123456], [12.2, 34.2]], speed: 6 };
  assert.deepEqual(decodeRoute(encodeRoute(route)), route);
  assert.throws(() => decodeRoute('not a route'), /路线链接/);
  assert.throws(() => encodeRoute({ ...route, speed: 0 }), /速度/);
});

test('changing live speed preserves position and elapsed time, then uses the new speed', () => {
  const route = makeRoute([[0, 0], [0, 0.01]], 3.6);
  const current = advancePlayback(route, { metres: 0, elapsed: 0 }, 20);
  assert.deepEqual(current, { metres: 20, elapsed: 20 });
  const fast = setRouteSpeed(route, 10.8);
  assert.deepEqual(sampleAtDistance(fast, current.metres), sampleAtDistance(route, current.metres));
  assert.deepEqual(advancePlayback(fast, current, 10), { metres: 50, elapsed: 30 });
});

test('elapsed time stops exactly at the route end, including a stationary point', () => {
  const route = makeRoute([[0, 0], [0, 0.001]], 3.6);
  const final = advancePlayback(route, { metres: route.metres - 3, elapsed: 20 }, 10);
  assert.deepEqual(final, { metres: route.metres, elapsed: 23 });
  const stationary = makeRoute([[12, 34]], 8);
  assert.deepEqual(advancePlayback(stationary, { metres: 0, elapsed: 0 }, 10), { metres: 0, elapsed: 0 });
});
