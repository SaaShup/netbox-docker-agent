import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
export const defaults = { netbox_url: '', netbox_token: '', ui: 1, id: '', endpoint: '', flows: '0' };
export class Store {
  constructor(directory = process.env.DATAPATH || '/data') { this.directory = directory; this.config = { ...defaults }; this.registries = []; }
  async load() {
    await mkdir(this.directory, { recursive: true });
    for (const [key, file] of [['config', 'config.js'], ['registries', 'registries.js']]) {
      try { this[key] = JSON.parse(await readFile(path.join(this.directory, file), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw new Error(`Invalid JSON in ${file}`, { cause: error }); }
    }
    this.config = { ...defaults, ...this.config, flows: '0' };
    if (process.env.NETBOX_URL) this.config.netbox_url = process.env.NETBOX_URL;
    return this;
  }
  async save() {
    // Serialize writes to prevent concurrent webhook/persistence races.
    this.pending = (this.pending || Promise.resolve()).catch(() => {}).then(async () => {
      for (const key of ['config', 'registries']) {
        const target = path.join(this.directory, `${key}.js`);
        await writeFile(`${target}.tmp`, JSON.stringify(this[key], null, 2), { mode: 0o600 });
        await rename(`${target}.tmp`, target);
      }
    });
    return this.pending;
  }
}
