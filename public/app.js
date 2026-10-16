import { Terminal } from '/vendor/xterm.js';
// Authorize style sheets created by trusted application modules, including
// terminal components that obtain the document through ownerDocument.
const styleNonce = document.querySelector('meta[name="style-nonce"]').content;
const createElement = document.createElement.bind(document);
document.createElement = (name, options) => {
  const element = createElement(name, options);
  if (name.toLowerCase() === 'style') element.nonce = styleNonce;
  return element;
};
const $ = selector => document.querySelector(selector);
const types = ['containers', 'images', 'networks', 'volumes', 'registries'];
const state = {}; const sockets = new Set(); let noticeTimer;
function node(tag, text, cls) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
async function api(path, method = 'GET', data) {
  const res = await fetch(path, { method, headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined });
  if (!res.ok) { let msg; try { msg = (await res.json()).message; } catch {} throw Error(msg || `HTTP ${res.status}`); }
  const text = await res.text(); try { return JSON.parse(text); } catch { return text; }
}
function error(e) { $('#error').textContent = e.message; $('#error').hidden = false; }
function notify(title, text = 'Operation ongoing. Waiting for Docker…') { clearTimeout(noticeTimer); $('#modalNotificationTitle').textContent = title; $('#modalNotificationContent').textContent = text; $('#modalNotification').hidden = false; }
function dismiss() { noticeTimer = setTimeout(() => { $('#modalNotification').hidden = true; }, 1200); }
const buttonStyles = {
  start: ['M8 5l11 7-11 7z', 'positive'], unpause: ['M8 5l11 7-11 7z', 'positive'],
  stop: ['M6 6h12v12H6z', 'warning'], pause: ['M8 5v14M16 5v14', 'warning'],
  kill: ['M5 5l14 14M19 5L5 19', 'danger'], remove: ['M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7', 'danger'],
  restart: ['M20 7v5h-5M20 12a8 8 0 1 0-2 6', 'accent'], recreate: ['M20 7v5h-5M20 12a8 8 0 1 0-2 6', 'accent'],
  refresh: ['M20 7v5h-5M20 12a8 8 0 1 0-2 6', 'neutral'],
  rename: ['M4 16l12-12 4 4L8 20H4zM13 7l4 4', 'accent'],
  inspect: ['M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6', 'neutral'],
  configuration: ['M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6', 'accent'],
  logs: ['M5 5h14M5 10h14M5 15h9M5 20h9', 'neutral'],
  stats: ['M5 20V10M12 20V4M19 20v-7', 'neutral'],
  exec: ['M4 6l6 6-6 6M13 18h7', 'neutral'], terminal: ['M4 6l6 6-6 6M13 18h7', 'neutral'],
  create: ['M12 4v16M4 12h16', 'positive'], pull: ['M12 3v12M7 10l5 5 5-5M4 17v4h16v-4', 'accent'],
  save: ['M5 3h12l4 4v14H3V3h2M7 3v6h10V3M7 21v-8h10v8', 'positive'],
  disconnect: ['M8 3v5M16 3v5M5 8h14v3a7 7 0 0 1-14 0V8M12 18v3', 'danger'],
  discover: ['M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6', 'accent'],
  submit: ['M5 12l4 4L19 6', 'positive'], cancel: ['M6 6l12 12M18 6L6 18', 'neutral'],
  run: ['M8 5l11 7-11 7z', 'positive'], open: ['M4 6l6 6-6 6M13 18h7', 'accent'],
  close: ['M6 6l12 12M18 6L6 18', 'neutral'],
  prune: ['M4 7h16M8 7V4h8v3M6 7l1 14h10l1-14M10 11v6M14 11v6', 'danger'],
};
function decorateButton(e, text) {
  const key = text === 'Edit configuration' ? 'configuration' : text.toLowerCase().split(' ')[0];
  const style = buttonStyles[key]; if (!style) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); svg.classList.add('button-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', style[0]); svg.append(path);
  e.prepend(svg); e.classList.add(`action-${style[1]}`);
}
function button(text, action, cls) { const e = node('button', text, cls); e.type = 'button'; decorateButton(e, text); e.addEventListener('click', () => Promise.resolve().then(action).catch(error)); return e; }
async function waitFor(test) { for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 500)); if (await test()) return; } throw Error('Docker operation did not finish within 15 seconds. Check the agent logs.'); }
function navigate() {
  const id = location.hash.slice(1) || 'info';
  for (const section of document.querySelectorAll('main > section')) section.hidden = section.id !== id;
  for (const a of document.querySelectorAll('nav a')) { if (a.hash === `#${id}`) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  $('#page-title').textContent = id === 'info' ? 'Overview' : id === 'ssh-keys' ? 'Host SSH keys' : id.charAt(0).toUpperCase() + id.slice(1);
  if (id === 'ssh-keys' && state.sshKeysEnabled) sshWork(loadSsh);
}
function details(data) { const pre = node('pre', JSON.stringify(data, null, 2)); pre.setAttribute('aria-label', 'Inspection details'); return pre; }
function isAgent(c) { return Boolean(state.agentContainerId && c.Id.startsWith(state.agentContainerId)); }
function configuration(c) {
  const config = c.Config || {}, host = c.HostConfig || {}, network = c.NetworkSettings || {};
  const view = node('div', undefined, 'container-configuration');
  view.append(node('h4', 'Container configuration'));
  const format = value => value === undefined || value === null || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  const section = (title, entries, open = false) => {
    const group = node('details', undefined, 'config-group'); group.open = open;
    const list = node('dl');
    for (const [label, value] of entries) list.append(node('dt', label), node('dd', format(value)));
    group.append(node('summary', title), entries.length ? list : node('p', 'None configured'));
    view.append(group);
  };
  section('Runtime', [['Image', config.Image], ['Image ID', c.Image], ['Hostname', config.Hostname], ['Entrypoint', config.Entrypoint], ['Command', config.Cmd], ['User', config.User || 'Image default'], ['Working directory', config.WorkingDir], ['Restart policy', host.RestartPolicy?.Name || 'no'], ['Maximum restart attempts', host.RestartPolicy?.MaximumRetryCount]], true);
  section('Environment', (config.Env || []).map(entry => { const i = entry.indexOf('='); return i < 0 ? [entry, ''] : [entry.slice(0, i), entry.slice(i + 1)]; }));
  const ports = { ...config.ExposedPorts, ...host.PortBindings, ...network.Ports };
  section('Ports', Object.entries(ports).map(([port, bindings]) => [port, bindings?.length ? bindings.map(b => `${b.HostIp || '0.0.0.0'}:${b.HostPort}`).join(', ') : 'Not published']));
  section('Mounts', (c.Mounts || []).map(m => [m.Destination, `${m.Type}: ${m.Name || m.Source || '—'} → ${m.Destination} (${m.RW ? 'read/write' : 'read-only'})`]));
  section('Networks', [['Network mode', host.NetworkMode], ...Object.entries(network.Networks || {}).map(([name, n]) => [name, { address: n.IPAddress, ipv6: n.GlobalIPv6Address, gateway: n.Gateway, aliases: n.Aliases }])]);
  section('Labels', Object.entries(config.Labels || {}));
  section('Resources', [['Memory limit (bytes)', host.Memory || 'Unlimited'], ['Memory reservation (bytes)', host.MemoryReservation || 'None'], ['Memory and swap (bytes)', host.MemorySwap], ['CPUs', host.NanoCpus ? host.NanoCpus / 1e9 : 'No fixed limit'], ['CPU shares', host.CpuShares], ['CPU quota', host.CpuQuota], ['CPU period', host.CpuPeriod], ['CPU set', host.CpusetCpus], ['Process limit', host.PidsLimit]]);
  section('Security', [['Privileged', host.Privileged || false], ['Read-only root filesystem', host.ReadonlyRootfs || false], ['Added capabilities', host.CapAdd], ['Dropped capabilities', host.CapDrop], ['Security options', host.SecurityOpt], ['Devices', host.Devices], ['PID mode', host.PidMode], ['Extra hosts', host.ExtraHosts], ['Sysctls', host.Sysctls]]);
  section('Logging', [['Driver', host.LogConfig?.Type || 'Default'], ...Object.entries(host.LogConfig?.Config || {})]);
  section('Health check', Object.entries(config.Healthcheck || {}));
  if (isAgent(c)) view.append(node('p', 'The agent cannot recreate its own container.', 'config-hint'));
  else view.append(node('p', 'Edit supported settings in the recreation editor. Applying changes recreates the container.', 'config-hint'), button('Edit configuration', () => edit('containers', 'PUT', { ...pluginData(c), operation: 'recreate' })));
  return view;
}
async function operation(c, op) {
  notify(`Operation ${op}`);
  const data = { ContainerID: c.Id, name: c.Name.replace(/^\//, ''), operation: op, image: { name: c.Config.Image } };
  if (op === 'rename') { const name = prompt('New container name', data.name); if (!name) { dismiss(); return; } data.name = name; }
  await api('/api/engine/containers', 'PUT', { data });
  await waitFor(async () => { const list = await api('/api/containers'); const current = list.find(x => x.Id === c.Id); if (op === 'rename') return current?.Name === `/${data.name}`; return current?.State.Status === ({ start: 'running', restart: 'running', stop: 'exited', kill: 'exited', pause: 'paused', unpause: 'running' }[op]); });
  await refresh(); dismiss();
}
function containerCard(c) {
  const card = node('article', undefined, 'card'); card.dataset.name = c.Name;
  card.append(node('h3', c.Name.replace(/^\//, '')), node('p', c.Config.Image, 'meta'), node('span', c.State.Status, `badge ${c.State.Status}`));
  const actions = node('div', undefined, 'actions');
  for (const op of ['start','stop','restart','kill','pause','unpause','rename']) { const b = button(op, () => operation(c, op)); b.dataset.action = op; actions.append(b); }
  actions.append(button('Remove', async () => { if (!confirm(`Remove ${c.Name}?`)) return; notify('Delete container'); await api('/api/engine/containers', 'DELETE', { data: { ContainerID: c.Id, name: c.Name } }); await waitFor(async () => !(await api('/api/containers')).some(x => x.Id === c.Id)); await refresh(); dismiss(); }, 'danger'));
  if (!isAgent(c)) actions.append(button('Recreate', () => edit('containers', 'PUT', { ...pluginData(c), operation: 'recreate' })));
  card.append(actions);
  const tabs = node('div', undefined, 'tabs'), pane = node('div', undefined, 'pane');
  const show = (...elements) => { pane.replaceChildren(...elements); };
  const tab = (label, action) => {
    const b = button(label, async () => { for (const other of tabs.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other === b)); await action(); });
    b.setAttribute('aria-pressed', 'false'); return b;
  };
  tabs.append(tab('Configuration', () => show(configuration(c))), tab('Inspect', () => show(details(c))), tab('Logs', async () => show(node('pre', await api(`/api/engine/containers/${c.Id}/logs`)))), tab('Stats', async () => show(details(await api(`/api/engine/containers/${c.Id}/stats`)))));
  const execBtn = tab('Exec', () => {
    const input = node('input'); input.placeholder = 'echo hello'; input.setAttribute('aria-label', 'Command');
    const pre = node('pre', 'Command output');
    const run = button('Run command', async () => { const data = await api(`/api/engine/containers/${c.Id}/exec`, 'PUT', { cmd: ['/bin/sh', '-c', input.value] }); pre.textContent = data.stdout.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ''); });
    show(input, run, pre);
  }); execBtn.dataset.tab = 'exec';
  const termBtn = tab('Terminal', () => {
    const select = node('select'); select.setAttribute('aria-label', 'Shell'); for (const shell of ['/bin/sh','/bin/bash']) { const option = node('option', shell); option.value = shell; select.append(option); }
    const screen = node('div', '', 'terminal-screen'); screen.tabIndex = 0; screen.setAttribute('aria-label', 'Interactive terminal');
    const open = button('Open terminal', async () => {
      const data = await api(`/api/engine/containers/${c.Id}/ws`, 'POST');
      const url = new URL(data.path, location.href); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'; url.searchParams.set('tty', 'true'); url.searchParams.append('command', select.value);
      const ws = new WebSocket(url); sockets.add(ws); ws.binaryType = 'arraybuffer'; open.disabled = true;
      screen.replaceChildren();
      const term = new Terminal({ cursorBlink: true, screenReaderMode: true, documentOverride: document, rows: 24, cols: 80, fontSize: 13, theme: { background: '#142b38', foreground: '#d5f1e8' } });
      term.open(screen); screen.onclick = () => term.focus();
      const send = (code, data = new Uint8Array()) => { if (ws.readyState === 1) ws.send(new Uint8Array([code, ...data])); };
      const resize = () => { const cols = Math.max(20, Math.floor(screen.clientWidth / 8)); term.resize(cols, 24); const size = new Uint8Array(4); const view = new DataView(size.buffer); view.setUint16(0, 24, true); view.setUint16(2, cols, true); send(50, size); };
      const observer = new ResizeObserver(resize); observer.observe(screen);
      term.onData(data => send(0, new TextEncoder().encode(data)));
      ws.onmessage = e => { const data = new Uint8Array(e.data); if ([1,2,202].includes(data[0])) term.write(data.slice(1)); if (data[0] === 100) { resize(); term.focus(); } };
      ws.onerror = () => error(Error('Terminal connection failed')); ws.onclose = () => { observer.disconnect(); sockets.delete(ws); open.disabled = false; term.writeln('\r\n[Session closed]'); };

    });
    show(select, open, screen, button('Close terminal', () => { for (const ws of sockets) ws.close(); }));
  }); termBtn.dataset.tab = 'terminal'; tabs.append(execBtn, termBtn); card.append(tabs, pane); return card;
}
function pluginData(c) { return { ContainerID: c.Id, name: c.Name.replace(/^\//, ''), image: { ImageID: c.Image }, hostname: c.Config.Hostname, env: (c.Config.Env || []).map(x => ({ var_name: x.split('=')[0], value: x.slice(x.indexOf('=') + 1) })), labels: Object.entries(c.Config.Labels || {}).map(([key,value]) => ({key,value})), cmd: c.Config.Cmd, cap_add: c.HostConfig.CapAdd, cap_drop: c.HostConfig.CapDrop, restart_policy: c.HostConfig.RestartPolicy?.Name || 'no', network_settings: Object.entries(c.NetworkSettings.Networks || {}).map(([name,n]) => ({network:{name,NetworkID:n.NetworkID}})), mounts: (c.Mounts || []).filter(x=>x.Type==='volume').map(x=>({source:x.Destination,volume:{name:x.Name},read_only:!x.RW})), binds: (c.Mounts || []).filter(x=>x.Type==='bind').map(x=>({host_path:x.Source,container_path:x.Destination,read_only:!x.RW})), ports: Object.entries(c.HostConfig.PortBindings || {}).map(([k,v])=>({private_port:k.split('/')[0],type:k.split('/')[1],public_port:Number(v?.[0]?.HostPort||0)})), log_driver:c.HostConfig.LogConfig?.Type, log_driver_options:Object.entries(c.HostConfig.LogConfig?.Config||{}).map(([option_name,value])=>({option_name,value})), sysctls:Object.entries(c.HostConfig.Sysctls||{}).map(([key,value])=>({key,value})), pid_mode:c.HostConfig.PidMode, secOpt:c.HostConfig.SecurityOpt, extra_hosts:c.HostConfig.ExtraHosts, devices:(c.HostConfig.Devices||[]).map(x=>({host_path:x.PathOnHost,container_path:x.PathInContainer})) }; }
function resourceCard(type, r) {
  if (type === 'containers') return containerCard(r);
  const card = node('article', undefined, 'card'); const name = r.Name || r.name || r.RepoTags?.[0] || r.Id;
  card.append(node('h3', name), node('p', r.Driver || r.serveraddress || `${Math.round((r.Size || 0)/1048576)} MB`, 'meta'));
  if (type === 'images' || type === 'volumes') {
    const containers = (state.containers || []).filter(c => type === 'images'
      ? c.Image === r.Id
      : c.Mounts?.some(m => m.Type === 'volume' && m.Name === r.Name));
    const usedBy = node('div', undefined, 'resource-usage');
    const count = node('span', containers.length, 'badge usage-count');
    count.setAttribute('aria-label', `${containers.length} ${containers.length === 1 ? 'container' : 'containers'}`);
    usedBy.append(node('strong', 'Used by'), count);
    if (containers.length) {
      const list = node('ul');
      for (const c of containers) list.append(node('li', `${c.Name.replace(/^\//, '')} (${c.State.Status})`));
      usedBy.append(list);
    } else usedBy.append(node('p', 'No containers'));
    card.append(usedBy);
  }
  const actions = node('div', undefined, 'actions');
  actions.append(button('Inspect', () => { const pre = card.querySelector('pre'); if (pre) pre.remove(); else card.append(details(r)); }));
  if (type === 'images') actions.append(button('Pull', async () => { const index = name.lastIndexOf(':'); notify('Pulling image'); await api('/api/engine/images','POST',{data:{name:name.slice(0,index),version:name.slice(index+1),force:true}}); dismiss(); }));
  if (type !== 'registries') actions.append(button('Remove', async () => { if (!confirm(`Remove ${name}?`)) return; notify(type === 'images' ? 'Delete image' : `Delete ${type}`); await api(`/api/engine/${type}`, 'DELETE', { data: { name, ImageID: r.Id } }); await waitFor(async () => { const list = await api(`/api/${type}`); return !(list.Volumes || list).some(x => type === 'images' ? x.Id === r.Id : x.Name === name); }); await refresh(); dismiss(); }, 'danger'));
  card.append(actions); return card;
}
function formatUptime(value) {
  if (!Number.isFinite(value) || value < 0) return '—';
  const seconds = Math.floor(value), days = Math.floor(seconds / 86400);
  return `${days ? `${days}d ` : ''}${Math.floor(seconds / 3600) % 24}h ${Math.floor(seconds / 60) % 60}m ${seconds % 60}s`;
}
function renderContainers() { const filter = $('#container-search').value.toLowerCase(); $('#containers-list').replaceChildren(...(state.containers || []).filter(c => `${c.Name} ${c.Config.Image}`.toLowerCase().includes(filter)).map(containerCard)); }
async function refresh() {
  $('#refresh').disabled = true; $('#error').hidden = true;
  try {
    const info = await api('/info');
    state.agentContainerId = info.containerId;
    state.sshKeysEnabled = info.sshKeysEnabled;
    $('#ssh-reload').hidden = !state.sshKeysEnabled;
    if (!state.sshKeysEnabled) { $('#ssh_num').textContent = '0'; $('#ssh-status').textContent = 'Host SSH key management is disabled.'; $('#ssh-management').hidden = true; }
    else await sshWork(loadSsh);
    const results = await Promise.all([api('/system/usage'), ...types.map(t => api(`/api/${t}`))]); const usage = results[0];
    types.forEach((type, i) => { const data = results[i+1]; state[type] = data.Volumes || data; });
    types.forEach(type => { $(`#${type}_num`).textContent = state[type].length; $(`#${type}-count`).textContent = state[type].length; $(`#${type}-list`).replaceChildren(...state[type].map(r => resourceCard(type,r))); });
    renderContainers(); $('#connection').textContent = info.docker === 'error' ? 'Docker engine unavailable' : `Docker ${info.docker.Version} · Management ${info.configured === 'ok' ? 'connected' : 'not configured'}`;
    $('#info-list').replaceChildren();
    for (const [label,value] of Object.entries({ 'Agent Version': info.version, 'Docker Api': info.docker.ApiVersion, 'Engine Version': info.docker.Version, 'Host': info.dockerInfo?.Name, 'System uptime': formatUptime(info.uptime?.system), 'Agent uptime': formatUptime(info.uptime?.agent), 'Operating system': info.dockerInfo?.OperatingSystem, 'Architecture': info.docker.Arch, 'Management URL': info.config?.netbox_url || 'Not connected' })) $('#info-list').append(node('dt',label),node('dd',value || '—'));
    $('#summary').replaceChildren(...types.slice(0,4).map(t => { const box = node('article'); box.append(node('span', t.toUpperCase()),node('strong',state[t].length)); return box; }));
    const values = { Images: usage.images.size, Containers: usage.containers.size_rootfs, Volumes: usage.volumes, 'Build cache': usage.build_cache }; const total = Math.max(1,...Object.values(values));
    $('#system-usage-chart').replaceChildren();
    for (const [label,value] of Object.entries(values)) { const row = node('div',undefined,'usage-row'); const span = node('span', label); span.append(node('b',`${(value/1048576).toFixed(1)} MB`)); const bar = node('progress'); bar.max = total; bar.value = Math.max(0,value); bar.setAttribute('aria-label',label); row.append(span,bar); $('#system-usage-chart').append(row); }
  } catch(e) { error(e); } finally { $('#refresh').disabled = false; }
}
let editType, editMethod;
function edit(type, method = 'POST', data) {
  if (type === 'containers' && method === 'PUT' && isAgent({ Id: data.ContainerID })) throw Error('The agent cannot recreate its own container');
  editType = type; editMethod = method; $('#resource-title').textContent = `${method === 'PUT' ? 'Recreate' : type === 'images' ? 'Pull' : 'Create'} ${type}`;
  const templates = { containers: {name:'my-container',state:'none',image:{name:'nginx',version:'alpine'}}, images:{name:'nginx',version:'alpine',size:0,ImageID:null}, networks:{name:'my-network',driver:'bridge',state:'creating'}, volumes:{name:'my-volume',driver:'local',max_size:0} };
  $('#resource-data').value = JSON.stringify(data || templates[type],null,2); $('#resource-hint').textContent = method === 'PUT' ? 'Review the configuration. Submitting recreates the container to apply changes.' : 'Review the resource configuration before submitting.'; $('#resource-dialog').showModal();
}
for (const b of document.querySelectorAll('[data-create]')) b.addEventListener('click',()=>edit(b.dataset.create));
const pruneDescriptions = {
  containers: 'Delete all stopped containers matching the filters. Their writable layers will be lost; attached volumes are retained.',
  images: 'Delete dangling images that are not referenced by any container. Optionally include unused tagged images.',
  volumes: 'Delete unused anonymous volumes and their data. Optionally include unused named volumes.',
  networks: 'Delete unused custom networks. Built-in networks and networks attached to containers are retained.',
  'build-cache': 'Delete unused build cache on this Docker engine. This does not prune separate remote builders.',
};
let pruneType, pruneBusy = false;
for (const b of document.querySelectorAll('[data-prune]')) b.addEventListener('click', () => {
  pruneType = b.dataset.prune;
  $('#prune-form').reset(); $('#prune-error').hidden = true;
  $('#prune-title').textContent = `Prune ${pruneType.replace('-', ' ')}`;
  $('#prune-description').textContent = pruneDescriptions[pruneType];
  $('#prune-all-label').hidden = !['images', 'volumes', 'build-cache'].includes(pruneType);
  $('#prune-all-text').textContent = ({ images: 'Include all unused images, including tagged images', volumes: 'Include unused named volumes and their data', 'build-cache': 'Include all types of unused build cache' })[pruneType] || '';
  $('#prune-until-label').hidden = pruneType === 'volumes';
  $('#prune-label-label').hidden = pruneType === 'build-cache';
  $('#prune-storage-label').hidden = pruneType !== 'build-cache';
  $('#prune-dialog').showModal();
});
$('#cancel-prune').onclick = () => $('#prune-dialog').close();
$('#prune-dialog').addEventListener('cancel', e => { if (pruneBusy) e.preventDefault(); });
$('#prune-form').onsubmit = async e => {
  e.preventDefault(); if (pruneBusy) return;
  const options = {}, filters = {};
  if (['images', 'volumes', 'build-cache'].includes(pruneType)) options.all = $('#prune-all').checked;
  if (pruneType !== 'volumes' && $('#prune-until').value.trim()) filters.until = [$('#prune-until').value.trim()];
  if (pruneType !== 'build-cache' && $('#prune-label').value.trim()) filters.label = [$('#prune-label').value.trim()];
  if (pruneType === 'build-cache' && $('#prune-storage').value !== '') options.keep_storage = Number($('#prune-storage').value);
  options.filters = filters;
  pruneBusy = true; $('#prune-error').hidden = true; $('#confirm-prune').disabled = true; $('#cancel-prune').disabled = true;
  try {
    const report = await api(`/api/engine/${pruneType}/prune`, 'POST', { data: options });
    $('#prune-dialog').close();
    const records = report[({ containers: 'ContainersDeleted', images: 'ImagesDeleted', volumes: 'VolumesDeleted', networks: 'NetworksDeleted', 'build-cache': 'CachesDeleted' })[pruneType]] || [];
    notify('Prune complete', `${records.length} deletion records · ${((report.SpaceReclaimed || 0) / 1048576).toFixed(1)} MB reclaimed`);
    await refresh();
  } catch (e) { $('#prune-error').textContent = e.message; $('#prune-error').hidden = false; }
  finally { pruneBusy = false; $('#confirm-prune').disabled = false; $('#cancel-prune').disabled = false; }
};
$('#cancel-resource').onclick = () => $('#resource-dialog').close();
$('#resource-form').onsubmit = async e => { e.preventDefault(); try { const data = JSON.parse($('#resource-data').value); await api(`/api/engine/${editType}`,editMethod,{data}); $('#resource-dialog').close(); notify('Request accepted','Docker is processing the request. Refresh to check the result.'); dismiss(); } catch(e) { error(e); } };
$('#settings-form').onsubmit = async e => { e.preventDefault(); try { await api('/api/engine/endpoint?' + new URLSearchParams(new FormData(e.target))); notify('Connection saved'); dismiss(); } catch(e) { error(e); } };
$('#disconnect').onclick = async () => { try { if (confirm('Disconnect this agent from the management server?')) { await api('/api/engine/endpoint','DELETE'); await refresh(); } } catch(e) { error(e); } };
$('#sync-registries').onclick = async () => { try { await api('/api/engine/registries'); notify('Registry discovery requested'); dismiss(); } catch(e) { error(e); } };
let sshRevision, sshBusy = false;
function sshFailure(e) { $('#ssh-error').textContent = e.message; $('#ssh-error').hidden = false; }
async function loadSsh() {
  let result;
  try { result = await api('/api/ssh-keys'); }
  catch (e) { $('#ssh_num').textContent = '—'; sshRevision = undefined; $('#ssh-management').hidden = true; $('#ssh-keys-list').replaceChildren(); $('#ssh-status').textContent = 'Unable to load host SSH keys.'; throw e; }
  sshRevision = result.revision; $('#ssh_num').textContent = result.keys.length; $('#ssh-management').hidden = false;
  $('#ssh-status').textContent = `Host account: ${result.account} · ${result.keys.length} public keys`;
  $('#ssh-keys-list').replaceChildren(...result.keys.map(key => {
    const card = node('article', undefined, 'card');
    card.append(node('h3', key.comment || 'Public key'), node('p', key.type), node('p', key.fingerprint, 'meta'));
    if (key.options) card.append(node('p', `Restrictions: ${key.options}`));
    card.append(button('Remove key', () => changeSsh('DELETE', { id: key.id }, `Remove SSH key ${key.fingerprint}?`), 'danger'));
    return card;
  }));
}
async function sshWork(work) {
  if (sshBusy) return;
  sshBusy = true; $('#ssh-error').hidden = true;
  for (const b of document.querySelectorAll('#ssh-keys button')) b.disabled = true;
  try { await work(); } catch (e) { sshFailure(e); }
  finally { sshBusy = false; for (const b of document.querySelectorAll('#ssh-keys button')) b.disabled = false; }
}
async function changeSsh(method, data, question) {
  if (!confirm(question)) return;
  await sshWork(async () => {
    const result = await api('/api/ssh-keys', method, { ...data, revision: sshRevision });
    $('#ssh-public-key').value = ''; await loadSsh();
    notify('SSH keys updated', `Backup saved: ${result.backup}`); dismiss();
  });
}
$('#ssh-add-form').onsubmit = e => { e.preventDefault(); changeSsh('POST', { publicKey: $('#ssh-public-key').value.trim() }, 'Authorize this public key for SSH access to the host account?'); };
$('#ssh-reload').onclick = () => sshWork(loadSsh);
$('#refresh').onclick = refresh; $('#container-search').oninput = renderContainers;
for (const b of document.querySelectorAll('button')) decorateButton(b, b.textContent.trim());
window.addEventListener('hashchange',navigate); window.addEventListener('beforeunload',()=>{ for(const ws of sockets) ws.close(); }); navigate(); await refresh();
