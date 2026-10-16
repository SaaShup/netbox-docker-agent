// Real dangling/tagged image deletion and populated Engine BuildKit cache.
// Run inside the agent container, against the isolated compatibility daemon.
import assert from 'node:assert/strict';
const engineURL = process.env.DIND_URL || 'http://dind:2375';
const agentURL = process.env.BASE_URL || 'http://127.0.0.1:1880';
const authorization = 'Basic ' + Buffer.from(`${process.env.API_USERNAME || 'admin'}:${process.env.TEST_PASSWORD || 'saashup'}`).toString('base64');
async function engine(path, method = 'GET', body) {
  const response = await fetch(engineURL + path, { method, body, ...(body ? { headers: { 'Content-Type': 'application/x-tar' } } : {}) });
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${response.ok ? '' : await response.text()}`);
  return response;
}
async function prune(resource, data) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await fetch(`${agentURL}/api/engine/${resource}/prune`, { method: 'POST', headers: { authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) });
    if (response.status === 409) { await response.text(); await new Promise(resolve => setTimeout(resolve, 250)); continue; }
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }
  throw Error('Agent remained busy during prune test');
}
async function progress(response) {
  const messages = (await response.text()).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const error = messages.find(message => message.error || message.errorDetail);
  assert.equal(error, undefined, JSON.stringify(error));
}
async function importImage(tag, variant) {
  const query = new URLSearchParams({ fromSrc: '-', repo: tag.split(':')[0], tag: 'latest' });
  query.append('changes', 'LABEL compat.prune-image=yes'); query.append('changes', `LABEL compat.variant=${variant}`);
  query.append('changes', 'CMD ["/not-started"]');
  await progress(await engine('/images/create?' + query, 'POST', Buffer.alloc(1024)));
  return (await (await engine(`/images/${tag}/json`)).json()).Id;
}
function tar(files) {
  const chunks = [];
  for (const [name, contents] of Object.entries(files)) {
    const body = Buffer.from(contents), header = Buffer.alloc(512);
    header.write(name, 0, 100); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(body.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136);
    header.fill(32, 148, 156); header.write('0', 156); header.write('ustar\0', 257); header.write('00', 263);
    header.write([...header].reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    chunks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return Buffer.concat([...chunks, Buffer.alloc(1024)]);
}

try {
  const used = await importImage('nda-prune-used:latest', 'used');
  const old = await importImage('nda-prune-unused:latest', 'old');
  const unused = await importImage('nda-prune-unused:latest', 'new');
  assert.notEqual(old, unused);
  const response = await fetch(engineURL + '/containers/create?name=nda-prune-image-guard', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ Image: used }),
  });
  assert.equal(response.status, 201, await response.clone().text());
  const defaults = await prune('images', { filters: { label: ['compat.prune-image=yes'] } });
  assert.ok(defaults.ImagesDeleted?.some(record => record.Deleted === old), 'default prune deletes dangling image');
  await engine(`/images/${unused}/json`);
  const all = await prune('images', { all: true, filters: { label: ['compat.prune-image=yes'] } });
  assert.ok(all.ImagesDeleted?.some(record => record.Deleted === unused), 'all=true deletes unused tagged image');
  await engine(`/images/${used}/json`); // A stopped container also protects an image.
  console.log('PASS prune: dangling/tagged images deleted, stopped-container image retained');

  const context = tar({ Dockerfile: 'FROM scratch\nCOPY marker /marker\nLABEL compat.prune-cache=yes\n', marker: 'real cache fixture\n' });
  await progress(await engine('/build?version=2&t=nda-prune-cache:latest', 'POST', context));
  const before = await (await engine('/system/df')).json();
  assert.ok(before.BuildCache?.length > 0, 'test must populate Engine BuildKit cache before pruning');
  const recent = await prune('build-cache', { all: true, keep_storage: 0, filters: { until: ['24h'] } });
  assert.equal(recent.CachesDeleted?.length || 0, 0, 'age filter must retain freshly built cache');
  // No age filter for deletion of fresh fixtures: Docker 27 rounds relative
  // cutoffs to whole seconds, so until=0s can exclude same-second records.
  const cache = await prune('build-cache', { all: true, keep_storage: 0 });
  assert.ok(cache.CachesDeleted?.length > 0, 'populated BuildKit cache must be pruned');
  assert.ok(cache.SpaceReclaimed >= 0);
  console.log(`PASS prune: ${cache.CachesDeleted.length} populated BuildKit cache records deleted`);
} finally {
  await fetch(engineURL + '/containers/nda-prune-image-guard?force=true', { method: 'DELETE' });
  for (const image of ['nda-prune-used:latest', 'nda-prune-unused:latest', 'nda-prune-cache:latest']) await fetch(engineURL + `/images/${image}?force=true`, { method: 'DELETE' });
}
