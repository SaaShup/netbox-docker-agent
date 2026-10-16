# NetBox Docker Agent

An ES module service for the [NetBox Docker plugin](https://github.com/SaaShup/netbox-docker-plugin), built with Node.js 24, the native HTTP server, Dockerode, and WebSocket streams. The dashboard uses vanilla JavaScript, HTML, and CSS. Interactive API documentation uses locally served Swagger UI; neither page requires a CDN.

## Run

```sh
export DOCKER_GID=$(stat -c '%g' /var/run/docker.sock)
docker compose up -d --build
```

Run `npm run build` to start with host SSH key management. It mounts only the existing `authorized_keys` file, with no host helper:

```sh
install -d -m 700 "$HOME/.ssh"
touch "$HOME/.ssh/authorized_keys" # preserves existing contents
chmod 600 "$HOME/.ssh/authorized_keys"
export SSH_AUTHORIZED_KEYS_FILE="$HOME/.ssh/authorized_keys"
export SSH_KEYS_UID="$(id -u)" SSH_KEYS_GID="$(id -g)"
export SSH_KEYS_ACCOUNT="$(id -un)"
npm run build
```

The command includes `docker-compose.ssh.yml` and checks the source file and owner before starting Docker. Backups are saved in `/data/ssh-key-backups`; writes preserve the mounted file's inode and permissions. See [host SSH key management](docs/HOST-SSH-KEYS.md) for write/recovery behavior and setup for another account. Use `npm run build:no-ssh` to start without SSH management. Follow logs with `docker compose logs -f` and stop with `docker compose down`.

Open `http://localhost:1880`. The compatible default credentials are `admin` / `saashup`. Set credentials before exposing the service. Docker socket access grants control of the Docker host; restrict access to the agent and terminate HTTPS at your reverse proxy. The Compose file adds the socket's group to the non-root service; it does not change socket permissions.

To run without a container:

```sh
npm ci
DATAPATH=./data npm start
```

Node.js 24 or newer is required. The default Docker socket is `/var/run/docker.sock`. Mount persistent configuration at `/data` in a container.

## Configuration

| Setting | Default | Behavior |
| --- | --- | --- |
| `PORT` | `1880` | HTTP listen port |
| `HOST` | `0.0.0.0` | HTTP listen address |
| `DATAPATH` | `/data` | Persistent JSON files named `config.js` and `registries.js` |
| `API_USERNAME` | `admin` | Username for all HTTP APIs, configuration, dashboard, documentation, metrics and WebSockets |
| `API_PASSWORD` | bcrypt hash of `saashup` | Existing bcrypt hashes remain valid; plaintext secrets are also supported |
| `DISABLE_EXEC` | absent | Any nonempty value disables HTTP command execution and WebSocket execution |
| `DISABLE_SSL_CHECK` | absent | Any nonempty value disables certificate validation for NetBox requests |
| `NETBOX_URL` | persistent value | Overrides the NetBox server URL |
| `DOCKER_HOST` | `unix:///var/run/docker.sock` | Unix socket, `tcp://host:port`, HTTP or HTTPS Docker endpoint |
| `DOCKER_GID` | `0` | Compose supplementary group for the Docker socket |
| `HEALTHCHECK_PASSWORD` | `saashup` | Plaintext API password used only by the container health probe; set alongside a custom API password |

`config.js` retains `netbox_url`, `netbox_token`, `ui`, `id`, `endpoint`, and `flows` (`"0"`), plus existing unknown keys. `registries.js` retains registry/image associations. These files contain JSON, despite their historical extension; they are never evaluated as JavaScript. Writes are serialized and atomic, with mode 0600. The files are saved on changes, every minute, and on graceful shutdown. HTTP JSON bodies are limited to 1 MiB, collected Docker output to 16 MiB, WebSocket messages to 1 MiB and terminal output buffering to 8 MiB. NetBox requests time out after 15 seconds.

Use the plugin's normal endpoint registration, the dashboard connection form, or:

```sh
curl -u admin:saashup --get http://localhost:1880/api/engine/endpoint \
  --data-urlencode url=https://netbox.example.com \
  --data-urlencode token=YOUR_TOKEN \
  --data-urlencode id=HOST_ID \
  --data-urlencode endpoint=https://agent.example.com
```

The historical registration route uses a query string: avoid recording it in reverse-proxy access logs. Tokens starting with `ntb_` use Bearer authentication; older tokens use Token authentication. Responses and journals use the plugin's existing field names and bulk callback formats.

`GET /admin/config` and `PATCH /admin/config` use the same `API_USERNAME` / `API_PASSWORD` credentials as the dashboard and other endpoints. `ENABLE_EDITOR` is retired and can be removed from deployment configuration. PATCH accepts the five connection/UI configuration fields. The legacy `/nodered` route has been removed.

## API and operation model

The service preserves `/info`, `/system/usage`, `/metrics`, `/api/{containers,images,networks,volumes,registries}`, `/api/engine/:type`, container exec/logs/stats/WebSocket setup, `/doc`, `/openapi`, and `/`. See the local API reference or [OpenAPI JSON](public/openapi.json).

Resource reads return live Docker data. Containers return complete inspect records; volumes return `{Volumes, Warnings}`. Engine routes acknowledge with HTTP 202 and process asynchronously. The response echoes the write body (reads acknowledge with `{}`). Poll the live resource route for the result; an acknowledgment alone does not prove Docker or NetBox accepted an operation. Failures are logged and journaled to NetBox when configured.

Container operations: start, stop, restart, kill, pause, unpause, rename, update restart policy (`none`), and recreate. Recreation maps the plugin's image, hostname, environment, labels, command, capabilities, PID mode, security options, devices, mounts/binds, network attachments, ports, restart policy, logging and sysctls. Failed replacement creation/start restores the original name and running state.

Docker events reconnect automatically. External container lifecycle events update the matching NetBox container by host and name. Lifecycle events triggered during an agent operation are gated; pause/unpause events remain synchronized. The startup check reports the agent version and requests a host refresh after an upgrade. Endpoint refresh removes the plugin's supplied resource records and repopulates inventory.

The terminal keeps the existing `/ws/engine/containers/:id/exec` route and byte-code protocol. Request its path with `POST /api/engine/containers/:id/ws` first. The synchronous HTTP exec route retains its historical `text/plain` JSON envelope. With `DISABLE_EXEC` set it returns a 200 exec-options echo without executing; disabled WebSocket setup returns 403. Both setup and upgrade require API credentials, and browser upgrades must be same-origin. The dashboard supports shell selection, keyboard input, paste, terminal resize, output and session closure. External clients can use `src/exec-client.js` or the existing protocol with authenticated upgrades.

## Pruning from the dashboard or Paasbox

The Containers, Images, Networks, and Volumes pages have a **Prune** button. **Prune build cache** is available under Disk allocation on Overview. The confirmation dialog explains the deletion scope, accepts label/age filters where supported, and reports deleted records and reclaimed space after completion. Images default to dangling images; volumes default to unused anonymous volumes. Including unused tagged images or unused named volumes requires selecting the corresponding checkbox. Volumes and their data are permanently deleted when pruned. See [Docker's pruning semantics](https://docs.docker.com/engine/manage-resources/pruning/).

Paasbox can call `POST /api/engine/{resource}/prune`, where `resource` is `containers`, `images`, `networks`, `volumes`, or `build-cache`, using the agent's API Basic credentials. Requests accept either direct options or the existing webhook-style `data` envelope:

```sh
curl --fail-with-body -u "$API_USERNAME:$API_PASSWORD" \
  -H 'Content-Type: application/json' \
  -d '{"data":{"filters":{"until":["168h"],"label":["paasbox.cleanup=true"]}}}' \
  https://agent.example.com/api/engine/containers/prune
```

Unlike the legacy asynchronous resource writes, prune returns **200 only after Docker completes**, with Docker's original report (for example, `{"ContainersDeleted":["container-id"],"SpaceReclaimed":4096}`). A null deletion list means nothing was removed; image deletion records can contain both `Untagged` and `Deleted` entries. Network reports do not include reclaimed bytes. Do not automatically retry a timed-out request: the operation may have completed, so inspect live inventory first.

Options:

| Option | Resources | Meaning |
| --- | --- | --- |
| `all` | images, volumes, build-cache | Boolean, default `false`; expands pruning to unused tagged images, unused named volumes, or all types of unused engine build cache |
| `filters` | all | Object of non-empty string arrays; container/image/network filters: `until`, `label`, `label!`; volume filters: `label`, `label!`; build-cache filters: `until`, `id`, `parent`, `type`, `description`, `inuse`, `shared`, `private` |
| `keep_storage` | build-cache | Non-negative integer specifying build cache bytes to retain |

An empty body uses the defaults. Unknown fields, unsupported filters, and invalid types return 400 before touching Docker. `all` must be supplied as an option, not as a raw `all` or `dangling` filter. Non-POST methods return 405. Existing authentication, cross-origin protection, and JSON limits also apply. Overlapping prune/agent operations return 409; clients can retry after the current operation finishes. Engine rejection/unavailability is returned as an error, not a successful acknowledgment.

Configured managers receive best-effort success/failure **host journal callbacks** using the existing integration. A callback failure is logged and does not turn a completed Docker deletion into an API failure. The response's deleted identifiers are authoritative for reconciling Paasbox inventory: reports identify container/cache IDs, image IDs or tags, and volume/network names. The agent does not delete manager records itself. Running containers and resources referenced by containers remain protected by Docker. The build-cache endpoint targets this engine, not standalone Buildx builders. Registries cannot be pruned.

## Monitoring

`/metrics` requires API authentication and exposes the original five families:

- `netbox_docker_agent_container_running`
- `netbox_docker_agent_container_exited`
- `netbox_docker_agent_container_stopped`
- `netbox_docker_agent_docker_daemon`
- `netbox_docker_agent_netbox_error_response`

The daemon metric deliberately retains the historical `/var/run/docker.socket` label. Container names retain their Docker leading slash. Container `status` labels use stable state values such as `running` and `running (unhealthy)`; elapsed time is excluded so aging does not create new Prometheus series. Health changes remain visible. Labels are escaped for Prometheus. A failed Docker connection reports zero; failed NetBox requests increment the error counter. Logs are structured JSON on stderr and startup information is on stdout.

## Test and migrate

```sh
npm test                         # Node tests, full Docker matrix (including Hurl), browser tests
npm run test:unit                # unit, HTTP/Engine fixture, security, reconnect tests
npm run test:hurl                # smoke suite, installed Hurl or official container
npm run test:compat              # every version in tests/compat/versions.txt
NETWORK=nda-compat_default BASE_URL=http://agent:1880 npm run test:browser
```

`npm test` requires Node 24+, Docker Compose, privileged containers and registry
network access. It runs the suites sequentially, stops on failure, and starts
and removes its own isolated Docker stack. Browser tests run against the first
version in `tests/compat/versions.txt`. The standalone `test:browser` command
expects an existing test stack on the specified network.

`npm run test:unit` prints Node's built-in line, branch, and function coverage for `src/`
and requires 100% for all three. The suite exercises every server module,
including startup, shutdown, and the recreation helper in child processes.
Browser assets and test fixtures are outside this server coverage report.
The shutdown deadline check makes the suite take about 25 seconds.

The compatibility harness starts isolated privileged Docker-in-Docker daemons, a WireMock NetBox fixture, and the production image. It runs the original Hurl suites plus security and recreation coverage, authenticated terminal execution, daemon restart/recovery, and NetBox contracts. Browser tests reuse the original Playwright workflows with selectors adapted to the redesigned interface, and add responsive layout and injection checks. Neither fixture tests nor WireMock prove compatibility with a live deployed NetBox plugin.

See [architecture](docs/ARCHITECTURE.md), [migration instructions](docs/MIGRATION.md), [feature parity](docs/FEATURE_PARITY.md), and [validation evidence](docs/VALIDATION.md). The original source commit, route inventory and every flow-node identifier are retained as audit metadata in `docs/legacy-contract.json` and `docs/flow-inventory.csv`; no executable flows or flow-runtime dependencies remain.

The Overview shows resource totals, host details, and disk allocation. The agent cannot recreate its own container: the API rejects this operation with HTTP 403, and its container card has no Recreate or Edit configuration control. Other containers can still be recreated.

Optional [host SSH key management](docs/HOST-SSH-KEYS.md) uses the dashboard authentication for listing, addition and removal of public keys through a bind mount of only `authorized_keys`. It is disabled by default; see the guide and `docker-compose.ssh.yml` for setup.

Overview host details show system uptime (the operating system running the agent) and agent process uptime. Both refresh with the dashboard. When using a remote Docker daemon, system uptime refers to the agent host, not the remote daemon.

At `/doc`, Swagger UI provides **Try it out** and **Execute** for sending requests to the agent, editing parameters/JSON bodies, and inspecting response status, headers and body. It uses the current dashboard authentication; **Authorize** can supply API credentials for all endpoints, including `/admin/config`. Authorizations are not persisted. The OpenAPI definition and UI assets are served locally, with external validation disabled.
