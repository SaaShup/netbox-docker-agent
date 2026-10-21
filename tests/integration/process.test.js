import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

async function server(t, handler) {
  const instance = http.createServer(handler);
  instance.listen(0, '127.0.0.1'); await once(instance, 'listening');
  t.after(() => { instance.closeAllConnections(); instance.close(); });
  return `http://127.0.0.1:${instance.address().port}`;
}

async function child(t, script, env, flags = []) {
  const directory = await mkdtemp(path.join(tmpdir(), 'nda-process-'));
  if (env.config) await writeFile(path.join(directory, 'config.js'), JSON.stringify(env.config));
  const proc = spawn(process.execPath, [...flags, script], {
    cwd: new URL('../../', import.meta.url),
    env: { ...process.env, DATAPATH: directory, PORT: '0', HOST: '127.0.0.1', NETBOX_URL: '', ...env, config: undefined },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', error = '';
  proc.stdout.on('data', data => { output += data; });
  proc.stderr.on('data', data => { error += data; });
  const exited = once(proc, 'exit');
  t.after(async () => { if (proc.exitCode === null && proc.signalCode === null) { proc.kill('SIGKILL'); await exited; } await rm(directory, { recursive: true, force: true }); });
  return { proc, exited, get output() { return output; }, get error() { return error; } };
}

test('agent entry point starts and exits cleanly on SIGTERM', async t => {
  let connected;
  const ready = new Promise(resolve => { connected = resolve; });
  const engine = await server(t, (req, res) => {
    if (req.url.split('?')[0].endsWith('/images/json')) { res.setHeader('content-type', 'application/json'); res.end('[]'); return; }
    res.writeHead(200); res.write('\n'); connected();
  });
  const process = await child(t, 'src/index.js', { DOCKER_HOST: engine });
  await ready;
  assert.match(process.output, /listening on port/);
  process.proc.kill('SIGTERM');
  assert.deepEqual(await process.exited, [0, null]);
});

test('agent entry point uses port 1880 and all interfaces when settings are omitted', async t => {
  let connected;
  const ready = new Promise(resolve => { connected = resolve; });
  const engine = await server(t, (req, res) => {
    if (req.url.split('?')[0].endsWith('/images/json')) { res.setHeader('content-type', 'application/json'); res.end('[]'); return; }
    res.writeHead(200); res.write('\n'); connected();
  });
  const process = await child(t, 'src/index.js', { DOCKER_HOST: engine, PORT: undefined, HOST: undefined }, ['--import', './tests/fixtures/default-listener.mjs']);
  await ready;
  assert.match(process.output, /listening on port 1880/);
  process.proc.kill('SIGTERM');
  assert.deepEqual(await process.exited, [0, null]);
});

test('shutdown exits after its deadline when an in-flight manager request never completes', { timeout: 20000 }, async t => {
  let stopping;
  const stopped = new Promise(resolve => { stopping = resolve; });
  const engine = await server(t, (req, res) => { res.writeHead(200); res.write('\n'); res.on('close', stopping); });
  let connected;
  const ready = new Promise(resolve => { connected = resolve; });
  const manager = await server(t, (req, res) => {
    res.writeHead(200); res.write('{');
    const keepalive = setInterval(() => res.write(' '), 100);
    res.on('close', () => clearInterval(keepalive));
    connected();
  });
  const process = await child(t, 'src/index.js', { DOCKER_HOST: engine, config: { id: 1, netbox_url: manager, netbox_token: 'test' } });
  await ready;
  process.proc.kill('SIGINT'); await stopped; process.proc.kill('SIGTERM');
  assert.deepEqual(await process.exited, [1, null]);
});

for (const fail of [false, true]) {
  test(`recreation helper entry point ${fail ? 'reports Engine failures with a nonzero exit' : 'replaces a container using preserved runtime settings'}`, async t => {
    const calls = [];
    const engine = await server(t, async (req, res) => {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const route = req.url.replace(/^\/v\d+\.\d+/, '').split('?')[0];
      calls.push({ route, method: req.method, body: raw ? JSON.parse(raw) : undefined });
      res.setHeader('content-type', 'application/json');
      if (fail) { res.statusCode = 500; res.end('{"message":"engine offline"}'); return; }
      if (route === '/containers/create') { res.statusCode = 201; res.end('{"Id":"replacement"}'); return; }
      if (route.endsWith('/json')) {
        res.end(JSON.stringify({ Id: route.includes('replacement') ? 'replacement' : 'original', Name: '/demo', Config: {}, HostConfig: {}, State: { Running: false, Status: 'created' } })); return;
      }
      res.statusCode = 204; res.end();
    });
    const payload = { config: { id: '', netbox_url: '' }, data: { id: 1, name: 'demo', ContainerID: 'original', operation: 'recreate', image: { ImageID: 'sha256:new' } }, runtime: { config: { User: '1000' }, hostConfig: { Init: true } } };
    const process = await child(t, 'src/recreate-helper.js', { DOCKER_HOST: engine, RECREATE_PAYLOAD: JSON.stringify(payload), AGENT_RECREATE_HELPER: '1' });
    assert.deepEqual(await process.exited, [fail ? 1 : 0, null]);
    if (fail) assert.match(process.error, /engine offline/);
    else {
      const created = calls.find(c => c.route === '/containers/create').body;
      assert.equal(created.User, '1000'); assert.equal(created.HostConfig.Init, true);
      assert.ok(calls.some(c => c.method === 'DELETE' && c.route === '/containers/original'));
    }
  });
}
