import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { DockerExecClient } from '../../src/exec-client.js';

async function endpoint(t, options = {}) {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1', ...options });
  await once(server, 'listening');
  t.after(async () => { for (const peer of server.clients) peer.terminate(); await new Promise(resolve => server.close(resolve)); });
  return { server, url: `ws://127.0.0.1:${server.address().port}/exec` };
}

test('external exec client handles queued stdin, pause/resume, output channels, resize and exit', async t => {
  const { server, url } = await endpoint(t);
  const client = new DockerExecClient({ url, tty: false, command: ['sh', '-c', 'exit 7'], wsopts: { headers: { authorization: 'test' } } });
  client.close(); // Closing before execute is safe.
  t.after(() => client.socket?.terminate());
  const connected = once(server, 'connection');
  const executing = client.execute();
  client.stdin.write('queued');
  const [peer, req] = await connected;
  await executing;
  const parsed = new URL(req.url, url);
  assert.equal(parsed.searchParams.get('tty'), 'false');
  assert.deepEqual(parsed.searchParams.getAll('command'), ['sh', '-c', 'exit 7']);
  assert.equal(req.headers.authorization, 'test');
  let frame = once(peer, 'message'); peer.send(Buffer.from([100]));
  assert.equal((await frame)[0].toString(), '\x00queued');
  frame = once(peer, 'message'); client.stdin.write('live');
  assert.equal((await frame)[0].toString(), '\x00live');
  const stdout = once(client.stdout, 'data'), stderr = once(client.stderr, 'data');
  peer.send(Buffer.from([101])); peer.send(Buffer.from('\x01paused'));
  assert.equal((await stdout)[0].toString(), 'paused');
  client.stdin.write('buffered');
  frame = once(peer, 'message'); peer.send(Buffer.from([100]));
  assert.equal((await frame)[0].toString(), '\x00buffered');
  peer.send(Buffer.from('\x02error output'));
  assert.equal((await stderr)[0].toString(), 'error output');
  frame = once(peer, 'message'); client.resize(24, 80);
  assert.deepEqual([...((await frame)[0])], [50, 24, 0, 80, 0]);
  frame = once(peer, 'message'); client.send(101);
  assert.deepEqual([...((await frame)[0])], [101]);
  const error = once(client, 'error'); peer.send(Buffer.concat([Buffer.from([202]), Buffer.from('exec failed')]));
  assert.equal((await error)[0].message, 'exec failed');
  const exit = once(client, 'exit'); peer.send(Buffer.from([200, 7]));
  assert.equal((await exit)[0], 7);
  const ended = [once(client.stdout, 'end'), once(client.stderr, 'end'), once(client.socket, 'close')];
  client.close(); await Promise.all(ended);
  client.send(0, Buffer.from('late input'));
});

for (const command of [undefined, 'bash']) {
  test(`external exec client defaults to TTY with ${command || 'the default shell'}`, async t => {
    const { server, url } = await endpoint(t);
    const client = new DockerExecClient({ url, command });
    t.after(() => client.socket?.terminate());
    const connected = once(server, 'connection');
    const executing = client.execute();
    const [peer, req] = await connected; await executing;
    const parsed = new URL(req.url, url);
    assert.equal(parsed.searchParams.get('tty'), 'true');
    assert.deepEqual(parsed.searchParams.getAll('command'), [command || 'sh']);
    const failure = once(client, 'error');
    // An invalid WebSocket opcode simulates a broken server connection.
    peer._socket.write(Buffer.from([0x83, 0]));
    assert.match((await failure)[0].message, /Invalid WebSocket frame/);
  });
}

test('external exec client rejects a denied WebSocket handshake', async t => {
  const { url } = await endpoint(t, { verifyClient: () => false });
  const client = new DockerExecClient({ url });
  t.after(() => client.socket?.terminate());
  await assert.rejects(client.execute(), /401/);
});
