import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { authenticated, sameOrigin } from './auth.js';
import { collect } from './docker.js';
import { metrics } from './metrics.js';
import { terminals } from './terminal.js';
import { hostSshKeys } from './host-ssh.js';
const assets = { '/theme.js': ['theme.js', 'text/javascript'], '/saashup-logo.svg': ['saashup-logo.svg', 'image/svg+xml'], '/vendor/swagger-ui-bundle.js': ['../node_modules/swagger-ui-dist/swagger-ui-bundle.js', 'text/javascript'], '/vendor/swagger-ui.css': ['../node_modules/swagger-ui-dist/swagger-ui.css', 'text/css'], '/doc.css': ['doc.css', 'text/css'], '/vendor/xterm.js': ['../node_modules/@xterm/xterm/lib/xterm.mjs', 'text/javascript'], '/vendor/xterm.css': ['../node_modules/@xterm/xterm/css/xterm.css', 'text/css'], '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/doc': ['doc.html', 'text/html'], '/doc.js': ['doc.js', 'text/javascript'], '/openapi': ['openapi.yml', 'application/yaml'], '/openapi.yml': ['openapi.yml', 'application/yaml'], '/openapi.json': ['openapi.json', 'application/json'] };
function send(res, status, body, type = 'application/json') { if (res.destroyed || res.writableEnded) return; res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` }); res.end(type === 'application/json' && !Buffer.isBuffer(body) ? JSON.stringify(body) : body); }
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 1024 * 1024) throw Object.assign(new Error('Request body too large'), { statusCode: 413 }); chunks.push(chunk); }
  if (!size) return {};
  try { const data = JSON.parse(Buffer.concat(chunks)); if (data === null || Array.isArray(data) || typeof data !== 'object') throw Error(); return data; }
  catch { throw Object.assign(new Error('Invalid JSON object'), { statusCode: 400 }); }
}
export function createServer(agent) {
  let terminal;
  const server = http.createServer({ requestTimeout: 30000, headersTimeout: 10000, maxHeaderSize: 16384 }, async (req, res) => {
    const styleNonce = randomBytes(18).toString('base64');
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self' 'nonce-${styleNonce}'; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`);
    try {
      const url = new URL(req.url, 'http://localhost'); const route = url.pathname;
      if (route === '/doc') res.setHeader('Content-Security-Policy', res.getHeader('Content-Security-Policy') + "; style-src-attr 'unsafe-inline'; img-src 'self' data:");
      if (!await authenticated(req)) { res.setHeader('WWW-Authenticate', 'Basic realm="Paashup Agent", charset="UTF-8"'); return send(res, 401, { message: 'Unauthorized' }); }
      if ((req.method !== 'GET' && req.method !== 'HEAD' || route.startsWith('/api/engine/')) && !sameOrigin(req)) return send(res, 403, { message: 'Cross-origin request rejected' });
      if (route === '/api/ssh-keys') {
        if (!['GET', 'POST', 'DELETE'].includes(req.method)) { res.setHeader('Allow', 'GET, POST, DELETE'); return send(res, 405, { message: 'Method not allowed' }); }
        const result = await hostSshKeys(req.method, req.method === 'GET' ? undefined : await body(req));
        if (req.method !== 'GET') console.info(JSON.stringify({ event: 'ssh-key-request', action: req.method, user: process.env.API_USERNAME || 'admin', time: new Date().toISOString() }));
        return send(res, 200, result);
      }
      if (route === '/admin/config') {
        if (req.method === 'GET') return send(res, 200, agent.store.config);
        if (req.method === 'PATCH') {
          const config = await body(req);
          const keys = ['netbox_url', 'netbox_token', 'ui', 'id', 'endpoint'];
          if (config.netbox_url && !['http:', 'https:'].includes(new URL(config.netbox_url).protocol)) return send(res, 400, { message: 'Management URL must use HTTP or HTTPS' });
          for (const key of keys) if (Object.hasOwn(config, key)) agent.store.config[key] = config[key];
          if (process.env.NETBOX_URL) agent.store.config.netbox_url = process.env.NETBOX_URL;
          await agent.store.save(); return send(res, 200, agent.store.config);
        }
      }
      if ((req.method === 'GET' || req.method === 'HEAD') && assets[route]) { const [name, type] = assets[route]; let data = req.method === 'HEAD' ? '' : await readFile(new URL(`../public/${name}`, import.meta.url)); if (route === '/' && req.method !== 'HEAD') data = data.toString().replace('<head>', `<head><meta name="style-nonce" content="${styleNonce}">`); return send(res, 200, data, type); }
      if (req.method === 'GET' && route === '/info') return send(res, 200, await agent.info());
      if (req.method === 'GET' && route === '/system/usage') return send(res, 200, await agent.usage());
      if (req.method === 'GET' && route === '/metrics') return send(res, 200, await metrics(agent), 'text/plain');
      if (req.method === 'GET' && route === '/api/containers') return send(res, 200, await agent.containers());
      if (req.method === 'GET' && route === '/api/images') return send(res, 200, await agent.docker.listImages({ digests: true }));
      if (req.method === 'GET' && route === '/api/volumes') { const data = await agent.docker.listVolumes(); return send(res, 200, { ...data, Volumes: data.Volumes || [], Warnings: data.Warnings || null }); }
      if (req.method === 'GET' && route === '/api/networks') return send(res, 200, await agent.docker.listNetworks());
      if (req.method === 'GET' && route === '/api/registries') return send(res, 200, await agent.registries(false));
      const prune = route.match(/^\/api\/engine\/([^/]+)\/prune$/);
      if (prune) {
        if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { message: 'Prune requires POST' }); }
        return send(res, 200, await agent.prune(prune[1], await body(req)));
      }
      const extra = route.match(/^\/api\/engine\/containers\/([^/]+)\/(exec|logs|stats|ws)$/);
      if (extra) {
        const id = decodeURIComponent(extra[1]), action = extra[2], c = agent.docker.getContainer(id);
        if (action === 'exec' && req.method === 'PUT') {
          const input = await body(req);
          // The legacy synchronous disabled-exec response is a 200 echo of
          // Docker's exec options; it never creates or starts an exec.
          if (process.env.DISABLE_EXEC) return send(res, 200, JSON.stringify({ AttachStdin: false, AttachStdout: true, AttachStderr: true, Tty: false, Cmd: input.cmd }), 'text/plain');
          if (!Array.isArray(input.cmd) || input.cmd.length === 0 || input.cmd.some(x => typeof x !== 'string')) return send(res, 400, { message: 'cmd must be an array of strings' });
          const exec = await c.exec({ AttachStdin: false, AttachStdout: true, AttachStderr: true, Tty: false, Cmd: input.cmd });
          return send(res, 200, JSON.stringify({ stdout: (await collect(await exec.start({ Detach: false, Tty: false }))).toString('utf8') }), 'text/plain');
        }
        if (action === 'logs' && req.method === 'GET') {
          const data = await collect(await c.logs({ stdout: true, stderr: true, timestamps: true, tail: 50 }));
          return data.length ? send(res, 200, data.subarray(8).toString('utf8'), 'text/plain') : send(res, 200, '{}', 'text/plain');
        }
        if (action === 'stats' && req.method === 'GET') return send(res, 200, await c.stats({ stream: false }));
        if (action === 'ws' && req.method === 'POST') {
          if (process.env.DISABLE_EXEC) return send(res, 403, { code: 403, message: 'Exec stream is disabled' });
          const containers = await agent.docker.listContainers({ all: true });
          if (!containers.some(c => c.Id === id && c.State === 'running')) return send(res, 404, { code: 404, message: 'Containers not found' });
          return send(res, 200, { path: terminal.allow(id) });
        }
      }
      const engine = route.match(/^\/api\/engine\/([^/]+)$/);
      if (engine && ['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
        if (agent.pruning) return send(res, 409, { message: 'Prune is in progress; retry when it finishes' });
        const type = engine[1]; const input = req.method === 'GET' ? {} : await body(req);
        // A prune can start while a streamed request body is being received.
        if (agent.pruning) return send(res, 409, { message: 'Prune is in progress; retry when it finishes' });
        if (req.method === 'GET' && type === 'endpoint' && url.searchParams.has('url')) {
          const value = process.env.NETBOX_URL || url.searchParams.get('url');
          if (value && !['http:', 'https:'].includes(new URL(value).protocol)) return send(res, 400, { message: 'Management URL must use HTTP or HTTPS' });
          Object.assign(agent.store.config, { netbox_url: value, id: url.searchParams.get('id') || '', netbox_token: url.searchParams.get('token') || '', endpoint: url.searchParams.get('endpoint') || '' }); await agent.store.save();
        }
        if (req.method === 'PUT' && type === 'containers' && input.data?.operation === 'recreate') await agent.recreationTarget(input.data.ContainerID);
        // Preserve the original acknowledgment payload: body for writes, {} for reads.
        send(res, 202, input);
        agent.enqueue(`${type}:${input.data?.ContainerID || input.data?.name || ''}`, async () => {
          if (req.method !== 'GET') return agent.write(req.method, type, input.data);
          if (type !== 'endpoint') return agent.sync(type);
          // Registration fans out to every inventory, as the legacy flow did.
          // One rejected inventory must not prevent the others from importing.
          for (const resource of ['endpoint', 'networks', 'volumes', 'images', 'containers']) {
            try { await agent.sync(resource); } catch (error) { agent.log(error); }
          }
        }); return;
      }
      return send(res, 404, { message: 'Not found' });
    } catch (error) { const status = error.statusCode || 502; send(res, status >= 400 && status < 600 ? status : 500, { message: error.message }); }
  });
  terminal = terminals(server, agent.docker);
  server.on('close', () => terminal.close());
  server.closeTerminals = () => terminal.close();
  return server;
}
