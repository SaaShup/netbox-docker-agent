# Migration from 1.x

1. Back up the existing `/data` volume and record the deployed image tag, environment variables, registry associations and NetBox host ID. Keep a backup outside the active volume so rollback can restore it.
2. Stop the old agent. Never run both versions against the same data directory at the same time.
3. Preserve `config.js` and `registries.js`, which are JSON files. Preserve the API/ADMIN environment variables and their existing bcrypt password hashes. The new runtime does not load `settings.js`, `settings_dev.js`, encrypted flow credentials, flows, or custom editor functions. Translate any local flow modifications into reviewed ES module changes before migrating.
4. Build the new image and start it with the same `/data` volume and read/write Docker socket. Set `DOCKER_GID` for the socket group and ensure the node user (UID 1000) can write the data directory. Do not make the socket world writable. The Compose file includes the socket mount that the previous example omitted.
5. If using a custom API password, set `HEALTHCHECK_PASSWORD` to its plaintext equivalent for the authenticated probe. Password hashes continue to be accepted by the service.
6. Verify `/info`, resource reads, metrics and the dashboard. Confirm the expected daemon version, NetBox URL, host ID and registry associations. Trigger the plugin's endpoint refresh and verify resource inventory and journals in your actual NetBox deployment.
7. Exercise a disposable container's start/stop, logs, exec and terminal. WebSocket upgrades now require API Basic credentials and reject cross-origin browser requests. Reverse proxies must forward `Authorization`, `Host`, `Origin`, and WebSocket upgrade headers and allow long-lived connections.
8. Confirm agent version `2.0.0-0` in NetBox. The startup version check requests refresh when the remote version differs.

The process listens on port 1880 and retains plugin request/response field names. `/doc`, `/openapi` and `/openapi.json` remain available. The redesigned dashboard has no CDN dependencies. Container command output retains its historical `stdout` envelope; Docker's multiplex headers remain in the HTTP response for compatibility. Logs retain the historical first-header removal behavior. HTTP exec keeps its `text/plain` JSON envelope; when disabled, it returns the historical 200 exec-options echo without executing. WebSocket setup returns 403 when disabled.

The flow editor and `/nodered` route have been removed. `ENABLE_EDITOR`,
`ADMIN_USERNAME` and `ADMIN_PASSWORD` are retired and ignored; remove them from
deployment configuration. All HTTP/WebSocket endpoints, including configuration
administration, use `API_USERNAME` and `API_PASSWORD`. The `ui` field is persisted
as before; it is not an access-control mechanism.

`FLOWS` and `APPPATH` were container/runtime implementation paths, and are retired with the old runtime. Existing environment entries can be removed. `DATAPATH`, `NETBOX_URL`, authentication, exec and SSL settings remain supported. Hostnames, labels and passwords containing quotes are now sent as JSON rather than interpolated into shell commands.

To roll back, stop 2.x, restore the backed-up data volume, and start the previous image and settings. Do not delete the backup until production verification is complete. The checked-in validation report distinguishes tested behavior from behavior that still needs deployment verification.

## Optional prune actions

Pruning adds new routes without changing existing resource webhook URLs. To request cleanup from Paasbox, configure a POST to `/api/engine/{containers,images,volumes,networks,build-cache}/prune` with the agent's **API Basic credentials**, not the manager's API token. Send prune options directly or under `data`; a standard model-event payload must be transformed into that options shape. See [the prune API documentation](../README.md#pruning-from-the-dashboard-or-paasbox) for examples and filters.

These endpoints return 200 with the completed Docker report rather than the legacy 202 acknowledgment. Reconcile manager inventory using the returned deletion identifiers. A configured integration also receives a best-effort host journal entry. Named volumes and tagged images require explicit `all: true`; the dashboard exposes those choices in its confirmation dialog. Test cleanup with disposable resources in your actual Paasbox deployment before enabling automation.
