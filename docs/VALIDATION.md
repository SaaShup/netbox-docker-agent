# Validation history

The results below describe historical validation runs. Generated logs, audit
reports and source fingerprints from those runs have been removed from the
repository; references to those artifacts are historical descriptions. The
`docs/validation/` directory is ignored by Git. For current results, rerun the
commands in [development and testing](DEVELOPMENT.md) or inspect the GitHub
Actions run and its uploaded artifacts.

Validation date: 2026-10-16. The baseline is commit `96d321b7f967517cd1f966ba4e0b332380f6977d`. Every one of its 410 flow nodes is accounted for in [the inventory](flow-inventory.csv), and all 16 operational HTTP routes are listed in [the contract inventory](legacy-contract.json). Executable flows, credentials and the flow runtime have been removed.

The code is implemented; production compatibility with an actual NetBox deployment is not certified by these fixture tests.

| Check | Result | Evidence |
| --- | --- | --- |
| Unit, integration and security (`npm test`) | 34 passed, zero failures/skips | unit log |
| Production dependency audit | Zero vulnerabilities | audit JSON |
| Browser-tooling dependency audit | Zero vulnerabilities after upgrading Playwright to 1.64.1 | audit JSON |
| Chromium browser workflows, Playwright 1.64.1, retries disabled | 23 passed, zero failures/skips | browser log |
| Terminal exec/interactive sessions, repeated three times | 6 passed, no CSP violations | repeat log |
| Docker 29.5.2, 28.5.2, 27.5.1 | All three passed; 45 Hurl file executions plus terminal, event, registry and self-recreation checks | matrix log |
| Production image: UID 1000, socket group access, data writes, graceful shutdown | Passed; exit 0 and mode 0600 persistence | container log |

## Prune verification

The prune addition was verified on 2026-10-16 after the baseline evidence above:

- At prune verification: all 40 unit and integration tests passed, with zero failures or skips, using Node from the cached compatibility image and a read-only workspace mount.
- All six prune browser tests passed with retries disabled in Playwright 1.64.1 against an isolated compatibility stack. They cover confirmation/cancellation, conservative scope defaults, resource-specific filters, named-volume opt-in, and visible Engine errors. Prune responses are intercepted in these browser tests. See browser output.
- Earlier completed compatibility runs passed on Docker 27.5.1, 28.5.2, and 29.5.2. Each includes real dangling/tagged image deletion, protection of an image referenced by a stopped container, and deletion of three populated Engine BuildKit cache records. These retained logs were recovered from the preceding work; the matrix was not rerun during the resumed verification.
- The preceding browser regression run passed all 17 selected existing workflows.
- The JSON and YAML OpenAPI documents are byte-identical, and `git diff --check` passed. Prune source fingerprints are recorded separately in prune/source-sha256.txt; the original evidence above describes the earlier migration baseline.

Reproduce the prune browser checks after starting the isolated stack below with `npx playwright test 11-prune.spec.ts --retries=0`. The compatibility runner includes both `prune.hurl` and `prune-test.mjs` for real Engine deletion checks.

## Local image-upgrade integration

On 2026-10-16, the sibling `netbox-docker-image-upgrade` integration stack was configured to build this checkout as `netbox-docker-agent:integration`. Real Paasbox v1.10.3 testing exposed a registration regression: GET `/api/engine/endpoint` updated host metadata without importing inventory. The route now imports networks, volumes, images, and containers as the legacy flow did, logging individual inventory failures while continuing the remaining imports. This matters when Paasbox rejects duplicate network records on repeated imports.

All 42 agent tests passed, including regressions for registration import and independent inventory failures. After replaying registration on the existing integration host, the app repository's host-discovery integration check passed. The integration agent uses this local source; fingerprints record the changed files. Earlier prune fingerprints describe the source before this registration correction.

The full provisioning suite was not run at that stage: its Cloudflare test requires a zone, zone ID, and API token. Traefik was started on host port 8084 because port 80 was occupied. That check verified registration and inventory discovery. The later full-suite result is recorded below.

### Staged configuration callback correction

Further testing on 2026-10-16 found that settings-save callbacks replaced Paasbox's staged environment variables, labels, and other configuration with Docker's previous values. Recreated containers consequently lost owner metadata, and the integration quota check returned HTTP 400 instead of the expected 429. Settings-save and rename callbacks now report identity, runtime status, and restart policy while preserving staged configuration until recreation applies it.

All 43 agent tests passed, including a regression through the HTTP webhook route. After resetting the integration fixtures, all 13 unchanged image-upgrade integration tests passed, covering provisioning, owner isolation, quota enforcement, Cloudflare, Keycloak, SMTP notifications, registry upgrades, cleanup, and branding. The npm full-run wrapper required an interactive sudo password in this environment, so the clean-stack lifecycle was executed using direct Docker commands followed by the unchanged integration test command. Cloudflare variables came from the user's `cf.env`; credentials are not included in the evidence.

The image-upgrade source diff and configuration-file checksums were unchanged throughout this correction. Agent source fingerprints identify the corrected implementation and regression test.

## Complete source coverage

On 2026-10-16, `npm test` passed all 101 tests with **100% line, branch, and function coverage in each of the 13 `src/` modules**. See the complete test and coverage output and source fingerprints. The final run used Node 24 from the agent image with a read-only workspace mount and no external network.

Added tests exercise terminal and external-client framing/flow control, connection failures, request limits, persistence recovery, registry reconciliation, watcher reconnects, administration, disconnected HTTP clients, startup defaults, graceful shutdown and its deadline, and both recreation-helper outcomes. Child processes exercise the real entry points; server defaults are checked through a test listener adapter that binds an ephemeral port. Tests use local HTTP/WebSocket fixtures and deterministic timers where appropriate.

Prune cleanup now releases its lock and tracked job in the same outer `finally`; a test verifies shutdown waits for pending prune reporting. No coverage exclusions or ignore directives were added. Browser assets remain outside the existing `src/` coverage scope. `npm test` enforces 100% for all three measures, so its exit status fails on a coverage regression. The deadline test makes the suite take about 26 seconds.

## Real Docker recreation integrity

The added `tests/compat/recreate-integrity-test.mjs` passed all five scenarios against an isolated Docker 29.5.2 daemon: successful replacement preserves owner variables, labels, and an existing named-volume file; missing-network and invalid-executable failures restore the original container when it was running or stopped. Every rollback checks the original ID, name, running state, volume contents, and absence of leftover replacement/backup containers. Operations are correlated with completion journals from the WireMock manager.

See the Docker 29 results and test fingerprints. The compatibility runner includes these checks for every configured Docker version; the new checks were executed on 29.5.2 in this validation, not rerun on 27/28. This addition changes tests and documentation only, and does not change the `npm test` source-coverage scope.

## Prune request concurrency

Four additional tests cover pruning alongside an active container operation and streamed POST, PUT, and DELETE requests. The streaming tests use real HTTP bodies with deterministic interleaving, without timing sleeps. They initially reproduced a race where writes received HTTP 202 during pruning because the route checked the lock before awaiting the body. The route now checks again after body parsing, returns 409, and prevents the mutation from reaching Docker.

The final container-based `npm test` run passed all **105 tests with 100% line, branch, and function coverage** across all 13 source modules. See results and changed-source fingerprints.

## Registry authentication, TLS, and recovery

The added `registry-resilience-test.mjs` passed all requested scenarios against isolated Docker 27.5.1, 28.5.2, and 29.5.2:

- Missing and incorrect credentials fail; a subsequent authenticated pull succeeds.
- After rotating the real registry's htpasswd file and restarting it, the old password fails and the new password succeeds.
- An untrusted private CA and a trusted certificate for the wrong hostname fail. A matching certificate succeeds after installing its CA into the disposable daemon's registry trust directory.
- A fresh, uncached image layer is interrupted mid-transfer and remains unavailable through Docker's download retries. The failed operation produces no success callback or association changes; a later retry succeeds after removing the fault.
- A stopped registry endpoint causes a failed pull while the agent remains responsive. Restarting the endpoint allows the same pull to succeed.

Every failed pull must produce a danger journal, leave no locally tagged image, omit successful image callbacks, and preserve the previous registry associations. Successful pulls verify the manifest and filesystem-layer digests and the registry association. Registry V2 fixtures are uploaded directly, so the interrupted layer has never been cached by the daemon. The HTTP/TLS fault proxy forwards to a real Distribution registry using its native htpasswd authentication. TLS verification remains enabled.

The new checks are included in `npm run test:compat` after the helper image is loaded and manager configuration is reseeded. Fixture containers, data volumes, DNS aliases, and CA files are removed after each run; cleanup was also checked directly on Docker 27/28. The existing 105 tests still pass with 100% coverage. See fixture and runner fingerprints. No production code changes were needed for these registry cases.

## Reproduction

```sh
npm ci --ignore-scripts
npm test
npm audit --omit=dev
npm --prefix tests/e2e install --ignore-scripts
npm --prefix tests/e2e audit
COMPOSE_PROJECT_NAME=nda-delivery tests/compat/run.sh
```

For an independent, stable browser target:

```sh
DOCKER_VERSION=29.5.2 docker compose -p nda-ui -f tests/compat/docker-compose.yml up -d --build dind netbox agent
NETWORK=nda-ui_default BASE_URL=http://agent:1880 tests/e2e/run.sh
DOCKER_VERSION=29.5.2 docker compose -p nda-ui -f tests/compat/docker-compose.yml down -v
```

The release browser run uses `npx playwright test --retries=0` in the matching official Playwright image. CI may retry once and retains traces on failure. The Docker matrix runs all 15 Hurl files per version, plus authenticated WebSocket checks (TTY command, interactive stdin/resize, non-TTY stderr/exit status), registry push/pull, event synchronization following a daemon restart, actual self-recreation, and NetBox callbacks/journals. Polling changes request counts between successful runs.

## Scope and remaining verification

- No live NetBox/Docker-plugin deployment was available. WireMock validates request paths, methods, authentication headers, callback fields and journals. Actual NetBox serializer validation, model relationships, permissions and webhook feedback behavior still require a deployment test.
- Device mapping is exercised with `/dev/null`; GPU and other specialized physical devices are not available in this environment. Host PID/networking, capabilities, mounts, ports, restart policy, logging and sysctls are exercised inside isolated Linux daemons.
- Browser coverage is Chromium. Firefox, WebKit and a real deployment's TLS reverse proxy are not claimed as verified.
- The GitHub Actions workflow is configured but was not triggered remotely in this session; its underlying test commands were run locally.
- This is dependency auditing and executable security coverage, not an independent penetration test or container OS vulnerability scan.

The final production-image digest is recorded in the container log. The checked source files are fingerprinted in source-sha256.txt.

The migration deliberately tightens static-asset and WebSocket authentication, browser-origin and cross-site fetch checks, JSON/body limits and metrics escaping. The terminal authorizes generated style sheets with fresh per-page CSP nonces; inline scripts and unnonced style sheets remain disallowed. The historical disabled HTTP exec acknowledgment and text/plain JSON stdout envelope are retained. See [migration instructions](MIGRATION.md).

During development, tests caught a shared WireMock journal race, a recreation handle that followed the replacement's name, Docker progress error frames, a terminal stylesheet CSP incompatibility and a browser-tooling advisory. These were corrected and covered by regression checks. Intermediate failures do not constitute the release evidence linked above.


## Host SSH key management — 2026-10-16

Implemented an opt-in administrator API and dashboard for one host account's
`authorized_keys`, reached through a restricted Unix-socket helper. No host SSH
configuration was changed during validation: all helper targets were temporary
directories. The image-upgrade repository was not modified.

- Native Node 24.20.0 `npm test`: **128 passed**, 100% line/branch/function coverage.
- Cached agent image Node 24.22.0 `npm test`: **128 passed**, 100% line/branch/function coverage, network disabled.
- SSH Playwright suite: **7 passed**, including explicit `SSH_KEYS_E2E=1` add/remove through the real helper and agent against temporary keys.
- Overview and container configuration regression browser tests: **11 passed**.
- Optional SSH Compose override validated using a temporary socket directory and group ID; configuration without its required environment variables correctly rejects activation.

The tests cover validation, exact backups, metadata preservation, duplicates,
restrictions/comments, stale revisions, concurrent requests, ownership/modes,
symlinks/hardlinks, limits, I/O failures, helper process lifecycle, administrator
authentication, cross-origin rejection, client disconnects, malformed responses,
and transport timeouts. The existing 100% coverage gates remain unchanged.

Evidence: native suite,
container suite,
browser suite, and
source hashes.


## Direct-file SSH key management — 2026-10-16

This implementation supersedes the host-helper deployment described in the
historical section above. SSH management now opens one configured mounted file
directly, with backups/locks in the agent data directory. The SSH helper/client,
service unit and socket preflight were removed. The build command mounts only
the selected `authorized_keys` file and checks its ownership and metadata.

- `npm test`: **126 passed**, **100% line, branch and function coverage**. Obsolete
  helper tests were replaced by direct-file and recovery tests, including failed
  truncate/fsync, partial/zero-progress writes, recovery failure and file growth.
- Playwright: **18 passed**, including seven SSH scenarios and existing Overview/
  container regressions. The explicitly opted-in SSH scenario used a real Docker
  bind mount of a temporary file; no host SSH account was modified.
- Host-side assertions confirmed exact original contents, inode, UID, GID and
  mode after browser add/remove operations. A separate real read-only Docker bind
  mount rejected writes with EROFS and preserved its revision.
- Compose and preflight checks accepted a valid file and rejected missing files,
  symlinks, hardlinks, unsafe modes and mismatched UID configuration.
- OpenAPI JSON/YAML agree; `git diff --check` passed.

Direct writes preserve the mounted inode and attempt recovery on failure; they
are not atomic against crashes or arbitrary external writers. Documentation
covers backups in `/data/ssh-key-backups`, stale-lock recovery, volume ownership,
and re-establishing the bind mount after a host-side file replacement.

Evidence: unit/integration suite,
browser suite, and
source hashes.


## Shared dashboard authentication for SSH — 2026-10-16

Removed the SSH credential form and lock/unlock controls. Opening the SSH tab
loads keys using the dashboard's existing authentication. The endpoint is now
`/api/ssh-keys` with API credentials and the standard Docker Agent realm; the
existing `/admin/config` administration authentication remains separate.
Confirmation, revision, backup and origin checks are retained. The API reference
and host SSH guide document the shared authentication.

- `npm test`: **126 passed**, 100% line/branch/function coverage.
- Playwright: **19 passed**, including automatic/on-demand loading, page reload,
  safe metadata rendering, disabled mode, error recovery, confirmation and stale
  revision checks, and an actual add/remove cycle through a temporary Docker file
  mount. The isolated agent had different administrator credentials, proving the
  SSH page only needed the existing dashboard authentication.
- Integration tests accept API credentials and reject missing, incorrect or
  administration-only credentials. Existing administration endpoint tests pass.
- The temporary host file retained its original comment after the browser cycle;
  no real host SSH account was changed. OpenAPI documents agree and diff checks pass.

Evidence: unit/integration suite and
browser suite.


## Interactive Swagger UI — 2026-10-16

Replaced the static `/doc` operation listing with locally served Swagger UI
5.33.3. Try it out supports authenticated execution, path/query parameters,
editable JSON request bodies, DELETE bodies and response status/headers/body.
Existing dashboard authentication works without Swagger authorization; optional
Authorize entries distinguish API and administration credentials. Authorization
is not persisted. Online validation and query-based configuration overrides are
disabled, and requests are constrained to this origin.

Updated the OpenAPI definition for executable examples and body shapes, correct
GET logs routing, DELETE payloads, endpoint registration query parameters and
administration authorization. The definition passes swagger-cli validation.
JSON/YAML copies remain identical.

- `npm test`: **128 passed**, 100% line/branch/function coverage.
- Swagger Playwright suite: **8 passed**, covering local-only loading with no
  page/CSP errors, real GET execution, parameters, bodies, authorization and HTTP
  failures. Mutation tests intercepted requests without changing Docker resources.
- Production Docker build succeeded. A container from the built image, with no
  source mounts and no external network, served `/doc`, both stylesheets, the
  Swagger bundle, initialization script and OpenAPI definition successfully.
- Swagger's inline style attributes/data images are permitted only on `/doc`;
  script policy stays self-only, and dashboard CSP retains its strict settings.

Evidence: unit/integration suite,
browser suite, and
production build.


## Stable Prometheus container status labels — 2026-10-16

Container metrics now use canonical state values for the `status` label and
retain recognized health qualifiers, for example `running (unhealthy)`. Docker's
elapsed-time text is excluded. Existing metric families and label keys remain
unchanged; exited metrics retain their existing state-only labels.

Regression tests compare complete metric responses before and after container
age changes from seconds to days/hours, confirm health transitions remain visible,
and check the HTTP `/metrics` endpoint. `npm test`: **130 passed**, with **100%
line, branch and function coverage**. Evidence:
unit/integration suite.


## API credentials only; Node-RED route removed — 2026-10-16

All HTTP/WebSocket routes now use only `API_USERNAME` / `API_PASSWORD` and the
Docker Agent Basic realm. Removed the separate admin authentication branch,
admin credential entries from Compose, and the `adminBasicAuth` Swagger scheme.
`/admin/config` retains its URL and uses the shared API credentials. `/nodered`
returns 404 with valid credentials and no longer redirects. Migration and API
documentation describe the retired settings.

- `npm test`: **130 passed**, 100% line/branch/function coverage.
- Swagger browser suite: **8 passed**, including a single authorization entry
  and configuration requests using the same API credentials as other routes.
- Regression tests reject missing/incorrect and retired admin credentials on
  configuration reads/writes, accept API credentials for configuration and Docker
  reads, and verify GET/HEAD/POST `/nodered` return 404 without Location headers.
- OpenAPI JSON/YAML agree and contain only `basicAuth`; diff checks pass.

Evidence: unit/integration suite and
browser suite.
