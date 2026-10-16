import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter, once } from 'node:events';
import { PassThrough } from 'node:stream';
import Docker from 'dockerode';
import { WebSocket, WebSocketServer } from 'ws';
import { terminals } from '../../src/terminal.js';

const authorization = 'Basic ' + Buffer.from('admin:saashup').toString('base64');

async function session(t, options = {}) {
  const server = http.createServer();
  const stream = new PassThrough();
  let serverWS, execOptions, resize;
  const exec = {
    start: async () => stream,
    inspect: async () => ({ ExitCode: options.exitCode }),
    resize: async size => { resize = size; if (options.resizeError) throw Error('resize failed'); },
    ...options.exec,
  };
  const upgrade = WebSocketServer.prototype.handleUpgrade;
  t.mock.method(WebSocketServer.prototype, 'handleUpgrade', function(req, socket, head, callback) {
    return upgrade.call(this, req, socket, head, ws => { serverWS = ws; callback(ws); });
  });
  const docker = { modem: new Docker().modem, getContainer: () => ({ exec: async settings => {
    execOptions = settings;
    if (options.execError) throw Error('exec denied');
    return exec;
  } }) };
  const terminal = terminals(server, docker);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `ws://127.0.0.1:${server.address().port}`;
  const path = terminal.allow('abc');
  const ws = new WebSocket(url + path + (options.query || ''), { headers: { authorization } });
  const queue = [], waiters = [];
  ws.on('message', data => { if (waiters.length) waiters.shift()(data); else queue.push(data); });
  ws.on('error', () => {});
  const next = () => queue.length ? Promise.resolve(queue.shift()) : new Promise(resolve => waiters.push(resolve));
  t.after(async () => {
    ws.terminate(); serverWS?.terminate(); terminal.close(); stream.destroy();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return { server, stream, exec, terminal, ws, url, path, next, get peer() { return serverWS; }, get execOptions() { return execOptions; }, get resize() { return resize; }, async input(data) {
    const received = once(serverWS, 'message'); ws.send(Buffer.from(data)); await received;
  } };
}

test('TTY terminal supports default shell, stdin, resize, pause/resume, backpressure and EOF', async t => {
  const s = await session(t, { resizeError: true });
  assert.equal((await s.next())[0], 100);
  assert.deepEqual(s.execOptions.Cmd, ['/bin/sh']);
  s.stream.write('hello'); assert.equal((await s.next()).toString(), '\x01hello');
  await s.input([0, 120]); assert.equal((await s.next()).toString(), '\x01x');
  await s.input([50, 24, 0, 80, 0]); assert.deepEqual(s.resize, { h: 24, w: 80 });
  await s.input([50, 1]); // A truncated resize frame is ignored.
  await s.input([101]); assert.equal(s.stream.isPaused(), true);
  await s.input([100]); assert.equal(s.stream.isPaused(), false);
  const write = t.mock.method(s.stream, 'write', () => false);
  await s.input([0, 121]); assert.equal((await s.next())[0], 101);
  s.stream.emit('drain'); assert.equal((await s.next())[0], 100);
  write.mock.restore();
  const closed = once(s.ws, 'close');
  await s.input([102]); assert.deepEqual([...await s.next()], [200, 0]);
  await closed;
});

test('non-TTY terminal separates stdout/stderr and reports nonzero exit status', async t => {
  const s = await session(t, { query: '?tty=false&command=sh&command=-c&command=exit+7', exitCode: 7 });
  assert.equal((await s.next())[0], 100);
  assert.deepEqual(s.execOptions.Cmd, ['sh', '-c', 'exit 7']);
  assert.equal(s.execOptions.Tty, false);
  for (const channel of [1, 2]) {
    const header = Buffer.alloc(8); header[0] = channel; header.writeUInt32BE(3, 4);
    s.stream.write(Buffer.concat([header, Buffer.from('out')]));
    assert.deepEqual([...await s.next()], [channel, 111, 117, 116]);
  }
  await s.input([50, 24, 0, 80, 0]); assert.equal(s.resize, undefined);
  s.stream.end(); assert.deepEqual([...await s.next()], [200, 7]);
});

for (const failure of ['exec', 'stream', 'inspect']) {
  test(`terminal reports ${failure} failures to the browser`, async t => {
    const s = await session(t, { execError: failure === 'exec', exec: failure === 'inspect' ? { inspect: async () => { throw Error('gone'); } } : {} });
    if (failure !== 'exec') {
      assert.equal((await s.next())[0], 100);
      if (failure === 'stream') s.stream.emit('error', Error('connection lost')); else s.stream.end();
    }
    const message = await s.next();
    assert.equal(message[0], 202);
    assert.match(message.subarray(1).toString(), /exec denied|connection lost|Unable to inspect exit status/);
  });
}

test('terminal discards a late Docker connection after the browser disconnects', async t => {
  let connect;
  const s = await session(t, { exec: { start: () => new Promise(resolve => { connect = resolve; }) } });
  await once(s.ws, 'open');
  const closed = once(s.ws, 'close'); s.ws.close(); await closed;
  connect(s.stream);
  await new Promise(setImmediate);
  assert.equal(s.stream.destroyed, true);
});

test('terminal closes clients that exceed the output buffer limit', async t => {
  const s = await session(t);
  await s.next();
  Object.defineProperty(s.peer, 'bufferedAmount', { configurable: true, get: () => 9 * 1024 * 1024 });
  const closed = once(s.ws, 'close');
  s.stream.write('output');
  assert.equal((await closed)[0], 1013);
  assert.equal(s.stream.destroyed, true);
});

test('terminal reaps expired reservations and terminates blocked clients', async t => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: Date.now() });
  const s = await session(t);
  await s.next();
  Object.defineProperty(s.peer, 'bufferedAmount', { configurable: true, get: () => 9 * 1024 * 1024 });
  const closed = once(s.ws, 'close');
  t.mock.timers.tick(330000);
  await closed;
  const denied = new WebSocket(s.url + s.path, { headers: { authorization } });
  assert.match((await once(denied, 'error'))[0].message, /403/);
});

test('terminal rejects expired and disabled sessions before upgrading', async t => {
  const s = await session(t);
  await s.next();
  const now = Date.now();
  const clock = t.mock.method(Date, 'now', () => now + 300001);
  const expired = new WebSocket(s.url + s.path, { headers: { authorization } });
  assert.match((await once(expired, 'error'))[0].message, /403/);
  clock.mock.restore();
  const previous = process.env.DISABLE_EXEC; process.env.DISABLE_EXEC = '1';
  try {
    const disabled = new WebSocket(s.url + s.path, { headers: { authorization } });
    assert.match((await once(disabled, 'error'))[0].message, /403/);
  } finally { if (previous === undefined) delete process.env.DISABLE_EXEC; else process.env.DISABLE_EXEC = previous; }
});

test('terminal destroys malformed upgrades and handles socket errors', async t => {
  const s = await session(t);
  await s.next();
  const socket = new EventEmitter(); let destroyed = false;
  socket.destroy = () => { destroyed = true; };
  s.server.emit('upgrade', { url: 'http://[', headers: {} }, socket, Buffer.alloc(0));
  socket.emit('error', Error('connection reset'));
  await new Promise(setImmediate);
  assert.equal(destroyed, true);
  s.peer.emit('error', Error('browser disconnected'));
  assert.equal(s.stream.destroyed, true);
  s.peer.terminate();
  s.stream.emit('data', Buffer.from('late output'));
});

test('terminal shutdown forces stalled clients closed after the grace period', async t => {
  const s = await session(t);
  await s.next();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(s.peer, 'close', () => {});
  const closed = once(s.ws, 'close');
  s.terminal.close();
  assert.equal((await s.next())[0], 201);
  t.mock.timers.tick(1000);
  await closed;
});

test('terminal shutdown terminates connections already closing', async t => {
  const s = await session(t);
  await s.next();
  s.peer.close();
  s.terminal.close();
  await once(s.ws, 'close');
});
