# Docker Engine compatibility

Registry resilience checks in `registry-resilience-test.mjs` cover missing and
wrong credentials, password rotation, untrusted/private CA certificates and
hostname mismatches, interrupted uncached layer downloads, and registry outage
recovery. Failures must produce danger journals without image callbacks or
registry-association changes. These run after reseeding the manager config.
The harness loads the agent image into the disposable daemon for the test proxy
and uses the fixture CA only inside that daemon.

`run.sh` tests every noncomment version in `versions.txt` using an isolated `docker:<version>-dind` daemon, the production agent image and a WireMock NetBox fixture. It requires Docker Compose, privileged containers, image-registry network access and enough disk for Docker, the agent and fixture images. Use `COMPOSE_PROJECT_NAME` to isolate simultaneous runs; do not run destructive suites against the same stack.

```sh
./tests/compat/run.sh
./tests/compat/run.sh 29.5.2
```

Each version runs:

1. Original Hurl smoke/read/version/lifecycle/action/image/network/volume/metric/error suites.
2. Extended Hurl security, recreation, device mapping, host PID and host networking contracts. Hurl runs one file at a time to avoid shared request-journal races.
3. Authenticated WebSocket exec using the preserved byte-code protocol.
4. Daemon restart, API recovery and an out-of-band pause event callback **before restarting the agent**, proving event-stream reconnection.
5. A disposable authenticated registry, fixture image import/push, agent pull and registry/image association.
6. A nested instance of the production agent rejecting self-recreation with HTTP 403 while remaining available. The harness loads the image into dind first.
7. An isolated NetBox create callback and success journal contract after reseeding configuration.

`recreate-integrity-test.mjs` also runs after reseeding configuration. It verifies
that a real replacement changes container ID while retaining owner variables,
labels, and existing named-volume contents. Four rollback cases inject a missing
secondary network or an invalid executable, with the original running or
stopped. Each checks the original ID/name/state and data, and verifies that no
failed replacement or backup container remains. Completion is correlated with
the agent's success/failure journal, rather than inferred from an early poll.

Prune coverage includes the Hurl lifecycle in `tests/hurl/prune.hurl` and `prune-test.mjs`. It verifies deletion of stopped containers, anonymous volumes, explicitly selected unused named volumes, and unused networks; retention of running containers and their image/volume/network references; actual dangling and tagged image deletion; and pruning a populated Engine BuildKit cache. It also checks both JSON body forms and rejects unauthenticated, cross-origin, unsupported-method, and invalid-scope requests. These tests run against every listed Engine version. They never prune the host daemon.

Any failed setup or assertion makes the runner exit nonzero. The final summary reports each version. Tests only create resources within the disposable daemon; cleanup removes the test project's volumes and containers. The mock tests HTTP contracts, token headers and callback payloads, but does not validate real NetBox models, permissions or webhook configuration.

The agent uses Docker's unversioned API, as the previous implementation did, so each daemon's default API is exercised. `/info` is checked against the exact requested version. `DOCKER_HOST` can also select a remote endpoint; the default test stack shares dind's Unix socket.

For browser tests, keep a separate stable stack running, then use `tests/e2e/run.sh`. The matrix tears its stack down, so it is unsuitable as a concurrent browser target.
