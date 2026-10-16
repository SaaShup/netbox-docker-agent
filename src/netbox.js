import http from 'node:http';
import https from 'node:https';
export class Netbox {
  constructor(store) { this.store = store; this.errors = 0; }
  async request(method, route, body) {
    const config = this.store.config;
    if (!config.netbox_url) return null;
    const url = new URL(config.netbox_url.replace(/\/$/, '') + route);
    const payload = body === undefined ? null : JSON.stringify(body);
    try {
      return await new Promise((resolve, reject) => {
        const req = (url.protocol === 'https:' ? https : http).request(url, { method, rejectUnauthorized: !process.env.DISABLE_SSL_CHECK, timeout: 15000, headers: { Authorization: `${config.netbox_token?.startsWith('ntb_') ? 'Bearer' : 'Token'} ${config.netbox_token}`, Accept: 'application/json', ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) } }, res => {
          let data = ''; res.on('data', chunk => { data += chunk; if (data.length > 16 * 1024 * 1024) req.destroy(new Error('NetBox response too large')); });
          res.on('error', reject);
          res.on('end', () => { if (res.statusCode >= 400 || res.statusCode >= 300 && res.statusCode < 400) return reject(new Error(`NetBox HTTP ${res.statusCode}`)); try { resolve(data ? JSON.parse(data) : null); } catch { reject(new Error('Invalid NetBox JSON')); } });
        });
        req.on('timeout', () => req.destroy(new Error('NetBox timeout'))); req.on('error', reject); req.end(payload);
      });
    } catch (error) { this.errors++; throw error; }
  }
  resource(method, type, body, suffix = '') { return this.request(method, `/api/plugins/docker/${type}/${suffix}`, body); }
  journal(type, id, kind, comments) { if (id === undefined || id === '') return Promise.resolve(); return this.request('POST', '/api/extras/journal-entries/', { assigned_object_type: `netbox_docker_plugin.${type}`, assigned_object_id: id, kind, comments }); }
}
