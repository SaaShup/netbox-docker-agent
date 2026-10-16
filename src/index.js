import { Store } from './config.js';
import { dockerClient } from './docker.js';
import { Netbox } from './netbox.js';
import { Agent } from './agent.js';
import { createServer } from './server.js';
const store = await new Store().load();
const agent = new Agent(dockerClient(), store, new Netbox(store));
const server = createServer(agent);
server.listen(Number(process.env.PORT || 1880), process.env.HOST || '0.0.0.0', () => { console.log('NetBox Docker Agent listening on port ' + (process.env.PORT || 1880)); agent.start(); });
let closing = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => {
  if (closing) return; closing = true;
  const timeout = setTimeout(() => process.exit(1), 15000); timeout.unref();
  server.closeTerminals(); server.close();
  await agent.close(); clearTimeout(timeout);
});
