import { uptime as systemUptime } from 'node:os';
import { diskUsage, usage } from './docker.js';
import { containerRecord, createOptions, imageRecord } from './mapping.js';
import { pruneDocker, pruneOptions } from './prune.js';
export class Agent {
  constructor(docker, store, netbox, version = '2.0.0') { Object.assign(this, { docker, store, netbox, version }); this.jobs = new Set(); this.pruneBlockers = new Set(); this.chains = new Map(); this.stopped = false; this.activeOperations = 0; }
  log(error) { console.error(JSON.stringify({ name: 'netbox-docker-agent', level: 'error', version: this.version, msg: error.message })); }
  enqueue(key, work, { blocksPrune = true } = {}) {
    const job = (this.chains.get(key) || Promise.resolve()).then(work).catch(error => this.log(error)).finally(() => { this.jobs.delete(job); this.pruneBlockers.delete(job); if (this.chains.get(key) === job) this.chains.delete(key); });
    if (blocksPrune) this.pruneBlockers.add(job);
    this.chains.set(key, job); this.jobs.add(job); return job;
  }
  async containers() { const list = await this.docker.listContainers({ all: true }); return Promise.all(list.map(c => this.docker.getContainer(c.Id).inspect().catch(e => { if (e.statusCode !== 404) throw e; return null; }))).then(x => x.filter(Boolean)); }
  async prune(resource, input) {
    const options = pruneOptions(resource, input);
    if (this.pruning || this.pruneBlockers.size || this.activeOperations) throw Object.assign(new Error('Another agent operation is in progress; retry when it finishes'), { statusCode: 409 });
    this.pruning = true;
    const work = (async () => {
      try {
        const report = await pruneDocker(this.docker, resource, options);
        if (resource === 'images') await this.registries(false).catch(error => this.log(error));
        const deleted = report?.[({ containers: 'ContainersDeleted', images: 'ImagesDeleted', volumes: 'VolumesDeleted', networks: 'NetworksDeleted', 'build-cache': 'CachesDeleted' })[resource]] || [];
        await this.netbox.journal('host', this.store.config.id, 'success', `pruned ${resource}: ${deleted.length} deletion records, ${report?.SpaceReclaimed || 0} bytes reclaimed`).catch(e => this.log(e));
        return report;
      } catch (error) {
        await this.netbox.journal('host', this.store.config.id, 'danger', `prune ${resource} failed: ${error.message}`).catch(e => this.log(e));
        throw error;
      }
    })();
    this.jobs.add(work);
    try { return await work; } finally { this.pruning = false; this.jobs.delete(work); }
  }
  async info() {
    const output = { message: 'netbox-saashup-agent', configured: this.store.config.netbox_token ? 'ok' : 'nok', version: this.version, flows: this.store.config.flows, containerId: process.env.HOSTNAME, sshKeysEnabled: Boolean(process.env.SSH_AUTHORIZED_KEYS_FILE), uptime: { system: systemUptime(), agent: process.uptime() } };
    try { output.docker = await this.docker.version(); output.dockerInfo = await this.docker.info(); output.config = this.store.config; } catch { output.docker = 'error'; output.configured = 'socket error'; }
    return output;
  }
  async recreationTarget(id) {
    const original = await this.docker.getContainer(id).inspect();
    if (process.env.HOSTNAME && original.Id.startsWith(process.env.HOSTNAME)) {
      throw Object.assign(new Error('The agent cannot recreate its own container'), { statusCode: 403 });
    }
    return original;
  }
  async usage() { return usage(await diskUsage(this.docker)); }
  async registries(syncManager = true, registration) {
    const refresh = (this.registryRefresh || Promise.resolve()).catch(() => {}).then(async () => {
      const images = await this.docker.listImages({ digests: true }); const grouped = new Map();
      for (const img of images) for (const ref of img.RepoTags?.length ? img.RepoTags : img.RepoDigests?.length ? img.RepoDigests : [img.Id]) {
        const part = ref.split('/')[0]; const name = ref.includes('/') && /[.:]|localhost/.test(part) ? part : 'dockerhub';
        if (!grouped.has(name)) grouped.set(name, { name, serveraddress: `https://${name}/v2/`, images: [] }); grouped.get(name).images.push(ref);
      }
      let known = syncManager && this.store.config.netbox_url ? (await this.netbox.resource('GET', 'registries', undefined, `?host_id=${encodeURIComponent(this.store.config.id)}`))?.results || [] : this.store.registries;
      if (registration) known = [...known, registration];
      for (const reg of grouped.values()) {
        const matches = x => x.name === reg.name
          || x.serveraddress?.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase() === reg.name.toLowerCase()
          || x.images?.some(ref => reg.images.includes(typeof ref === 'string' ? ref : ref.display));
        // A locally inferred entry can coexist with manager metadata during a pull.
        // Prefer the registered identity, including when it has a friendly name.
        const old = known.findLast(x => x.id !== undefined && matches(x)) || known.find(matches);
        if (old) { reg.id = old.id; reg.serveraddress = old.serveraddress; }
      }
      const fresh = [...grouped.values()].filter(x => x.name !== 'dockerhub' && !x.id);
      if (fresh.length && syncManager && this.store.config.netbox_url) {
        const created = await this.netbox.resource('POST', 'registries', fresh.map(x => ({ host: this.store.config.id, name: x.name, serveraddress: x.serveraddress })));
        for (const reg of grouped.values()) reg.id ??= (Array.isArray(created) ? created : []).find(x => x.name === reg.name)?.id;
      }
      this.store.registries = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
      for (const reg of this.store.registries) reg.images.sort();
      await this.store.save(); return this.store.registries;
    });
    this.registryRefresh = refresh;
    return refresh;
  }
  async sync(type) {
    if (type === 'registries') return this.registries();
    if (!this.store.config.netbox_url) return;
    const host = this.store.config.id;
    if (type === 'endpoint') {
      const version = await this.docker.version();
      await this.netbox.resource('PATCH', 'hosts', { id: host, endpoint: this.store.config.endpoint, state: 'running' }, `${host}/`);
      await this.netbox.resource('PATCH', 'hosts', [{ id: Number(host || 0), docker_api_version: version.ApiVersion, agent_version: `${this.version}-${this.store.config.flows}`, state: 'running', operation: 'none' }]);
    } else if (type === 'containers') { for (const c of await this.containers()) await this.netbox.resource('POST', type, containerRecord(c, host)); }
    else if (type === 'networks') { for (const n of await this.docker.listNetworks()) await this.netbox.resource('POST', type, { host, name: n.Name, driver: n.Driver ?? 'None', NetworkID: n.Id, state: 'created' }); }
    else if (type === 'volumes') { for (const v of (await this.docker.listVolumes()).Volumes || []) await this.netbox.resource('POST', type, { host, name: v.Name, driver: v.Driver }); }
    else if (type === 'images') { await this.registries(); for (const i of await this.docker.listImages({ digests: true })) await this.netbox.resource('POST', type, imageRecord(i, host, this.store.registries)); }
  }
  async callback(c, d) {
    const record = containerRecord(await c.inspect(), d.host?.id || this.store.config.id, d.id);
    return this.netbox.resource('PATCH', 'containers', [record]);
  }
  async write(method, type, d = {}) {
    const host = this.store.config.id;
    const operating = method === 'PUT' && type === 'containers' && Boolean(d?.ContainerID);
    if (operating) this.activeOperations++;
    try {
      if (method === 'DELETE') {
        if (type === 'endpoint') { this.store.config = { netbox_url: '', netbox_token: '', ui: 1, id: '', endpoint: '', flows: '0' }; this.store.registries = []; await this.store.save(); return; }
        if (['deleted', 'refreshing'].includes(d.host?.state)) return;
        if (type === 'containers' && d.ContainerID) await this.docker.getContainer(d.ContainerID).remove();
        if (type === 'volumes' && d.name) await this.docker.getVolume(d.name).remove();
        if (type === 'networks' && d.name) await this.docker.getNetwork(d.name).remove();
        if (type === 'images' && (d.ImageID || d.name)) {
          await this.docker.getImage(d.ImageID || `${d.name}:${d.version}`).remove();
          if (d.registry) this.store.registries = this.store.registries.map(r => r.id === d.registry.id ? { ...r, images: r.images.filter(x => x !== d.display) } : r).filter(r => r.images.length);
          await this.store.save();
        }
        await this.netbox.journal('host', host, 'info', `${d.name || type} removed`); return;
      }
      if (method === 'POST') {
        if (type === 'containers' && d.name && d.state === 'none') { const c = await this.docker.createContainer(createOptions(d)); await this.callback(c, d); await this.netbox.journal('container', d.id, 'success', 'container created'); }
        if (type === 'networks' && d.state === 'creating') { const n = await this.docker.createNetwork({ Name: d.name, Driver: d.driver }); await this.netbox.resource('PATCH', type, [{ id: d.id, NetworkID: n.id, state: 'created' }]); }
        if (type === 'volumes' && d.name) { const info = await this.docker.info(); await this.docker.createVolume({ Name: d.name, Driver: d.driver, ...(info.Driver !== 'overlay2' && Number(d.max_size) > 0 ? { DriverOpts: { o: `size=${d.max_size}m` } } : {}) }); }
        if (type === 'images' && ((d.size <= 0 && d.ImageID == null) || d.force === true)) {
          await this.netbox.journal('image', d.id, 'info', 'pulling image');
          const stream = await this.docker.pull(`${d.name}:${d.version}`, { authconfig: d.registry });
          await new Promise((resolve, reject) => this.docker.modem.followProgress(stream, (e, output) => { const failure = output?.find(item => item.error); return e || failure ? reject(e || new Error(failure.error)) : resolve(); }));
          const im = await this.docker.getImage(`${d.name}:${d.version}`).inspect();
          const record = imageRecord(im, host, this.store.registries);
          if (d.force && (record.Digest !== d.Digest || im.Id !== d.ImageID) && d.ImageID) {
            await this.netbox.resource('PATCH', type, [{ id: d.id, version: d.ImageID.split(':').at(-1).slice(0, 12) }]);
            await this.netbox.resource('POST', type, { ...record, name: d.name, version: d.version, registry: { id: d.registry?.id } });
          } else await this.netbox.resource('PATCH', type, [{ id: d.id, size: record.size, ImageID: im.Id, Digest: record.Digest }]);
          if (d.registry) await this.registries(false, { id: d.registry.id, name: d.registry.name, serveraddress: d.registry.serveraddress, images: [`${d.name}:${d.version}`] });
          await this.netbox.journal('image', d.id, 'success', 'pulled image');
        }
        if (type === 'endpoint' && d.operation === 'refresh' && d.state === 'refreshing') {
          for (const resource of ['containers', 'images', 'volumes', 'networks']) await this.netbox.resource('DELETE', resource, (d[resource] || []).map(x => ({ id: x.id })));
          for (const resource of ['endpoint', 'networks', 'volumes', 'images', 'containers']) await this.sync(resource);
          await this.netbox.journal('host', host, 'info', 'agent refreshed');
        }
      }
      if (method === 'PUT' && type === 'containers' && d.ContainerID) {
        let c = this.docker.getContainer(d.ContainerID);
        await this.netbox.journal('container', d.id, 'info', `operating ${d.operation}: pending`);
        if (d.operation === 'recreate') {
          const original = await this.recreationTarget(d.ContainerID);
          c = this.docker.getContainer(original.Id);
          const backup = `${d.name}-${Date.now()}`;
          if (original.State.Running) await c.stop();
          await c.rename({ name: backup }); let replacement;
          try {
            const options = createOptions(d, true);
            if (this.recreateRuntime) { Object.assign(options, this.recreateRuntime.config); Object.assign(options.HostConfig, this.recreateRuntime.hostConfig); }
            replacement = await this.docker.createContainer(options);
            for (const n of (d.network_settings || []).slice(1)) await this.docker.getNetwork(n.network.NetworkID || n.network.name).connect({ Container: replacement.id });
            await replacement.start();
          } catch (error) { if (replacement) await replacement.remove({ force: true }).catch(() => {}); await c.rename({ name: d.name }); if (original.State.Running) await c.start(); throw error; }
          await c.remove(); c = replacement;
        } else if (d.operation === 'none' || d.operation === 'rename') {
          const current = await c.inspect();
          c = this.docker.getContainer(current.Id);
          if (d.operation === 'none') await c.update({ RestartPolicy: { Name: d.restart_policy || 'no' } });
          if (d.name && current.Name.replace(/^\//, '') !== d.name) await c.rename({ name: d.name });
        }
        else if (['start', 'stop', 'restart', 'kill', 'pause', 'unpause'].includes(d.operation)) await c[d.operation]();
        else return;
        // Manager callbacks can produce another webhook with operation "none".
        // As in the legacy flow, settings saves and renames finish without a
        // container PATCH, breaking that cycle and preserving staged settings.
        if (!['none', 'rename'].includes(d.operation)) await this.callback(c, d);
        await this.netbox.journal('container', d.id, 'success', `operation ${d.operation}: ok`);
      }
    } catch (error) { await this.netbox.journal(type === 'images' ? 'image' : 'container', d.id, 'danger', `operation ${d.operation || method}: failed ${error.message}`).catch(e => this.log(e)); throw error; }
    finally {
      if (type === 'images') await this.registries(false).catch(error => this.log(error));
      if (operating) this.activeOperations--;
    }
  }
  async event(event) {
    if (event.Type === 'image') return this.registries(false);
    if (event.Type !== 'container' || !['start','restart','stop','kill','oom','die','pause','unpause'].includes(event.Action) || !this.store.config.netbox_url) return;
    if (this.activeOperations > 0 && !['pause', 'unpause'].includes(event.Action)) return;
    const c = await this.docker.getContainer(event.id || event.Actor.ID).inspect();
    const found = await this.netbox.resource('GET', 'containers', undefined, `?host_id=${encodeURIComponent(this.store.config.id)}&name=${encodeURIComponent(c.Name.replace(/^\//, ''))}`);
    if (found?.count === 1) {
      const record = containerRecord(c, this.store.config.id, found.results[0].id);
      await this.netbox.resource('PATCH', 'containers', { state: record.state, ContainerID: c.Id, operation: 'none', exitCode: record.exitCode, status: record.status }, `${record.id}/`);
    }
  }
  async watch() {
    if (this.stopped) return;
    try {
      const stream = await this.docker.getEvents(); this.events = stream;
      if (this.stopped) { stream.destroy(); return; }
      let buffer = '';
      stream.on('data', chunk => {
        buffer += chunk.toString();
        if (buffer.length > 1024 * 1024) { stream.destroy(new Error('Event frame too large')); return; }
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, index); buffer = buffer.slice(index + 1); try { const event = JSON.parse(line); this.enqueue(`event:${event.Actor?.ID || event.id}`, () => this.event(event), { blocksPrune: false }); } catch { /* ignore empty/malformed frames */ } }
      });
      const reconnect = () => { if (this.events !== stream) return; this.events = null; if (!this.stopped) this.reconnect = setTimeout(() => this.watch(), 1000); };
      stream.once('error', error => { this.log(error); stream.destroy(); reconnect(); }); stream.once('end', reconnect); stream.once('close', reconnect);
    } catch (error) { this.log(error); if (!this.stopped) this.reconnect = setTimeout(() => this.watch(), 1000); }
  }
  start() {
    this.watch();
    this.persistence = setInterval(() => this.store.save().catch(e => this.log(e)), 60000);
    const check = async () => {
      await this.registries(false);
      if (!this.store.config.netbox_url) return;
      const remote = await this.netbox.resource('GET', 'hosts', undefined, `${this.store.config.id}/`);
      if (remote && remote.agent_version !== `${this.version}-${this.store.config.flows}`) await this.netbox.resource('PATCH', 'hosts', [{ id: Number(this.store.config.id || 0), agent_version: `${this.version}-${this.store.config.flows}`, operation: 'refresh' }]);
    };
    this.updates = setInterval(() => this.enqueue('update', check, { blocksPrune: false }), 60000);
    this.enqueue('startup', async () => { await this.netbox.journal('host', this.store.config.id, 'info', 'agent restarted'); await check();
      if (this.store.config.netbox_url) {
        const remote = await this.netbox.resource('GET', 'registries', undefined, `?host_id=${encodeURIComponent(this.store.config.id)}`);
        this.store.registries = (remote?.results || []).map(r => ({ id: r.id, name: r.name, serveraddress: r.serveraddress, images: (r.images || []).map(i => typeof i === 'string' ? i : i.display) })).filter(r => r.images.length);
        await this.store.save();
      } }, { blocksPrune: false });
    this.enqueue('startup', () => this.registries(false), { blocksPrune: false });
  }
  async close() { this.stopped = true; clearTimeout(this.reconnect); clearInterval(this.persistence); clearInterval(this.updates); this.events?.destroy(); await Promise.allSettled([...this.jobs]); await this.store.save(); }
}
