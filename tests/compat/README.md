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

See [docker-compose.yml](docker-compose.yml).

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
