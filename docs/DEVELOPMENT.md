# Development and testing

Use Node.js 24 or newer. Install dependencies with `npm ci` and run locally with `DATAPATH=./data npm start`. The agent needs access to a Docker Engine; see [configuration](CONFIGURATION.md) for remote endpoints.

## Test suites

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

At exit, `npm test` prints each suite's PASS, FAIL, or SKIPPED status and duration,
followed by the overall result and total duration. The summary also appears on
failure or interruption, after Docker cleanup. The command preserves a failing
suite's exit code; a cleanup failure also makes an otherwise successful run fail.

`npm run test:unit` prints Node's built-in line, branch, and function coverage for `src/`
and requires 100% for all three. The suite exercises every server module,
including startup, shutdown, and the recreation helper in child processes.
Browser assets and test fixtures are outside this server coverage report.
The shutdown deadline check makes the suite take about 25 seconds.

The compatibility harness starts isolated privileged Docker-in-Docker daemons, a WireMock NetBox fixture, and the production image. It runs the original Hurl suites plus security and recreation coverage, authenticated terminal execution, daemon restart/recovery, and NetBox contracts. Browser tests reuse the original Playwright workflows with selectors adapted to the redesigned interface, and add responsive layout and injection checks. Neither fixture tests nor WireMock prove compatibility with a live deployed NetBox plugin.

## Publishing an image

Pushing a Git tag runs the CI workflow against that tagged commit. The image is
published to `ghcr.io/saashup/netbox-docker-agent:<tag>` only after unit,
integration, security and dependency audit checks, every supported Docker
compatibility version, and the browser tests succeed. The image targets
`linux/amd64`, matching the CI runners. Pull requests and manual workflow runs
run tests without publishing.

For example, after committing the release changes:

```sh
git tag v2.0.0
git push origin v2.0.0
# After the workflow succeeds:
docker pull ghcr.io/saashup/netbox-docker-agent:v2.0.0
```

The workflow authenticates with GitHub's automatic `GITHUB_TOKEN`; only the
publish job has `packages: write` permission. The image keeps the Git tag
(including a `v` prefix) and does not update `latest`. Git tag characters that
are invalid in image tags are normalized by `docker/metadata-action`.

## Architecture and migration

See [architecture](ARCHITECTURE.md), [migration instructions](MIGRATION.md), [feature parity](FEATURE_PARITY.md), and [validation evidence](VALIDATION.md). The original source commit, route inventory and every flow-node identifier are retained as audit metadata in `docs/legacy-contract.json` and `docs/flow-inventory.csv`; no executable flows or flow-runtime dependencies remain.

Return to the [quick start](../README.md).
