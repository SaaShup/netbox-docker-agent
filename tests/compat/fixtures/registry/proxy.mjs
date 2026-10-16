// Test-only registry fault injector. The backend remains a real Distribution registry.
import http from 'node:http';
import https from 'node:https';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

let target;
let interruptDigest;
const stats = { interrupted: 0, blockedRetries: 0, blobRequests: 0 };
if (!existsSync('/auth/htpasswd')) writeFileSync('/auth/htpasswd', process.env.FIXTURE_HTPASSWD + '\n');

function proxy(request, response) {
  if (!target) { response.writeHead(503); response.end('fixture backend not configured'); return; }
  if (interruptDigest && request.method === 'GET' && request.url.includes(interruptDigest) && stats.interrupted) {
    // Keep the layer unavailable after the first cut so range retries cannot
    // gradually finish the download before the test explicitly restores it.
    stats.blockedRetries++;
    response.writeHead(503); response.end('fixture layer transfer remains interrupted'); return;
  }
  const upstream = http.request(new URL(request.url, target), {
    method: request.method, headers: { ...request.headers, host: new URL(target).host },
  }, incoming => {
    response.writeHead(incoming.statusCode, incoming.headers);
    if (request.method === 'GET' && request.url.includes('/blobs/')) stats.blobRequests++;
    if (interruptDigest && request.method === 'GET' && request.url.includes(interruptDigest) && incoming.statusCode === 200) {
      incoming.once('data', chunk => {
        stats.interrupted++;
        response.write(chunk.subarray(0, Math.max(1, Math.floor(chunk.length / 2))));
        setImmediate(() => { incoming.destroy(); response.destroy(); });
      });
    } else incoming.pipe(response);
    incoming.on('error', () => response.destroy());
  });
  upstream.on('error', () => {
    if (!response.headersSent) { response.writeHead(502); response.end('fixture backend unavailable'); }
    else response.destroy();
  });
  request.pipe(upstream);
  response.on('close', () => upstream.destroy());
}

const plain = http.createServer(proxy);
const tls = https.createServer({
  key: Buffer.from(process.env.FIXTURE_TLS_KEY, 'base64'),
  cert: Buffer.from(process.env.FIXTURE_TLS_CERT, 'base64'),
}, proxy);
const control = http.createServer(async (request, response) => {
  if (request.method === 'POST') {
    let raw = ''; for await (const chunk of request) raw += chunk;
    const options = JSON.parse(raw);
    if ('target' in options) target = options.target;
    if ('interruptDigest' in options) interruptDigest = options.interruptDigest;
    if (options.htpasswd) writeFileSync('/auth/htpasswd', options.htpasswd + '\n');
  }
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(stats));
});
plain.listen(5000, '0.0.0.0');
tls.listen(5443, '0.0.0.0');
control.listen(5001, '0.0.0.0');
