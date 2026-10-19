# Feature-parity checklist

Baseline: commit `96d321b7f967517cd1f966ba4e0b332380f6977d`, original `flows.json` and both OpenAPI files. `flow-inventory.csv` accounts for every original node identifier, flow and replacement module. Metadata, debug nodes and runtime settings generation are explicitly retired. The legacy executable flows are removed. This checklist distinguishes implementation from verification; the final executed results are recorded in `VALIDATION.md`.

| Accounted feature | Implementation | Evidence / verification scope |
| --- | --- | --- |
| GET `/`, `/doc`, `/openapi`; JSON/YAML schemas | Native authenticated static allowlist | Hurl smoke, read integration, Playwright navigation |
| GET `/info` with message/configured/version/flows/docker/dockerInfo/config | `Agent.info` | Original smoke and version Hurl; fixture integration |
| GET `/system/usage`, all six aggregate size fields | `docker.usage`, `diskUsage` | Read Hurl, aggregation unit test, browser overview |
| GET `/api/containers`, complete inspect array including empty state | `Agent.containers` | Hurl lifecycle/read, browser lists |
| GET `/api/images`, `/api/networks`, `/api/volumes` | Native routes and Dockerode | Read/image/network/volume Hurl |
| GET `/api/registries`, persisted associations | Store and registry discovery | Smoke Hurl, registry mapping unit/integration; authenticated disposable registry push/pull and association test |
| GET `/api/engine/:type`, async 202 acknowledgments | Native routing, `Agent.sync` | Smoke/read Hurl, per-resource inventory integration |
| Endpoint registration (`url,id,token,endpoint`), NETBOX_URL override | Native route + atomic Store | Integration and migration config tests |
| Endpoint disconnect and registry reset | `Agent.write` DELETE endpoint | Integration |
| POST endpoint refresh: delete supplied NetBox resource IDs and repopulate; skip empty deletes and accept Paasbox bulk DELETE 405 | `Agent.write` refresh | Fixture integration; real plugin needs deployment verification |
| POST containers: state `none`, name gate, hostname/image/capabilities | `createOptions`, callback mapping | Lifecycle Hurl, integration |
| POST images: size/ImageID gate and force pull | Dockerode pull/progress, image inspection | Image/lifecycle Hurl, integration |
| Forced image refresh: archive prior image version and create current record | `Agent.write` force image branch | Fixture integration; real private-registry/tag-change verification required |
| POST networks: state `creating`, name/driver and PATCH NetworkID | `Agent.write` | Network Hurl, integration |
| POST volumes: driver, storage-driver condition, max_size | `Agent.write` | Volume Hurl; driver option unit/fixture coverage |
| PUT containers: start, stop, restart, kill, rename | `Agent.write` | Container-operation/lifecycle Hurl, Playwright actions |
| PUT containers: pause/unpause, update restart policy and optional rename (`none`) | `Agent.write` | Recreation Hurl, operation integration |
| PUT containers: recreate, backup rename, rollback on failed replacement | `Agent.write`, `createOptions` | Recreation Hurl; fixture failure/rollback test |
| Recreate fields: image ID, hostname, env, labels, cmd, cap_add/drop, PID mode, extra_hosts, secOpt | `createOptions` | Mapping unit; recreation Hurl; real host PID mapping in isolated dind |
| Recreate fields: port bindings/exposures, devices, named mounts, binds/read-only | `createOptions` | Mapping unit; recreation Hurl; real hardware device passthrough needs host verification |
| Recreate fields: first network and additional attachments; host network mode | `createOptions`, network connect loop | Mapping unit; recreation Hurl; real host-network Hurl lifecycle |
| Recreate fields: restart policy, log driver/options, sysctls | `createOptions` | Mapping unit; recreation Hurl |
| Agent's own recreation | Independent helper container performs recreation | nested production agent self-replacement test; see VALIDATION |
| DELETE containers, images by ID or name:tag, networks, volumes | `Agent.write` | Lifecycle/image/network/volume Hurl |
| DELETE host-state guard (`deleted`, `refreshing`) | `Agent.write` | Fixture integration |
| POST/DELETE registries and unknown engine types: historical 202 no-op | Native router, no matching operation | Original smoke/errors Hurl |
| PUT `/api/engine/containers/:id/exec` | Native route, Docker exec/start; raw stdout envelope | Lifecycle Hurl, browser exec, fixture integration |
| GET container logs: timestamps, stdout/stderr, tail=50; empty `{}` | Native route, legacy first-header removal | Lifecycle Hurl, browser logs, fixture integration |
| GET container stats: nonstreaming snapshot | Native route | Lifecycle Hurl, fixture integration |
| POST container `/ws`, running-container gate, path envelope | Native route + terminal reservation | WS compatibility test, security integration |
| WS `/ws/engine/containers/:id/exec`: command, TTY, stdin/stdout/stderr, flow control, resize, exit codes, shutdown | `terminal.js`, `exec-client.js` | real TTY stdin/resize, non-TTY stderr/exit-status and browser terminal; fixture security tests |
| API Basic auth, default password, bcrypt environment hashes | `auth.js` | Unit/security Hurl; authenticated browser scenarios |
| Retired Node-RED editor and separate ADMIN credentials | Configuration routes use API credentials; /nodered removed | Security integration; migration documentation |
| DISABLE_EXEC for HTTP and WS; DISABLE_SSL_CHECK for NetBox | Runtime checks and HTTPS request option | Security integration; SSL test fixture |
| Persistent configuration/registries, startup load, 60s saves | Store atomic writes and lifecycle timers | Unit and integration |
| Startup restart journal and version/refresh notification | `Agent.start` | Fixture integration + NetBox compatibility tests |
| Docker events: start/restart/stop/kill/oom/die/pause/unpause; host/name lookup; state/exitCode/status update | `Agent.watch/event` | reconnect and operation-gate fixture tests; external pause Hurl after daemon restart |
| Event-stream reconnect without curl subprocesses | `Agent.watch` retry | Fixture disconnect + real daemon restart harness |
| Container/image/network/volume inventory POSTs; nested fields, registry IDs | `mapping.js`, `Agent.sync` | Mapping/unit/integration; NetBox callback Hurl |
| Journal assigned object types/IDs, info/success/danger | `Netbox.journal` | Integration and NetBox callback Hurl |
| Legacy Token and `ntb_` Bearer authentication; NetBox error counter | `Netbox.request` | Integration, metric unit/security |
| All five Prometheus families and historical socket label | `metrics.js` | Metrics Hurl, escaping/failure unit test |
| Redesigned overview, disk usage, counts, lists, inspection, resource removal/pull | Vanilla interface | Retained Playwright workflows |
| Redesigned container actions, recreation editor, logs/stats, exec and shell terminal | Vanilla interface | Playwright actions/logs/exec/terminal, recreation Hurl |
| Offline assets, responsive layout, accessible controls, text-safe metadata | Vanilla interface + CSP | Browser injection and responsive tests |
| Runtime flow editor, flow encryption, palette, visual wiring/debug metadata | Removed as requested | Dependency lock and source tree; every node accounted in CSV |

Known intentional hardening: static assets require API authentication; WebSocket upgrades require credentials and same-origin browser requests; malformed JSON/oversized bodies are rejected; labels are escaped; no request data is interpolated into host shell commands. These tighten insecure legacy behavior while retaining the plugin's server-to-server protocol.
