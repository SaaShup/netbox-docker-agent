import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, createPublicKey, ECDH, randomUUID } from 'node:crypto';
import { isUtf8 } from 'node:buffer';
import path from 'node:path';

const digest = value => createHash('sha256').update(value).digest('hex');
export const sshError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

// Decode SSH's length-prefixed wire format, never execute supplied key text.
export function publicKey(line) {
  if (typeof line !== 'string' || line.length > 16384 || /[\x00-\x08\x0a-\x1f\x7f]/.test(line)) throw sshError(400, 'Supply one OpenSSH public key');
  const match = /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521))[ \t]+([A-Za-z0-9+/]+={0,2})(?:[ \t]+(.*))?$/.exec(line.trim());
  if (!match) throw sshError(400, 'Supported public keys: Ed25519, RSA, and ECDSA');
  const [, type, encoded, comment = ''] = match;
  const blob = Buffer.from(encoded, 'base64');
  let offset = 0;
  const field = () => {
    if (offset + 4 > blob.length) throw Error('Truncated key');
    const size = blob.readUInt32BE(offset); offset += 4;
    if (size > blob.length - offset) throw Error('Truncated field');
    const value = blob.subarray(offset, offset + size); offset += size; return value;
  };
  try {
    if (blob.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '') || field().toString() !== type) throw Error('Invalid encoding');
    if (type === 'ssh-ed25519') {
      const key = field(); if (key.length !== 32) throw Error('Invalid Ed25519 length');
      createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: key.toString('base64url') }, format: 'jwk' });
    } else if (type === 'ssh-rsa') {
      const e = field(), n = field();
      for (const integer of [e, n]) if (!integer.length || integer[0] & 128 || (integer[0] === 0 && (integer.length === 1 || !(integer[1] & 128)))) throw Error('Invalid RSA integer');
      const key = createPublicKey({ key: { kty: 'RSA', e: e.toString('base64url'), n: n.toString('base64url') }, format: 'jwk' });
      if (key.asymmetricKeyDetails.modulusLength < 2048 || key.asymmetricKeyDetails.publicExponent < 3n || key.asymmetricKeyDetails.publicExponent % 2n === 0n) throw Error('RSA must be at least 2048 bits');
    } else {
      const curve = field().toString();
      if (type !== `ecdsa-sha2-${curve}`) throw Error('Curve mismatch');
      const point = field();
      if (point[0] !== 4 || point.length !== 1 + 2 * ({ nistp256: 32, nistp384: 48, nistp521: 66 }[curve])) throw Error('Invalid EC point');
      ECDH.convertKey(point, { nistp256: 'prime256v1', nistp384: 'secp384r1', nistp521: 'secp521r1' }[curve]);
    }
    if (offset !== blob.length) throw Error('Trailing key data');
  } catch { throw sshError(400, 'Invalid SSH public key (RSA requires at least 2048 bits)'); }
  return { type, fingerprint: `SHA256:${createHash('sha256').update(blob).digest('base64').replace(/=+$/, '')}`, comment, publicKey: `${type} ${blob.toString('base64')}${comment ? ` ${comment}` : ''}` };
}

function entries(text) {
  return text.split(/(?<=\n)/).flatMap((line, index) => {
    if (/^\s*(?:#|$)/.test(line)) return [];
    // The optional options field can contain spaces and escaped quotes.
    const tokens = [...line.trim().matchAll(/(?:[^\s"\\]|\\.|"(?:[^"\\]|\\.)*")+/g)];
    const keyIndex = tokens.findIndex(t => /^(ssh-|ecdsa-|sk-)/.test(t[0]));
    if (keyIndex < 0 || keyIndex > 1) return [];
    try {
      const key = publicKey(line.trim().slice(tokens[keyIndex].index));
      return [{ ...key, id: digest(`${index}:${line}`), options: keyIndex === 1 ? tokens[0][0] : '' }];
    } catch { return []; } // Preserve comments, unsupported keys, and malformed lines verbatim.
  });
}

export class AuthorizedKeys {
  constructor(filename, backupDirectory, account = 'Host account') {
    this.filename = path.resolve(filename); this.backupDirectory = path.resolve(backupDirectory); this.account = account;
  }
  async open(writable = false) {
    return fs.open(this.filename, (writable ? constants.O_RDWR : constants.O_RDONLY) | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  }
  async snapshot(file) {
    const info = await file.stat();
    if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid() || info.mode & 0o022) throw sshError(409, 'authorized_keys must be a regular file owned by the agent user and not writable by others');
    if (info.size > 1024 * 1024) throw sshError(413, 'authorized_keys exceeds 1 MiB');
    const buffer = Buffer.alloc(1024 * 1024 + 1); let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await file.read(buffer, size, buffer.length - size, size);
      if (!bytesRead) break; size += bytesRead;
    }
    const data = buffer.subarray(0, size);
    if (size > 1024 * 1024 || !isUtf8(data)) throw sshError(413, 'authorized_keys is too large or is not UTF-8');
    return { text: data.toString(), revision: digest(data), info };
  }
  async list() {
    const file = await this.open();
    try {
      const current = await this.snapshot(file);
      return { account: this.account, revision: current.revision, keys: entries(current.text) };
    } finally { await file.close(); }
  }
  async openBackups() {
    await fs.mkdir(this.backupDirectory, { recursive: true, mode: 0o700 });
    if (await fs.realpath(this.backupDirectory) !== this.backupDirectory) throw sshError(409, 'SSH backup directory must not use symlinks');
    const directory = await fs.open(this.backupDirectory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
      const info = await directory.stat();
      if (info.uid !== process.getuid() || info.mode & 0o022) throw sshError(409, 'SSH backup directory must be owned by the agent user and not writable by others');
      return directory;
    } catch (error) { await directory.close(); throw error; }
  }
  async change(method, input) {
    const fields = method === 'POST' ? ['publicKey', 'revision'] : ['id', 'revision'];
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !fields.includes(k)) || typeof input.revision !== 'string' || !/^[a-f0-9]{64}$/.test(input.revision)) throw sshError(400, 'A current revision and valid key fields are required');
    const key = method === 'POST' ? publicKey(input.publicKey) : null;
    if (method === 'DELETE' && (typeof input.id !== 'string' || !/^[a-f0-9]{64}$/.test(input.id))) throw sshError(400, 'A valid key ID is required');
    const directory = await this.openBackups(), base = `/proc/self/fd/${directory.fd}`, lock = `${base}/.authorized_keys.agent.lock`;
    let locked = false, file;
    try {
      try { await fs.mkdir(lock, { mode: 0o700 }); locked = true; }
      catch (error) { if (error.code === 'EEXIST') throw sshError(409, 'Another SSH key change is in progress'); throw error; }
      file = await this.open(true);
      const previous = await this.snapshot(file), known = entries(previous.text);
      if (previous.revision !== input.revision) throw sshError(409, 'SSH keys changed; reload before trying again');
      let next, changed;
      if (key) {
        if (known.some(entry => entry.fingerprint === key.fingerprint)) throw sshError(409, 'This public key is already authorized');
        next = previous.text + (previous.text && !previous.text.endsWith('\n') ? '\n' : '') + key.publicKey + '\n'; changed = key;
      } else {
        changed = known.find(entry => entry.id === input.id);
        if (!changed) throw sshError(404, 'SSH key no longer exists');
        next = previous.text.split(/(?<=\n)/).filter((line, index) => digest(`${index}:${line}`) !== input.id).join('');
      }
      if (Buffer.byteLength(next) > 1024 * 1024) throw sshError(413, 'Updated authorized_keys would exceed 1 MiB');
      const backup = `authorized_keys.agent-backup-${randomUUID()}`;
      await this.backup(`${base}/${backup}`, previous.text);
      await directory.sync();
      const current = await this.snapshot(file), target = await fs.lstat(this.filename);
      if (current.revision !== previous.revision || target.ino !== previous.info.ino || target.dev !== previous.info.dev) throw sshError(409, 'authorized_keys changed during the update; retry');
      // A file bind mount cannot be replaced by rename. Write through the same
      // descriptor, truncating only after all replacement bytes have been written.
      try { await this.write(file, next); }
      catch (error) {
        try { await this.write(file, previous.text); }
        catch { throw sshError(500, `SSH key write and recovery failed; restore backup ${backup} from the agent data volume`); }
        throw error;
      }
      console.info(JSON.stringify({ event: 'ssh-key-change', action: method === 'POST' ? 'add' : 'remove', fingerprint: changed.fingerprint, time: new Date().toISOString() }));
      return { backup, revision: digest(next) };
    } finally {
      try { if (file) await file.close(); }
      finally { try { if (locked) await fs.rmdir(lock); } finally { await directory.close(); } }
    }
  }
  async backup(filename, text) {
    const file = await fs.open(filename, 'wx', 0o600);
    try { await file.writeFile(text); await file.sync(); } finally { await file.close(); }
  }
  async write(file, text) {
    const data = Buffer.from(text); let offset = 0;
    while (offset < data.length) {
      const { bytesWritten } = await file.write(data, offset, data.length - offset, offset);
      if (!bytesWritten) throw sshError(500, 'SSH key write made no progress');
      offset += bytesWritten;
    }
    await file.truncate(data.length); await file.sync();
  }
}
