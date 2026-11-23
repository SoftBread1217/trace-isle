import test from 'node:test';
import { readFileSync } from 'node:fs';
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

import { stadiumLoop, fitOval, searchSchools, nearbyVenues, ovalPoint } from '../presets.js';

test('stadium template has two straights and closed turns, at any angle', () => {
  for(const bearing of [0,32,91,155]) {
    const model={center:[30,120],length:160,width:60,bearing};
    const points=stadiumLoop(model);
    assert.deepEqual(points.at(-1),points[0]);
    assert.ok(Math.abs(makeRoute(points,10).metres-(200+60*Math.PI))<1);
    const outline=[[80,30],[80,-30],[-80,-30],[-80,30],[80,30]].map(([u,v])=>ovalPoint(model,u,v));
    const fit=fitOval(model.center,outline);
    assert.ok(Math.abs(fit.bearing-bearing)<=2);
    assert.ok(fit.length>fit.width);
  }
});
test('search matches aliases and separate campuses; nearby venues deduplicate lanes',()=>{
  const rows=[['浙江大学紫金港校区','杭州','',30,120,[]],['浙江大学玉泉校区','杭州','',30,120,[]]];
  assert.equal(searchSchools(rows,'浙大').length,2);
  assert.deepEqual(searchSchools(rows,'浙大 紫金港'),[rows[0]]);
  const venues=[[1,'',30,120,0,[]],[2,'田径场',30.0001,120,1,[0,0,10,10,0,0]],[3,'别处',31,120,0,[]]];
  assert.deepEqual(nearbyVenues(venues,rows[0]),[]);
  const verified=[...rows[0],{fieldIds:[1,2]}];
  assert.deepEqual(nearbyVenues(venues,verified).map(v=>v.id),[2]);
  assert.deepEqual(nearbyVenues([] ,rows[0]),[]);
});

test('BUPT school search distinguishes three teaching campuses from specifically named institutions', () => {
  const { schools } = JSON.parse(readFileSync(new URL('../campus-data/schools.json', import.meta.url)));
  const campuses = searchSchools(schools, '北邮');
  assert.equal(campuses.length, 3);
  assert.deepEqual(searchSchools(schools, '北京邮电大学'), campuses);
  for (const [i, label] of ['海淀','沙河','海南'].entries()) {
    assert.deepEqual(searchSchools(schools, '北邮'+label), [campuses[i]]);
  }
  assert.equal(searchSchools(schools, '北邮宏福').length, 1);
  assert.equal(searchSchools(schools, '北邮世纪学院').length, 1);
  const tile = JSON.parse(readFileSync(new URL('../campus-data/13_38.json', import.meta.url)));
  const [field] = nearbyVenues(tile,campuses[0]);
  assert.deepEqual(nearbyVenues(tile,campuses[0]).map(f=>f.id), ['relation/9605496']);
  assert.ok(field.reviewed);
  assert.equal(nearbyVenues(tile,campuses[1])[0].id,'way/685054779');
  assert.ok(nearbyVenues(tile,campuses[2])[0].shared);
  function inside([y,x],polygon) {
    let contained=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
      const [a,b]=polygon[i],[c,d]=polygon[j];
      if((a>y)!=(c>y) && x<b+(d-b)*(y-a)/(c-a)) contained=!contained;
    }
    return contained;
  }
  for (const school of campuses) {
    const venue=nearbyVenues([],school)[0];
    for(const point of stadiumLoop(venue.template)) {
      assert.ok(inside(point,school[6].boundary) && inside(point,venue.outline));
    }
  }
});

test('a bounding rectangle is insufficient evidence of campus membership',()=>{
  const school=['校区','','',30,120,[29.999,119.999,30.001,120.001]];
  const rows=[[1,'校内',30,120,0,[]],[2,'邻校',30,120.004,0,[]]];
  assert.deepEqual(nearbyVenues(rows,school),[]);
});

test('Wuhan University includes its named grounds and excludes both reported off-campus venues',()=>{
  const {schools}=JSON.parse(readFileSync(new URL('../campus-data/schools.json',import.meta.url)));
  const school=searchSchools(schools,'武大')[0];
  const tile=JSON.parse(readFileSync(new URL('../campus-data/10_38.json',import.meta.url)));
  const fields=nearbyVenues(tile,school);
  for(const name of ['桂园操场','九一二操场','工学部操场','信息学部操场']) {
    assert.equal(fields.filter(f=>f.name===name).length,1,name);
  }
  for(const id of [1478807917,1494450134]) assert.ok(!school[6].fieldIds.includes(id));
});
