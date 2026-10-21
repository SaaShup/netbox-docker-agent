# Configuration

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

Registries are inferred from local image references. The agent refreshes associations at startup, after image operations and pruning, on Docker image events, on registry API reads, and every minute to recover missed events. Empty registries and deleted image references are removed from the local list. Local refreshes work without a Paashup/NetBox connection and retain known registry IDs and server addresses. **Discover registries** additionally synchronizes registry metadata with the configured manager; local refreshes do not create or delete manager inventory records. Unqualified image names are grouped under `dockerhub`. Discovery does not recover registry login credentials.

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

For optional SSH key management, see [host SSH keys](HOST-SSH-KEYS.md). Return to the [quick start](../README.md).
