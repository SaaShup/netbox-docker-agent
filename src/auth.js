import { timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
const defaultHash = '$2a$08$s.NFdSn4Gm4d7gHErya//e6O8RO1/3f7TZ7zflXJ9jfFV0cI6jGwK';
function equal(a, b) { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
export async function authenticated(req) {
  const user = process.env.API_USERNAME || 'admin';
  const password = process.env.API_PASSWORD || defaultHash;
  const header = req.headers.authorization || '';
  if (!/^Basic [A-Za-z0-9+/]+=*$/i.test(header) || header.length > 2048) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString();
  const colon = decoded.indexOf(':');
  if (colon < 0 || !equal(decoded.slice(0, colon), user)) return false;
  const supplied = decoded.slice(colon + 1);
  return /^\$2[aby]\$/.test(password) ? bcrypt.compare(supplied, password) : equal(supplied, password);
}
export function sameOrigin(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  if (!req.headers.origin) return true; // NetBox and other server clients do not send Origin.
  try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
}
