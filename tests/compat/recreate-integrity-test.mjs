// Run inside the compatibility agent against its disposable Docker daemon.
import assert from 'node:assert/strict';
import { dockerClient, collect, demux } from '/app/src/docker.js';

const docker = dockerClient();
const agentURL = process.env.BASE_URL || 'http://127.0.0.1:1880';
const managerURL = process.env.NETBOX_URL || 'http://netbox:8080';
const authorization = 'Basic ' + Buffer.from(`${process.env.API_USERNAME || 'admin'}:${process.env.TEST_PASSWORD || 'saashup'}`).toString('base64');
const suffix = `${Date.now()}-${process.pid}`;
const name = `compat-integrity-${suffix}`, volume = `${name}-data`;
const image = 'alpine:3.21';
const fixtureLabel = { 'compat.recreate-integrity': suffix };
const marker = 'persistent fixture\n';
let operationID = Date.now() % 1000000000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(check, message) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(100);
  }
  throw Error(message);
}

async function operation(data, kind) {
  const id = ++operationID;
  const response = await fetch(agentURL + '/api/engine/containers', {
    method: 'PUT', headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ data: { ...data, id, operation: 'recreate' } }),
  });
  assert.equal(response.status, 202, await response.text());
  // A completed journal prevents a poll from mistaking the pre-operation
  // original for a successfully restored container.
  await waitFor(async () => {
    const result = await fetch(managerURL + '/__admin/requests/find', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'POST', url: '/api/extras/journal-entries/' }),
    });
    assert.equal(result.status, 200);
    const { requests } = await result.json();
    return requests.some(request => {
      const journal = JSON.parse(request.body);
      return journal.assigned_object_id === id && journal.kind === kind && journal.comments.startsWith('operation recreate:');
    });
  }, `Missing ${kind} journal for recreation ${id}`);
}

async function readVolume() {
  const verifier = await docker.createContainer({
    Image: image, Cmd: ['cat', '/data/sentinel'],
    HostConfig: { Mounts: [{ Type: 'volume', Source: volume, Target: '/data', ReadOnly: true }] },
  });
  try {
    await verifier.start();
    assert.equal((await verifier.wait()).StatusCode, 0);
    return demux(await collect(await verifier.logs({ stdout: true, stderr: true }))).toString();
  } finally { await verifier.remove({ force: true }); }
}

try {
  const stream = await docker.pull(image);
  await new Promise((resolve, reject) => docker.modem.followProgress(stream, (error, messages) => {
    const failure = messages?.find(message => message.error);
    if (error || failure) reject(error || Error(failure.error)); else resolve();
  }));
  await docker.createVolume({ Name: volume });
  const original = await docker.createContainer({
    name, Image: image, Cmd: ['sleep', '3600'], Labels: fixtureLabel,
    HostConfig: { Mounts: [{ Type: 'volume', Source: volume, Target: '/data' }] },
  });
  await original.start();
  const seed = await original.exec({ Cmd: ['sh', '-c', 'printf "persistent fixture\\n" > /data/sentinel'], AttachStdout: true, AttachStderr: true });
  await collect(await seed.start({ Detach: false, Tty: false }));
  assert.equal((await seed.inspect()).ExitCode, 0);
  assert.equal(await readVolume(), marker);
  const before = await original.inspect();
  const desired = {
    name, ContainerID: before.Id, image: { ImageID: before.Image }, cmd: ['sleep', '3600'],
    env: [{ var_name: 'SAASHUP_OWNER', value: 'owner@example.test' }, { var_name: 'VALUE', value: "a=b'quoted" }],
    labels: Object.entries({ ...fixtureLabel, 'traefik.enable': 'true' }).map(([key, value]) => ({ key, value })),
    mounts: [{ source: '/data', volume: { name: volume }, read_only: false }],
    restart_policy: 'no', network_settings: [{ network: { name: 'bridge' } }],
  };
  await operation(desired, 'success');
  const replacement = await docker.getContainer(name).inspect();
  assert.notEqual(replacement.Id, before.Id);
  assert.equal(replacement.State.Running, true);
  await assert.rejects(original.inspect(), { statusCode: 404 });
  assert.ok(replacement.Config.Env.includes('SAASHUP_OWNER=owner@example.test'));
  assert.ok(replacement.Config.Env.includes("VALUE=a=b'quoted"));
  assert.equal(replacement.Config.Labels['traefik.enable'], 'true');
  assert.equal(replacement.Mounts.find(mount => mount.Destination === '/data').Name, volume);
  assert.equal(await readVolume(), marker);
  console.log('PASS recreate integrity: replacement ID, owner, labels, and existing named-volume contents retained');

  for (const running of [true, false]) for (const failure of ['network', 'start']) {
    const container = docker.getContainer(name);
    const current = await container.inspect();
    if (current.State.Running && !running) await container.stop({ t: 1 });
    if (!current.State.Running && running) await container.start();
    const request = { ...desired, ContainerID: current.Id };
    if (failure === 'network') request.network_settings = [...desired.network_settings, { network: { name: `${name}-missing-network` } }];
    else request.cmd = ['/definitely-missing-compat-executable'];
    await operation(request, 'danger');
    const restored = await container.inspect();
    assert.equal(restored.Id, current.Id);
    assert.equal(restored.Name, '/' + name);
    assert.equal(restored.State.Running, running);
    assert.equal(await readVolume(), marker);
    const remaining = await docker.listContainers({ all: true, filters: { label: [`compat.recreate-integrity=${suffix}`] } });
    assert.deepEqual(remaining.map(item => item.Id), [current.Id], 'failed replacements and backup names must not remain');
    console.log(`PASS recreate rollback: ${failure} failure restores ${running ? 'running' : 'stopped'} original and its data`);
  }
} finally {
  const containers = await docker.listContainers({ all: true, filters: { label: [`compat.recreate-integrity=${suffix}`] } });
  for (const container of containers) await docker.getContainer(container.Id).remove({ force: true });
  await docker.getVolume(volume).remove().catch(error => { if (error.statusCode !== 404) throw error; });
}
