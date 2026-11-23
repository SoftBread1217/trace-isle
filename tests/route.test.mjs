import test from 'node:test';
import assert from 'node:assert/strict';
import { advancePlayback, closeRoute, decodeRoute, encodeRoute, makeRoute, normalizePoints, sampleAt, sampleAtDistance, setRouteSpeed } from '../route.js';
import { LINGSHUI_STADIUM } from '../presets.js';
import { parsePace, formatPace, tripSample } from '../route.js';

test('pace, target and legacy sharing use the same distance and time units', () => {
  assert.equal(formatPace(parsePace('5：30')), '5:30');
  for (const wrong of ['5.30', '6:60', '0:00', '61:00']) assert.throws(() => parsePace(wrong));
  const route = makeRoute(LINGSHUI_STADIUM.points, parsePace('5:30'));
  const finish = advancePlayback(route, { metres: 0, elapsed: 0 }, 3000, 2000);
  assert.equal(finish.metres, 2000);
  assert.ok(Math.abs(finish.elapsed - 660) < 1e-8);
  assert.equal(decodeRoute(encodeRoute({ ...route, target: 2000 })).target, 2000);
  assert.throws(() => encodeRoute({ ...route, target: -1 }));
});

test('a longer trip loops a circuit and reverses smoothly on an open route', () => {
  for (const points of [LINGSHUI_STADIUM.points, [[0, 0], [0, .01]]]) {
    const route = makeRoute(points, 10);
    const m = route.metres;
    const after = tripSample(route, m * 1.25);
    const expected = sampleAtDistance(route, m * (points.length === 2 ? .75 : .25));
    assert.equal(after.metres, m * 1.25);
    expected.point.forEach((v, i) => assert.ok(Math.abs(after.point[i] - v) < 1e-9));
    assert.deepEqual(tripSample(route, 2 * m).point, points[0]);
  }
});

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

test('closing a route adds the return leg once and requires three distinct points', () => {
  const open = [[18.4, 110.01], [18.4003, 110.01], [18.4003, 110.011]];
  const closed = closeRoute(open);
  assert.deepEqual(closed, [...open, open[0]]);
  assert.deepEqual(closeRoute(closed), closed);
  assert.ok(makeRoute(closed, 5).metres > makeRoute(open, 5).metres);
  assert.throws(() => closeRoute([open[0], open[1], open[0]]), /三个不同/);
});

test('Lingshui stadium is a playable closed demo route', () => {
  const points = LINGSHUI_STADIUM.points;
  assert.deepEqual(points[0], points.at(-1));
  const route = makeRoute(points, 5);
  assert.ok(route.metres > 300 && route.metres < 500);
  assert.notDeepEqual(sampleAtDistance(route, route.metres / 2).point, points[0]);
  assert.deepEqual(decodeRoute(encodeRoute(route)).points[0], points[0]);
});
