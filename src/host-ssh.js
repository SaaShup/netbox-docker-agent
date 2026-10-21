import path from 'node:path';
import { AuthorizedKeys, sshError } from './ssh-keys.js';

export async function hostSshKeys(method, data) {
  const filename = process.env.SSH_AUTHORIZED_KEYS_FILE;
  if (!filename) throw sshError(404, 'Host SSH key management is disabled');
  const keys = new AuthorizedKeys(filename, path.join(process.env.DATAPATH || '/data', 'ssh-key-backups'), process.env.SSH_KEYS_ACCOUNT);
  if (method === 'GET') return keys.list();
  return keys.change(method, data);
}
