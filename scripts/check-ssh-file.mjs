import { spawnSync } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';

// Resolve Compose interpolation, including .env, without printing credentials.
const config = spawnSync('docker', ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.ssh.yml', 'config', '--format', 'json'], { encoding: 'utf8' });
if (config.error || config.status !== 0) {
  console.error(config.error?.message || config.stderr.trim()); process.exit(1);
}
const service = JSON.parse(config.stdout).services['netbox-docker-agent'];
const filename = service.volumes.find(volume => volume.target === '/host-ssh/authorized_keys').source;
try {
  const info = lstatSync(filename);
  if (!info.isFile() || info.nlink !== 1 || realpathSync(filename) !== path.resolve(filename)) throw Error('Source must be a regular file without symlinks or hardlinks');
  if (info.mode & 0o022) throw Error('authorized_keys must not be writable by group or others');
  if (info.uid !== Number(service.user.split(':')[0])) throw Error(`Set SSH_KEYS_UID=${info.uid} and SSH_KEYS_GID=${info.gid} to match the host file owner`);
} catch (error) {
  console.error(`Cannot mount host authorized_keys: ${filename}\n${error.message}\n\nThe file must already exist. To create it for your current host account:\n  install -d -m 700 "$HOME/.ssh"\n  touch "$HOME/.ssh/authorized_keys"\n  chmod 600 "$HOME/.ssh/authorized_keys"\n\nThen configure and start the container:\n  export SSH_AUTHORIZED_KEYS_FILE="$HOME/.ssh/authorized_keys"\n  export SSH_KEYS_UID="$(id -u)" SSH_KEYS_GID="$(id -g)"\n  npm run build\n\nUse npm run build:no-ssh to start without SSH key management.`);
  process.exit(1);
}
