import test from 'node:test';
import assert from 'node:assert/strict';
import { setupUSB } from '../usb.js';

function device(t, origin = 'http://127.0.0.1:4179') {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, {
      classList: { toggle() {} },
      showModal() { this.open = true; }
    });
    return elements.get(id);
  };
  const actions = [];
  let socket, tick, stopped = 0, destination, point = [51.524, -0.04];
  class Socket {
    static OPEN = 1;
    readyState = 1;
    constructor() { socket = this; }
    send(data) { actions.push(JSON.parse(data)); }
    close() { this.readyState = 3; this.onclose(); }
    reply(data) { this.onmessage({ data: JSON.stringify(data) }); }
  }
  const globals = {
    document: { getElementById: get }, location: { origin },
    window: { addEventListener() {}, location: { assign(url) { destination = url; } } },
    WebSocket: Socket, setInterval(fn) { tick = fn; return 1; }, clearInterval() { tick = null; }
  };
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  }
  const driver = setupUSB(() => point, () => 'route=test', () => { stopped++; });
  return { driver, actions, get, tick: () => tick(), setPoint(value) { point = value; },
    connect() { get('usb-open').onclick(); socket.reply({state:'ready'}); },
    reply: data => socket.reply(data), get stopped() { return stopped; }, get destination() { return destination; } };
}

test('public site transfers the plan to the local helper before simulation', t => {
  const d = device(t, 'https://softbread1217.github.io');
  assert.equal(d.driver.requireReady(), false);
  assert.equal(d.get('usb-dialog').open, true);
  d.get('usb-open').onclick();
  assert.equal(d.destination.href, 'http://127.0.0.1:4179/#route=test');
  assert.deepEqual(d.actions, []);
});

test('connection is idle until start and synchronization requires acknowledgement', t => {
  const d = device(t);
  assert.equal(d.driver.requireReady(), false);
  d.connect();
  assert.equal(d.driver.requireReady(), true);
  d.tick();
  assert.deepEqual(d.actions, [{action:'ping'}]);
  d.reply({state:'alive'});
  d.driver.start();
  assert.equal(d.get('output-state').textContent, '正在同步');
  assert.deepEqual(d.actions.at(-1), {action:'set', point:[51.524,-0.04]});
  d.setPoint([51.525,-0.04]);
  d.tick();
  assert.equal(d.actions.length, 2);
  d.reply({state:'sent'});
  assert.equal(d.get('output-state').textContent, '已同步');
  d.tick();
  assert.deepEqual(d.actions.at(-1), {action:'set',point:[51.525,-0.04]});
  d.reply({state:'sent'});
  d.tick();
  assert.equal(d.actions.at(-1).action, 'ping');
});

test('restore waits for the pending set and stops streaming after acknowledgement', t => {
  const d = device(t);
  d.connect();
  d.driver.start();
  d.get('usb-clear').onclick();
  assert.equal(d.stopped, 1);
  assert.equal(d.driver.requireReady(), false);
  assert.equal(d.actions.length, 1);
  d.reply({state:'sent'});
  assert.deepEqual(d.actions.at(-1), {action:'clear'});
  d.reply({state:'cleared'});
  assert.equal(d.get('output-state').textContent, '已恢复');
  assert.equal(d.driver.requireReady(), true);
  d.tick();
  assert.equal(d.actions.at(-1).action, 'ping');
  d.reply({error:'USB 已断开'});
  assert.equal(d.driver.requireReady(), false);
  assert.equal(d.get('output-state').textContent, '已断开');
});
