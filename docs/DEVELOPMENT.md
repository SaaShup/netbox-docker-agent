# Development and testing

Use Node.js 24 or newer. Install dependencies with `npm ci` and run locally with `DATAPATH=./data npm start`. The agent needs access to a Docker Engine; see [configuration](CONFIGURATION.md) for remote endpoints.

## Test suites

```sh
npm run codeql:install           # one-time pinned CodeQL bundle installation
npm test                        # Node tests, CodeQL, Docker matrix, browser tests
npm run test:unit                # unit, HTTP/Engine fixture, security, reconnect tests
npm run test:codeql              # JavaScript/TypeScript and Actions security scans
npm run test:hurl                # smoke suite, installed Hurl or official container
npm run test:compat              # every version in tests/compat/versions.txt
NETWORK=nda-compat_default BASE_URL=http://agent:1880 npm run test:browser
```

`npm test` requires Node 24+, the installed CodeQL bundle, Docker Compose,
privileged containers and registry network access. It runs the suites
sequentially, stops on failure, and starts and removes its own isolated Docker
stack. Browser tests run against the first
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

### Local CodeQL

`npm run codeql:install` downloads GitHub's official bundle at the version pinned
in `tests/codeql/version.txt`, verifies the published SHA-256 checksum and installs
the CLI and compatible queries under `.codeql/tools/`. It requires `curl`, `tar`
and `sha256sum` (or `shasum`). Linux x64/ARM64 and macOS are supported by the
installer; macOS on Apple Silicon requires Rosetta for the official bundle.
An existing installation can be selected with `CODEQL_BIN=/path/to/codeql`.

`npm run test:codeql` creates fresh JavaScript/TypeScript and GitHub Actions
databases and runs each language's `security-extended` query suite. SARIF reports
are written to `.codeql/results/scan.*/javascript.sarif` and `actions.sarif` in
the same directory; the command prints the exact directory. Each run uses its
own databases and reports so simultaneous invocations cannot overwrite each
other. Any finding, analysis failure or invalid report fails the command and
`npm test`. Nothing is
uploaded to GitHub. Tools, databases and reports are ignored by Git and excluded
from the container build context.

The two SSH filesystem test files listed in `tests/codeql/config.yml` are
excluded from static analysis because they deliberately check, replace and
reread private temporary files to exercise race detection and inode retention.
They still run in `test:unit`. The remaining application, script, workflow and
test sources are scanned.

The default limits are two threads and 2048 MB for each CLI operation. Override
them with `CODEQL_THREADS` and `CODEQL_RAM` (MB) when needed. Bundles and databases
need several GB of disk space. See GitHub's [CLI setup guide](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/scan-from-the-command-line/set-up-codeql-cli)
for platform requirements.

### Docker compatibility and browser tests

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
