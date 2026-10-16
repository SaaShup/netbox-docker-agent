// Run inside the compatibility agent. All registry/daemon changes are disposable.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import bcrypt from '/app/node_modules/bcryptjs/index.js';
import { dockerClient, collect, demux } from '/app/src/docker.js';

const docker = dockerClient();
const image = 'saashup/netbox-docker-agent:compat';
const suffix = `${Date.now()}-${process.pid}`;
const prefix = `compat-registry-resilience-${suffix}`;
const labels = { 'compat.registry-resilience': suffix };
const authVolume = `${prefix}-auth`, dataVolume = `${prefix}-data`;
const tlsHost = 'compat-registry-tls.test:5443', wrongHost = 'compat-registry-wrong.test:5443';
const registryID = 90001;
const apiURL = process.env.BASE_URL || 'http://127.0.0.1:1880';
const managerURL = process.env.NETBOX_URL || 'http://netbox:8080';
const frontend = 'http://dind:5000';
const controlURL = 'http://dind:5001';
const authorization = 'Basic ' + Buffer.from(`${process.env.API_USERNAME || 'admin'}:${process.env.TEST_PASSWORD || 'saashup'}`).toString('base64');
const oldPassword = 'registry-before-test-only', newPassword = 'registry-after-test-only';
let password = oldPassword, backend, proxy, target;
let operationID = Date.now() % 1000000000;
const refs = [];
const sha = buffer => 'sha256:' + createHash('sha256').update(buffer).digest('hex');
const credentials = () => ({ username: 'fixture', password, serveraddress: 'localhost:5000' });
const basic = () => 'Basic ' + Buffer.from('fixture:' + password).toString('base64');
const ca = await readFile('/fixtures/registry/ca.crt', 'utf8');

async function waitFor(check, message, timeout = 180000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error(message);
}
async function control(options) {
  const response = await fetch(controlURL, options ? { method: 'POST', body: JSON.stringify(options) } : {});
  assert.equal(response.status, 200); return response.json();
}
async function proxyReady() {
  await waitFor(async () => { try { return (await fetch(controlURL)).ok; } catch { return false; } }, 'registry proxy did not start', 30000);
  if (target) await control({ target });
}
async function helper(source, env = []) {
  const container = await docker.createContainer({
    Image: image, User: '0', Labels: labels, Entrypoint: ['node', '--input-type=module', '-e', source], Env: env,
    HostConfig: { Binds: ['/etc/hosts:/fixture-hosts', '/etc/docker/certs.d:/fixture-certs'] },
  });
  try {
    await container.start(); const result = await container.wait();
    const output = demux(await collect(await container.logs({ stdout: true, stderr: true }))).toString();
    assert.equal(result.StatusCode, 0, output);
  } finally { await container.remove({ force: true }); }
}
async function trust(enabled) {
  await helper(`import {mkdir,writeFile,rm} from 'node:fs/promises';
    for(const name of ${JSON.stringify([tlsHost, wrongHost])}) {
      const directory='/fixture-certs/'+name;
      if(process.env.ENABLED==='1'){await mkdir(directory,{recursive:true});await writeFile(directory+'/ca.crt',process.env.CA);}
      else await rm(directory,{recursive:true,force:true});
    }`, [`CA=${ca}`, `ENABLED=${enabled ? '1' : '0'}`]);
}
function layerTar() {
  const content = randomBytes(512 * 1024), header = Buffer.alloc(512);
  header.write('fixture'); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
  header.write(content.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136);
  header.fill(32, 148, 156); header[156] = 48; header.write('ustar\0', 257); header.write('00', 263);
  header.write([...header].reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148);
  return Buffer.concat([header, content, Buffer.alloc(1024)]);
}
async function registryRequest(path, method, body, headers = {}) {
  const response = await fetch(frontend + path, { method, headers: { authorization: basic(), ...headers }, body });
  assert.ok(response.ok, `fixture registry ${method} failed: ${response.status}`); return response;
}
async function publish(caseName) {
  // Upload directly to Registry V2: the daemon has never cached these layers.
  const repository = `resilience/${caseName}-${suffix}`;
  const tar = layerTar(), compressed = gzipSync(tar), layerDigest = sha(compressed);
  const config = Buffer.from(JSON.stringify({ architecture: process.arch === 'arm64' ? 'arm64' : 'amd64', os: 'linux', config: { Cmd: ['/not-executed'] }, rootfs: { type: 'layers', diff_ids: [sha(tar)] } }));
  for (const blob of [compressed, config]) {
    const start = await registryRequest(`/v2/${repository}/blobs/uploads/`, 'POST');
    const location = new URL(start.headers.get('location'), frontend);
    location.searchParams.set('digest', sha(blob));
    await registryRequest(location.pathname + location.search, 'PUT', blob, { 'content-type': 'application/octet-stream' });
  }
  const manifest = {
    schemaVersion: 2, mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
    config: { mediaType: 'application/vnd.docker.container.image.v1+json', size: config.length, digest: sha(config) },
    layers: [{ mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip', size: compressed.length, digest: layerDigest }],
  };
  const manifestJSON = JSON.stringify(manifest);
  await registryRequest(`/v2/${repository}/manifests/v1`, 'PUT', manifestJSON, { 'content-type': manifest.mediaType });
  return { repository, layerDigest, imageID: sha(config), manifestDigest: sha(Buffer.from(manifestJSON)), diffID: sha(tar) };
}
async function managerRequests() {
  const response = await fetch(managerURL + '/__admin/requests/find', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method: 'POST', url: '/api/extras/journal-entries/' }),
  });
  assert.equal(response.status, 200); return (await response.json()).requests.map(request => JSON.parse(request.body));
}
async function associations() { return (await fetch(apiURL + '/api/registries', { headers: { authorization } })).json(); }
async function pull(fixture, { host = 'localhost:5000', auth = credentials(), failure } = {}) {
  const ref = `${host}/${fixture.repository}:v1`, id = ++operationID;
  refs.push(ref);
  const before = await associations();
  const data = { id, name: `${host}/${fixture.repository}`, version: 'v1', size: 0, ImageID: null, display: ref };
  if (auth) data.registry = { id: registryID, name: 'resilience-registry', ...auth, serveraddress: host };
  const response = await fetch(apiURL + '/api/engine/images', {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify({ data }),
  });
  assert.equal(response.status, 202);
  let completed;
  await waitFor(async () => {
    completed = (await managerRequests()).find(journal => journal.assigned_object_id === id && ['success', 'danger'].includes(journal.kind));
    return Boolean(completed);
  }, `missing pull completion journal for ${fixture.repository}`);
  if (failure) {
    assert.equal(completed.kind, 'danger', 'failed pull must not report success');
    assert.match(completed.comments, failure);
    await assert.rejects(docker.getImage(ref).inspect(), { statusCode: 404 });
    assert.deepEqual(await associations(), before, 'failed pulls must not alter registry associations');
    const callbacks = await fetch(managerURL + '/__admin/requests/find', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method: 'PATCH', url: '/api/plugins/docker/images/' }),
    });
    assert.equal((await callbacks.json()).requests.some(request => JSON.parse(request.body).some(record => record.id === id)), false, 'failed pull must not publish an image callback');
  } else {
    assert.equal(completed.kind, 'success', completed.comments);
    const inspected = await docker.getImage(ref).inspect();
    // Classic and containerd image stores expose config and manifest IDs respectively.
    assert.ok([fixture.imageID, fixture.manifestDigest].includes(inspected.Id));
    assert.deepEqual(inspected.RootFS.Layers, [fixture.diffID]);
    assert.ok(inspected.RepoDigests.some(digest => digest.endsWith('@' + fixture.manifestDigest)));
    assert.ok((await associations()).some(registry => registry.id === registryID && registry.images.includes(ref)));
  }
}

try {
  await docker.getImage(image).inspect(); // The harness loads the production image first.
  const stream = await docker.pull('registry:2');
  await new Promise((resolve, reject) => docker.modem.followProgress(stream, (error, output) => {
    const failed = output?.find(item => item.error); error || failed ? reject(error || Error(failed.error)) : resolve();
  }));
  await docker.createVolume({ Name: authVolume }); await docker.createVolume({ Name: dataVolume });
  const proxySource = await readFile('/fixtures/registry/proxy.mjs', 'utf8');
  proxy = await docker.createContainer({
    name: `${prefix}-proxy`, Image: image, User: '0', Labels: labels,
    ExposedPorts: { '5000/tcp': {}, '5001/tcp': {}, '5443/tcp': {} },
    Entrypoint: ['node', '--input-type=module', '-e', proxySource],
    Env: [`FIXTURE_HTPASSWD=fixture:${await bcrypt.hash(password, 4)}`, `FIXTURE_TLS_KEY=${(await readFile('/fixtures/registry/server.key')).toString('base64')}`, `FIXTURE_TLS_CERT=${(await readFile('/fixtures/registry/server.crt')).toString('base64')}`],
    HostConfig: { Mounts: [{ Type: 'volume', Source: authVolume, Target: '/auth' }], PortBindings: { '5000/tcp': [{ HostPort: '5000' }], '5001/tcp': [{ HostPort: '5001' }] } },
  });
  await proxy.start();
  try { await proxyReady(); }
  catch(error) {
    const state=(await proxy.inspect()).State;
    const logs=demux(await collect(await proxy.logs({stdout:true,stderr:true}))).toString();
    throw Error(`registry proxy startup failed (${state.Status}): ${logs}`,{cause:error});
  }
  backend = await docker.createContainer({
    name: `${prefix}-backend`, Image: 'registry:2', Labels: labels,
    Env: ['REGISTRY_AUTH=htpasswd', 'REGISTRY_AUTH_HTPASSWD_REALM=fixture', 'REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd'],
    HostConfig: { Mounts: [{ Type: 'volume', Source: authVolume, Target: '/auth', ReadOnly: true }, { Type: 'volume', Source: dataVolume, Target: '/var/lib/registry' }] },
  });
  await backend.start();
  target = `http://${Object.values((await backend.inspect()).NetworkSettings.Networks)[0].IPAddress}:5000`;
  await control({ target });
  await waitFor(async () => { try { return (await fetch(frontend + '/v2/')).status === 401; } catch { return false; } }, 'authenticated backend did not start', 30000);
  const proxyIP = Object.values((await proxy.inspect()).NetworkSettings.Networks)[0].IPAddress;
  await helper(`import {appendFile} from 'node:fs/promises'; await appendFile('/fixture-hosts', '\\n'+process.env.HOST_LINE+'\\n');`, [`HOST_LINE=${proxyIP} ${tlsHost.split(':')[0]} ${wrongHost.split(':')[0]} # ${prefix}`]);
  await trust(false);

  const initial = await publish('authentication');
  await pull(initial, { auth: null, failure: /unauthorized|authentication required|no basic auth|denied/i });
  console.log('PASS registry: missing credentials rejected with no image or association');
  await pull(initial, { auth: { ...credentials(), password: 'wrong-test-only' }, failure: /unauthorized|authentication required|no basic auth|denied/i });
  console.log('PASS registry: wrong credentials rejected with no success callback');
  await pull(initial);
  console.log('PASS registry: authenticated pull succeeds after rejected credentials');

  await control({ htpasswd: `fixture:${await bcrypt.hash(newPassword, 4)}` });
  await backend.restart({ t: 1 }); password = newPassword;
  await waitFor(async () => { try { return (await fetch(frontend + '/v2/')).status === 401; } catch { return false; } }, 'rotated registry did not restart', 30000);
  const rotated = await publish('rotated');
  await pull(rotated, { auth: { ...credentials(), password: oldPassword }, failure: /unauthorized|authentication required|no basic auth|denied/i });
  await pull(rotated);
  console.log('PASS registry: credential rotation rejects the old password and accepts the new one');

  const tls = await publish('tls');
  await pull(tls, { host: tlsHost, failure: /x509|certificate/i });
  console.log('PASS registry TLS: untrusted private CA is rejected');
  await trust(true);
  await pull(tls, { host: wrongHost, failure: /x509|certificate/i });
  console.log('PASS registry TLS: trusted certificate with the wrong hostname is rejected');
  await pull(tls, { host: tlsHost });
  console.log('PASS registry TLS: a matching certificate signed by the trusted private CA succeeds');

  const interrupted = await publish('interrupted');
  await control({ interruptDigest: interrupted.layerDigest });
  console.log('RUN registry: interrupting fresh layer downloads, including Engine retries');
  await pull(interrupted, { failure: /EOF|reset|closed|unexpected|download|failed/i });
  assert.ok((await control()).interrupted > 0, 'test must interrupt actual uncached layer bytes');
  assert.ok((await control()).blockedRetries > 0, 'test must exercise Engine download retries');
  await control({ interruptDigest: null });
  await pull(interrupted);
  console.log('PASS registry: interrupted layer transfer fails cleanly and a later retry succeeds');

  const outage = await publish('outage');
  await proxy.stop({ t: 1 });
  await pull(outage, { failure: /connection refused|connect|unavailable/i });
  assert.equal((await fetch(apiURL + '/info', { headers: { authorization } })).status, 200);
  await proxy.start(); await proxyReady();
  await pull(outage);
  console.log('PASS registry: outage is reported without corrupting inventory and recovery succeeds');
} finally {
  for (const ref of refs) await docker.getImage(ref).remove().catch(error => { if (error.statusCode !== 404) throw error; });
  await trust(false).catch(() => {});
  await helper(`import {readFile,writeFile} from 'node:fs/promises';const text=await readFile('/fixture-hosts','utf8');await writeFile('/fixture-hosts',text.split('\\n').filter(line=>!line.includes(process.env.MARKER)).join('\\n'));`, [`MARKER=${prefix}`]).catch(() => {});
  const containers = await docker.listContainers({ all: true, filters: { label: [`compat.registry-resilience=${suffix}`] } });
  for (const container of containers) await docker.getContainer(container.Id).remove({ force: true });
  for (const name of [authVolume, dataVolume]) await docker.getVolume(name).remove().catch(error => { if (error.statusCode !== 404) throw error; });
}
