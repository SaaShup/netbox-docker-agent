import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import http from 'node:http';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../../src/config.js';
import { dockerClient, collect, demux, diskUsage, usage } from '../../src/docker.js';
import { containerRecord, createOptions } from '../../src/mapping.js';
import { metrics } from '../../src/metrics.js';
import { Netbox } from '../../src/netbox.js';
import { pruneOptions } from '../../src/prune.js';

function environment(t, name, value) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
  t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
}

test('Docker connection settings support default/custom sockets, TCP and HTTPS', t => {
  environment(t, 'DOCKER_HOST', undefined);
  for (const [host, expected] of [
    [undefined, { socketPath: '/var/run/docker.sock' }],
    ['unix:///tmp/test-docker.sock', { socketPath: '/tmp/test-docker.sock' }],
    ['unix://', { socketPath: '/var/run/docker.sock' }],
    ['tcp://engine:1234', { host: 'engine', port: 1234, protocol: 'http' }],
    ['http://engine', { host: 'engine', port: 2375, protocol: 'http' }],
    ['https://engine:2376', { host: 'engine', port: 2376, protocol: 'https' }],
  ]) {
    if (host === undefined) delete process.env.DOCKER_HOST; else process.env.DOCKER_HOST = host;
    const modem = dockerClient().modem;
    for (const [key, value] of Object.entries(expected)) assert.equal(modem[key], value, `${host}: ${key}`);
  }
});

test('Docker output limits destroy oversized streams and preserve incomplete frames', async () => {
  const buffer = Buffer.from('already collected');
  assert.equal(await collect(buffer), buffer);
  const stream = Readable.from([Buffer.from('123'), Buffer.from('456')]);
  await assert.rejects(collect(stream, 5), { statusCode: 413 });
  assert.equal(stream.destroyed, true);
  const incomplete = Buffer.from([1, 0, 0, 0, 0, 0, 0, 5, 97]);
  assert.equal(demux(incomplete), incomplete);
  await assert.rejects(diskUsage({ modem: { dial: (_, cb) => cb(new Error('engine offline')) } }), /engine offline/);
  assert.equal(usage({ Images: [{}], Volumes: [{}] }).images.size, 0);
});

test('a failed configuration save does not prevent a later save', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nda-save-recovery-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = await new Store(directory).load();
  await mkdir(path.join(directory, 'config.js.tmp'));
  await assert.rejects(store.save());
  await rm(path.join(directory, 'config.js.tmp'), { recursive: true });
  store.config.id = 12;
  await store.save();
  assert.equal(JSON.parse(await readFile(path.join(directory, 'config.js'))).id, 12);
  environment(t, 'DATAPATH', undefined);
  assert.equal(new Store().directory, '/data');
});

test('sparse Docker inspections retain defaults, exposed ports and empty environment values', () => {
  const empty = containerRecord({}, 1);
  assert.deepEqual(empty.env, []);
  assert.deepEqual(empty.labels, []);
  assert.deepEqual(empty.network_settings, []);
  const record = containerRecord({
    Config: { Env: ['FLAG', 'EMPTY=', 'VALUE=a=b'] },
    HostConfig: { CapDrop: ['CAP_NET_RAW'] },
    NetworkSettings: { Ports: { '80/tcp': null } },
  }, 1);
  assert.deepEqual(record.env, [{ var_name: 'FLAG', value: '' }, { var_name: 'EMPTY', value: '' }, { var_name: 'VALUE', value: 'a=b' }]);
  assert.deepEqual(record.cap_drop, ['NET_RAW']);
  assert.equal(record.ports[0].public_port, -1);
  assert.equal(containerRecord({ HostConfig: { PortBindings: { '80/tcp': null } } }, 1).ports[0].public_port, 0);
  assert.equal(createOptions({ image: { name: 'app' } }, true).Image, 'app:latest');
  assert.equal(createOptions({}, true).HostConfig.NetworkMode, undefined);
});

test('metrics distinguish exited/stopped states and tolerate missing container names', async () => {
  const output = await metrics({ docker: { listContainers: async () => [
    { State: 'exited', Names: ['/exited'] }, { State: 'stopped', Names: [] },
  ] }, netbox: { errors: 2 } });
  assert.match(output, /container_exited\{name="\/exited", state="exited"\} 1/);
  assert.match(output, /container_stopped\{name="", state="stopped", status="stopped"\} 1/);
});

test('build-cache defaults retain conservative scope and reject empty filter values', () => {
  assert.deepEqual(pruneOptions('build-cache'), { filters: {}, all: false });
  assert.deepEqual(pruneOptions('build-cache', { all: false, keep_storage: 0 }), { filters: {}, all: false, 'keep-storage': 0 });
  assert.throws(() => pruneOptions('containers', { filters: { until: ['   '] } }), { statusCode: 400 });
});

for (const scenario of ['redirect', 'server error', 'invalid JSON', 'empty response', 'response error', 'oversized response', 'timeout']) {
  test(`NetBox transport handles ${scenario}`, async t => {
    const netbox = new Netbox({ config: { netbox_url: 'http://manager', netbox_token: 'legacy' } });
    let destroyed = false;
    t.mock.method(http, 'request', (url, options, callback) => {
      assert.equal(options.headers.Authorization, 'Token legacy');
      const request = new EventEmitter();
      request.destroy = error => { destroyed = true; request.emit('error', error); };
      request.end = () => queueMicrotask(() => {
        if (scenario === 'timeout') return request.emit('timeout');
        const response = new EventEmitter();
        response.statusCode = scenario === 'redirect' ? 302 : scenario === 'server error' ? 503 : 200;
        callback(response);
        if (scenario === 'response error') return response.emit('error', new Error('connection interrupted'));
        if (scenario === 'oversized response') return response.emit('data', 'x'.repeat(16 * 1024 * 1024 + 1));
        if (scenario !== 'empty response') response.emit('data', scenario === 'invalid JSON' ? '{bad' : '{}');
        response.emit('end');
      });
      return request;
    });
    if (scenario === 'empty response') {
      assert.equal(await netbox.resource('GET', 'hosts'), null);
      assert.equal(netbox.errors, 0);
    } else {
      const message = { redirect: 'NetBox HTTP 302', 'server error': 'NetBox HTTP 503', 'invalid JSON': 'Invalid NetBox JSON', 'response error': 'connection interrupted', 'oversized response': 'NetBox response too large', timeout: 'NetBox timeout' }[scenario];
      await assert.rejects(netbox.resource('GET', 'hosts'), { message });
      assert.equal(netbox.errors, 1);
      if (['timeout', 'oversized response'].includes(scenario)) assert.equal(destroyed, true);
    }
  });
}

test('unconfigured NetBox requests and host journals are no-ops', async () => {
  const netbox = new Netbox({ config: {} });
  assert.equal(await netbox.resource('GET', 'hosts'), null);
  assert.equal(await netbox.journal('host', undefined, 'info', 'startup'), undefined);
});
