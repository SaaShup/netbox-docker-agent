# Docker version compatibility tests

These tests verify that the agent works against a controlled, pinned range of
`dockerd` versions — independent of whatever Docker happens to be installed on
the host.

## How it works

The agent talks to the Docker Engine API over a hardcoded
`/var/run/docker.sock`, with no API-version prefix, so it always uses the
daemon's *default* API version. To pin the version under test we use
**Docker-in-Docker**:

1. `dind` runs the chosen `docker:<version>-dind` and serves its socket on a
   shared volume.
2. `agent` mounts that same volume at `/var/run`, so its
   `/var/run/docker.sock` *is* the dind daemon — no agent change needed.
3. `tester` (hurl) runs [`../hurl/tests.hurl`](../hurl/tests.hurl) against the
   agent.

See [docker-compose.yml](docker-compose.yml). The stack also includes a
`netbox` service (a [wiremock](https://wiremock.org/) stand-in) so the
agent->netbox callbacks can be exercised; the agent's `netbox_url` is pointed
at it via [fixtures/config.netbox.js](fixtures/config.netbox.js).

## What gets tested

For each version `run.sh` runs three things against the standing stack:

1. **The hurl suite** ([../hurl](../hurl)):
   - `tests.hurl` — the original HTTP smoke tests.
   - `read.hurl` — field-level assertions on the synchronous read endpoints
     (`/api/networks`, `/api/containers`, `/api/images`, `/api/volumes`,
     `/system/usage`). Where dockerd field drift shows up first.
   - `version.hurl` — asserts `/info` reports the exact dockerd version
     under test (requires the `docker_version` variable).
   - `lifecycle.hurl` — a real container lifecycle against the daemon:
     pull -> create -> start -> logs -> stats -> exec -> stop -> delete,
     polling the read endpoints for each async side effect.
2. **The websocket-exec test** ([ws-exec-test.mjs](ws-exec-test.mjs)) — drives
   the interactive `/ws` exec channel using the agent's own bundled client lib
   (can't be expressed in hurl). Runs inside the agent container.
3. **The netbox-contract test** (`netbox.hurl`) — asserts the agent actually
   sends the expected callbacks to netbox after a write, by inspecting the
   wiremock request journal. Run against a freshly restarted agent so the
   agent's own config-persistence during the suite can't interfere.

## Supported versions

The list of tested versions lives in [versions.txt](versions.txt), one per
line. It is the single source of truth, consumed by both `run.sh` and CI.

## Running locally

Requires Docker with the Compose plugin.

```sh
# Test every version in versions.txt
./run.sh

# Test a single version
./run.sh 29.5.2
```

The script builds the agent image, spins up dind + agent for each version,
runs the hurl suite, tears the stack down, and prints a pass/fail summary.

## Adding a version

Add the version to [versions.txt](versions.txt) and open a PR. CI picks it up
automatically via the matrix in
[`../../.github/workflows/compat_ci.yml`](../../.github/workflows/compat_ci.yml).
