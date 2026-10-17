# Host SSH authorized keys

**Host SSH keys** lists, adds, and removes public keys in one explicitly mounted
host account's `authorized_keys` file. The agent accesses that file directly;
no host helper, Unix socket, or host Node.js installation is needed.

## Start with a file mount

The host file must already exist. For your current host account, run:

```sh
install -d -m 700 "$HOME/.ssh"
touch "$HOME/.ssh/authorized_keys"
chmod 600 "$HOME/.ssh/authorized_keys"
export SSH_AUTHORIZED_KEYS_FILE="$HOME/.ssh/authorized_keys"
export SSH_KEYS_UID="$(id -u)" SSH_KEYS_GID="$(id -g)"
export SSH_KEYS_ACCOUNT="$(id -un)"
npm run build
```

`touch` preserves existing contents. `npm run build` checks the source file and
starts Compose with `docker-compose.ssh.yml`. Only this file is mounted at
`/host-ssh/authorized_keys`, read-write, with automatic source creation disabled.
The source defaults to `$HOME/.ssh/authorized_keys`; the account label defaults
to `Host account`. The container UID/GID default to `1000:1000`; set them to the
host file owner's numeric IDs. The source must exist on the Docker daemon's host.
The build check rejects missing files, symlinks/hardlinks, unsafe write permissions,
and mismatched ownership. Neither the whole `.ssh` directory nor private keys
are mounted.

The agent needs write access to its persistent `/data` volume as well. If you use
a UID other than 1000 with an existing volume, provision that volume for the
chosen UID/GID before starting; the container does not change its ownership.
`npm run build:no-ssh` starts the normal agent without host SSH key management.
When migrating from the previous helper setup, stop that helper; its service,
commands, and `SSH_KEYS_SOCKET` settings are no longer used.

## Use the page

Open **Host SSH keys** to load the mounted file automatically. It uses the
existing dashboard authentication (`API_USERNAME` / `API_PASSWORD`); there is no
separate SSH sign-in or lock/unlock step. The same API credentials also protect
configuration endpoints. Use HTTPS for remote
access and configure dashboard credentials.

Adding and removing require confirmation. Supported additions are Ed25519,
RSA (at least 2048 bits), and ECDSA NIST P-256/P-384/P-521. One public key is
accepted per request; private keys, supplied options, duplicate keys and malformed
wire encodings are rejected. Existing restrictions, comments, blank lines,
unsupported key types and malformed lines are preserved. Unsupported or weak
existing keys are not listed or managed. Duplicate supported keys are detected
regardless of comment/options. Removing the last key is allowed after confirmation.

## Writes, backups and recovery

A file bind mount cannot be replaced by rename. The agent writes through the
existing file descriptor and truncates to the new length only after writing all
replacement bytes, then syncs the file. It preserves the file's inode, owner,
group and permission bits. Updates are **not atomic**: an interrupted write can
leave partial contents, and an SSH daemon reading during the write can see an
intermediate state. Keep an independent access method while changing host access.

Before each change, the agent saves the exact previous contents as a synced,
mode-0600 file under `/data/ssh-key-backups/authorized_keys.agent-backup-<uuid>`.
This directory belongs to the agent and is not a host `.ssh` mount. Backups are
retained for administrator-controlled recovery/retention and are not served by
the API. A failed write triggers an attempt to restore the previous contents
through the same descriptor. If restoration also fails, the error identifies the
retained backup. A process kill or power loss cannot run this recovery step.

Requests use revision hashes and an exclusive lock in the backup directory.
Stale requests and external edits detected before writing return `409`. Other
editors/agents with separate data directories do not share this lock; coordinate
manual edits and use one agent for the file. After an unclean shutdown, stop the
agent, inspect the mounted file and backups, and restore a backup if necessary
before removing `/data/ssh-key-backups/.authorized_keys.agent.lock` and restarting.

If an editor on the host replaces `authorized_keys` by rename, Docker can retain
the old inode in its file bind mount. Recreate/restart the container with its
mount re-established before using the page again. The agent cannot inspect the
original host path outside its mounted file. To restore a backup while keeping
an existing mount, copy its contents into the existing host file without rename,
with the agent stopped.

The agent rejects nonregular files, hardlinks, wrong ownership,
group/world-writable files, invalid UTF-8 and files exceeding 1 MiB. A read-only
mount or filesystem permission failure is reported without modifying the file.
Successful changes log the action, fingerprint and timestamp. API request
logs record the event, action and timestamp. API usernames, passwords and key
contents are not logged.

## Configuration and API

- `SSH_AUTHORIZED_KEYS_FILE`: path visible **inside** the running agent. In Compose,
  the same variable selects the **host source** and is explicitly mapped to
  `/host-ssh/authorized_keys` in the container environment. Unset disables the
  runtime feature when using the base Compose file.
- `SSH_KEYS_UID`, `SSH_KEYS_GID`: Compose container identity matching the host file
  owner; defaults `1000:1000`.
- `SSH_KEYS_ACCOUNT`: display label; defaults to `Host account`.
- `DATAPATH`: existing data directory; backups use its `ssh-key-backups` subdirectory.

The existing dashboard/API Basic authentication and same-origin checks apply to:

- `GET /api/ssh-keys`: `{account, revision, keys: [{id, type, fingerprint, comment, publicKey, options}]}`.
- `POST /api/ssh-keys`: `{publicKey, revision}`.
- `DELETE /api/ssh-keys`: `{id, revision}`.

Mutations return `{backup, revision}` when completed. Read again for current
entry IDs. Unknown input fields are rejected. Errors include `400` invalid input,
`401` authentication, `403` cross-origin mutation, `404` disabled/missing entry,
`409` conflicts or unsafe metadata, `413` size limits, `500` failed write/recovery,
and `502` filesystem errors. Reload to inspect live state after a write failure.

## Tests

`npm test` covers key validation, private-key/injection rejection, duplicate and
stale requests, concurrent edits, safe metadata, exact backups, inode preservation,
partial/failed writes, recovery failures, limits, missing/read-only files,
authentication, origin checks and lock cleanup. Tests use temporary files only.
Browser tests stub SSH operations by default. `SSH_KEYS_E2E=1` explicitly enables
the real mounted-file browser test; run it only against an isolated agent with a
temporary host file and the usual dashboard credentials.
