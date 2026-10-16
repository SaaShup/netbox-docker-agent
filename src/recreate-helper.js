import { Store } from './config.js';
import { Agent } from './agent.js';
import { Netbox } from './netbox.js';
import { dockerClient } from './docker.js';
const payload = JSON.parse(process.env.RECREATE_PAYLOAD);
delete process.env.RECREATE_PAYLOAD;
const store = await new Store('/tmp/recreate-data').load();
store.config = payload.config;
const agent = new Agent(dockerClient(), store, new Netbox(store));
agent.recreateRuntime = payload.runtime;
try { await agent.write('PUT', 'containers', payload.data); }
catch (error) { agent.log(error); process.exitCode = 1; }
