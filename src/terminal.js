import { WebSocketServer, WebSocket } from 'ws';
import { authenticated, sameOrigin } from './auth.js';
import { Writable } from 'node:stream';
export function terminals(server, docker) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  const allowed = new Map();
  let closed = false;
  server.on('upgrade', async (req, socket, head) => {
    socket.on('error', () => {});
    try {
      const url = new URL(req.url, 'http://localhost');
      const expiry = allowed.get(url.pathname);
      if (!expiry || expiry < Date.now() || process.env.DISABLE_EXEC || !sameOrigin(req) || !await authenticated(req)) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
      }
      wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
    } catch { socket.destroy(); }
  });
  wss.on('connection', async (ws, req) => {
    let stream, exec;
    const send = (code, data = Buffer.alloc(0)) => { if (ws.readyState !== WebSocket.OPEN) return; if (ws.bufferedAmount > 8 * 1024 * 1024) { stream?.destroy(); ws.close(1013, 'Terminal output buffer exceeded'); return; } ws.send(Buffer.concat([Buffer.from([code]), Buffer.from(data)])); };
    ws.on('error', () => stream?.destroy());
    ws.on('close', () => stream?.destroy());
    try {
      const url = new URL(req.url, 'http://localhost');
      const id = decodeURIComponent(url.pathname.split('/')[4]);
      const commands = url.searchParams.getAll('command');
      const command = commands.length ? commands : ['/bin/sh'];
      const tty = url.searchParams.get('tty') !== 'false';
      exec = await docker.getContainer(id).exec({ AttachStdin: true, AttachStdout: true, AttachStderr: true, Tty: tty, Cmd: command });
      stream = await exec.start({ hijack: true, stdin: true, Tty: tty });
      if (ws.readyState !== WebSocket.OPEN) { stream.destroy(); return; }
      if (tty) stream.on('data', data => send(1, data));
      else docker.modem.demuxStream(stream, new Writable({ write(data, enc, cb) { send(1, data); cb(); } }), new Writable({ write(data, enc, cb) { send(2, data); cb(); } }));
      stream.on('error', error => { send(202, error.message); ws.close(); });
      stream.on('end', async () => { try { send(200, Buffer.from([(await exec.inspect()).ExitCode || 0])); } catch { send(202, 'Unable to inspect exit status'); } ws.close(); });
      ws.on('message', data => {
        const code = data[0];
        if (code === 0) { if (!stream.write(data.subarray(1))) { send(101); stream.once('drain', () => send(100)); } }
        if (code === 50 && data.length === 5 && tty) exec.resize({ h: data.readUInt16LE(1), w: data.readUInt16LE(3) }).catch(() => {});
        if (code === 100) stream.resume();
        if (code === 101) stream.pause();
        if (code === 102) stream.end();
      });
      send(100);
    } catch (error) { send(202, error.message); ws.close(); }
  });
  const reap = setInterval(() => { for (const [key, expiry] of allowed) if (expiry < Date.now()) allowed.delete(key); for (const client of wss.clients) { if (client.bufferedAmount > 8 * 1024 * 1024) client.terminate(); } }, 30000);
  return { allow(id) { const path = `/ws/engine/containers/${id}/exec`; allowed.set(path, Date.now() + 300000); return path; }, close() {
    if (closed) return;
    closed = true; clearInterval(reap);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(Buffer.from([201]), () => client.close(1001, 'Agent shutting down'));
      else client.terminate();
      const timeout = setTimeout(() => client.terminate(), 1000); timeout.unref();
    }
    wss.close();
  } };
}
