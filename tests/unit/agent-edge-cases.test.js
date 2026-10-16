import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { Agent } from '../../src/agent.js';

const inspect = () => ({ Id: 'original', Name: '/demo', Image: 'sha256:old', State: { Status: 'running', Running: true }, Config: { Env: ['A=1'], Labels: {} }, HostConfig: {}, Mounts: [] });
function setup(t) {
  const requests = [], errors = [];
  const store = { config: { id: 1, netbox_url: 'http://manager', netbox_token: 'test', flows: '0' }, registries: [], save: async () => {} };
  const netbox = { journal: async (...args) => { requests.push(['journal', ...args]); }, resource: async (...args) => { requests.push(args); return { results: [] }; } };
  const docker = { listImages: async () => [], listContainers: async () => [], getEvents: async () => new PassThrough() };
  const agent = new Agent(docker, store, netbox);
  agent.log = error => errors.push(error.message);
  t.after(() => agent.close());
  return { agent, store, docker, netbox, requests, errors };
}
function env(t, name, value) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
  t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
}

test('operation queues serialize a resource, allow independent work and recover from failure', async t => {
  const { agent, errors } = setup(t);
  const steps = []; let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const first = agent.enqueue('one', async () => { steps.push('first'); await blocked; throw Error('failed'); });
  const second = agent.enqueue('one', () => { steps.push('second'); });
  await agent.enqueue('other', () => { steps.push('independent'); });
  assert.deepEqual(steps, ['first', 'independent']);
  release(); await Promise.all([first, second]);
  assert.deepEqual(steps, ['first', 'independent', 'second']);
  assert.deepEqual(errors, ['failed']);
  assert.equal(agent.jobs.size, 0); assert.equal(agent.chains.size, 0);
  const log = t.mock.method(console, 'error', () => {});
  Agent.prototype.log.call(agent, Error('test log'));
  assert.equal(JSON.parse(log.mock.calls[0].arguments[0]).msg, 'test log');
});

test('inventory tolerates disappeared containers but propagates Engine failures', async t => {
  const { agent, docker } = setup(t);
  docker.listContainers = async () => [{ Id: 'gone' }];
  docker.getContainer = () => ({ inspect: async () => { throw Object.assign(Error('gone'), { statusCode: 404 }); } });
  assert.deepEqual(await agent.containers(), []);
  docker.getContainer = () => ({ inspect: async () => { throw Object.assign(Error('offline'), { statusCode: 500 }); } });
  await assert.rejects(agent.containers(), /offline/);
  docker.version = async () => { throw Error('offline'); };
  const result = await agent.info(); assert.equal(result.docker, 'error'); assert.equal(result.configured, 'socket error');
  delete agent.store.config.netbox_token;
  docker.version = async () => ({}); docker.info = async () => ({});
  assert.equal((await agent.info()).configured, 'nok');
});

test('registry discovery retains known credentials and handles digest-only and untagged images', async t => {
  const { agent, docker, store, netbox } = setup(t);
  store.config.netbox_url = '';
  store.registries = [{ id: 12, name: 'private.test', serveraddress: 'https://custom.test' }];
  docker.listImages = async () => [
    { RepoDigests: ['private.test/ns/app@sha256:one'] }, { Id: 'sha256:untagged' },
    { RepoTags: ['private.test/ns/other:v1', 'private.test/ns/other:v2'] },
  ];
  const result = await agent.registries();
  assert.equal(result[0].id, 12); assert.equal(result[0].serveraddress, 'https://custom.test');
  assert.equal(result[0].images.length, 3); assert.equal(result[1].name, 'dockerhub');
  store.config.netbox_url = 'http://manager';
  netbox.resource = async () => undefined;
  assert.equal((await agent.registries())[0].id, undefined);
});

test('sync handles empty volume inventories, unnamed drivers and missing host IDs', async t => {
  const { agent, docker, store, requests } = setup(t);
  store.config.id = '';
  docker.version = async () => ({ ApiVersion: '1.50' });
  docker.listNetworks = async () => [{ Name: 'net', Id: 'network' }];
  docker.listVolumes = async () => ({ Volumes: [{ Name: 'data', Driver: 'local' }] });
  await agent.sync('endpoint'); await agent.sync('networks'); await agent.sync('volumes');
  assert.ok(requests.some(r => r[0] === 'PATCH' && Array.isArray(r[2]) && r[2][0].id === 0));
  assert.ok(requests.some(r => r[1] === 'networks' && r[2].driver === 'None'));
  assert.ok(requests.some(r => r[1] === 'volumes' && r[2].name === 'data'));
  docker.listVolumes = async () => ({}); await agent.sync('volumes');
  store.config.netbox_url = ''; await agent.sync('containers');
});

test('image deletion updates registry associations and supports tag references', async t => {
  const { agent, docker, store } = setup(t);
  store.registries = [{ id: 1, images: ['app:v1', 'app:v2'] }, { id: 2, images: ['keep:v1'] }];
  const removed = []; docker.getImage = ref => ({ remove: async () => { removed.push(ref); } });
  await agent.write('DELETE', 'images', { name: 'app', version: 'v1', display: 'app:v1', registry: { id: 1 } });
  assert.deepEqual(removed, ['app:v1']); assert.deepEqual(store.registries[0].images, ['app:v2']);
  await agent.write('DELETE', 'images', { ImageID: 'sha256:two', display: 'app:v2', registry: { id: 1 } });
  assert.deepEqual(store.registries, [{ id: 2, images: ['keep:v1'] }]);
  await agent.write('DELETE', 'unknown');
  await agent.write('POST', 'unknown');
});

test('image pulls merge existing registry images and archive ID changes even with unchanged digests', async t => {
  const { agent, docker, store, requests } = setup(t);
  store.registries = [{ id: 2, images: ['app:v1'] }];
  docker.pull = async () => new PassThrough();
  docker.modem = { followProgress: (_, cb) => cb(null, [{ status: 'done' }]) };
  docker.getImage = () => ({ inspect: async () => ({ Id: 'sha256:new', RepoTags: ['app:v1'], RepoDigests: ['app@sha256:same'], Size: 1 }) });
  const data = { id: 4, name: 'app', version: 'v1', display: 'app:v1', force: true, ImageID: 'sha256:old', Digest: 'sha256:same', registry: { id: 2 } };
  await agent.write('POST', 'images', data);
  assert.deepEqual(store.registries[0].images, ['app:v1']);
  assert.ok(requests.some(r => r[0] === 'POST' && r[1] === 'images'));
  requests.length = 0;
  await agent.write('POST', 'images', { ...data, ImageID: 'sha256:new' });
  assert.equal(requests.some(r => r[0] === 'POST' && r[1] === 'images'), false);
  docker.modem.followProgress = (_, cb) => cb(Error('stream failed'));
  await assert.rejects(agent.write('POST', 'images', data), /stream failed/);
});

test('self recreation is blocked even when the old helper flag is set', async t => {
  const { agent, docker, requests } = setup(t);
  env(t, 'HOSTNAME', 'orig'); env(t, 'AGENT_RECREATE_HELPER', '1');
  docker.getContainer = () => ({ inspect: async () => inspect() });
  await assert.rejects(agent.write('PUT', 'containers', { id: 2, ContainerID: 'demo', operation: 'recreate' }), /cannot recreate its own container/);
  assert.equal(agent.activeOperations, 0);
  assert.ok(requests.some(r => r[0] === 'journal' && r[3] === 'danger'));
  delete process.env.HOSTNAME;
  assert.equal((await agent.recreationTarget('demo')).Id, 'original');
});

test('recreation helper restores runtime identity and cleanup errors do not prevent rollback', async t => {
  const { agent, docker, errors, netbox } = setup(t);
  env(t, 'HOSTNAME', 'different-agent');
  const steps = []; let options;
  const original = { inspect: async () => inspect(), stop: async () => {}, rename: async () => { steps.push('rename'); }, start: async () => { steps.push('restart'); }, remove: async () => {} };
  docker.getContainer = () => original;
  agent.recreateRuntime = { config: { User: '1000', WorkingDir: '/app' }, hostConfig: { Init: true, GroupAdd: ['42'] } };
  docker.createContainer = async value => { options = value; return { start: async () => { throw Error('start failed'); }, remove: async () => { throw Error('cleanup failed'); } }; };
  netbox.journal = async () => { if (steps.length) throw Error('journal offline'); };
  await assert.rejects(agent.write('PUT', 'containers', { id: 2, name: 'demo', ContainerID: 'original', operation: 'recreate' }), /start failed/);
  assert.equal(options.User, '1000'); assert.deepEqual(options.HostConfig.GroupAdd, ['42']);
  assert.deepEqual(steps, ['rename', 'rename', 'restart']); assert.ok(errors.includes('journal offline'));
  netbox.journal = async () => {};
  await agent.write('PUT', 'containers', { ContainerID: 'original', operation: 'unknown' });
});

test('events ignore unsupported types/actions, unconfigured managers and absent records', async t => {
  const { agent, docker, netbox, store, requests } = setup(t);
  for (const event of [{ Type: 'image' }, { Type: 'container', Action: 'create' }]) await agent.event(event);
  store.config.netbox_url = ''; await agent.event({ Type: 'container', Action: 'start' });
  store.config.netbox_url = 'http://manager'; docker.getContainer = () => ({ inspect: async () => inspect() });
  netbox.resource = async (...args) => { requests.push(args); return { count: 0 }; };
  await agent.event({ Type: 'container', Action: 'die', id: 'original' });
  assert.equal(requests.length, 1);
});

test('event watcher handles malformed frames, oversized frames, transport errors and reconnects', async t => {
  const { agent, docker, errors } = setup(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const streams = [];
  docker.getEvents = async () => { const stream = new PassThrough(); streams.push(stream); return stream; };
  await agent.watch();
  streams[0].write('{bad}\n\n' + JSON.stringify({ Type: 'image', id: 'old' }) + '\n');
  await Promise.all(agent.jobs);
  streams[0].emit('error', Error('socket reset'));
  t.mock.timers.tick(1000); await new Promise(setImmediate);
  assert.equal(streams.length, 2); assert.ok(errors.includes('socket reset'));
  streams[1].write('x'.repeat(1024 * 1024 + 1));
  await new Promise(setImmediate);
  assert.ok(errors.includes('Event frame too large'));
  t.mock.timers.tick(1000); await new Promise(setImmediate);
  await agent.close(); await agent.watch();
});

test('event watcher retries failed connections and cancels a connection completed after shutdown', async t => {
  const { agent, docker, errors } = setup(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  docker.getEvents = async () => { throw Error('unavailable'); };
  await agent.watch();
  docker.getEvents = async () => new PassThrough();
  t.mock.timers.tick(1000); await new Promise(setImmediate);
  assert.equal(errors[0], 'unavailable');
  await agent.close();
  agent.stopped = false;
  let finish; const stream = new PassThrough();
  docker.getEvents = () => new Promise(resolve => { finish = resolve; });
  const watching = agent.watch(); await agent.close(); finish(stream); await watching;
  assert.equal(stream.destroyed, true);
});

test('startup imports registry references and periodic checks recover persistence failures', async t => {
  const { agent, store, netbox, requests, errors } = setup(t);
  t.mock.timers.enable({ apis: ['setInterval'] });
  netbox.resource = async (method, type, ...args) => {
    requests.push([method, type, ...args]);
    return type === 'registries' ? { results: [
      { id: 1, name: 'private.test', images: ['one:v1', { display: 'two:v2' }] }, { id: 2 },
    ] } : { agent_version: '2.0.0-0' };
  };
  agent.start(); await Promise.all(agent.jobs);
  assert.deepEqual(store.registries[0].images, ['one:v1', 'two:v2']);
  assert.equal(store.registries.length, 1);
  store.save = async () => { throw Error('disk full'); };
  t.mock.timers.tick(60000); await new Promise(setImmediate); await Promise.all(agent.jobs);
  assert.ok(errors.includes('disk full'));
  store.save = async () => {};
  store.config.id = '';
  netbox.resource = async (method, type, data) => { if (method === 'PATCH') assert.equal(data[0].id, 0); return {}; };
  t.mock.timers.tick(60000); await new Promise(setImmediate); await Promise.all(agent.jobs);
  store.config.netbox_url = '';
  t.mock.timers.tick(60000); await new Promise(setImmediate); await Promise.all(agent.jobs);
});

test('unconfigured startup avoids manager requests', async t => {
  const { agent, store, requests } = setup(t);
  store.config.netbox_url = '';
  agent.start(); await Promise.all(agent.jobs);
  assert.equal(requests.some(r => r[0] === 'GET'), false);
});

test('prune tolerates empty reports and journals Engine failures even when the manager is offline', async t => {
  const { agent, docker, netbox, errors } = setup(t);
  docker.modem = { dial: (_, cb) => cb(null, {}) };
  assert.deepEqual(await agent.prune('containers'), {});
  netbox.journal = async () => { throw Error('manager offline'); };
  docker.modem.dial = (_, cb) => cb(Error('engine offline'));
  await assert.rejects(agent.prune('containers'), /engine offline/);
  assert.ok(errors.includes('manager offline')); assert.equal(agent.pruning, false);
});

test('shutdown waits for prune reporting and releases its lock and tracked job together', async t => {
  const { agent, docker, netbox } = setup(t);
  let release, entered;
  const reporting = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  docker.modem = { dial: (_, cb) => cb(null, { ContainersDeleted: [], SpaceReclaimed: 0 }) };
  netbox.journal = async () => { entered(); await pending; };
  const pruning = agent.prune('containers');
  await reporting;
  assert.equal(agent.pruning, true); assert.equal(agent.jobs.size, 1);
  let closed = false;
  const closing = agent.close().then(() => { closed = true; });
  await Promise.resolve(); assert.equal(closed, false);
  release(); await pruning; await closing;
  assert.equal(agent.pruning, false); assert.equal(agent.jobs.size, 0);
});
