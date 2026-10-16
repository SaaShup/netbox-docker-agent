# Browser tests

The original Playwright scenarios are retained and adapted to the vanilla dashboard's semantic controls. They cover navigation, counts, live lists, start/stop/kill/restart, timestamped logs, HTTP exec, a real interactive terminal, image pull/removal and operation notifications. Additional scenarios cover hostile Docker metadata, narrow viewports and JSON validation.

Start a dedicated compatibility stack and leave it unchanged for the entire run:

```sh
DOCKER_VERSION=29.5.2 docker compose -p nda-ui -f tests/compat/docker-compose.yml up -d --build dind netbox agent
NETWORK=nda-ui_default BASE_URL=http://agent:1880 tests/e2e/run.sh
DOCKER_VERSION=29.5.2 docker compose -p nda-ui -f tests/compat/docker-compose.yml down -v
```

The runner uses the official Playwright image matching the pinned test dependency. `UI_USER`/`UI_PASS` can configure Playwright credentials when running directly. Container defaults are `admin`/`saashup`. Tests seed Docker resources through the agent and clean up directly on the isolated daemon (`DIND_URL`). Do not point them at a production daemon.

Failure traces and screenshots are saved in `test-results/`. Use `npx playwright show-trace <trace.zip>` to investigate. Browser coverage currently targets Chromium; other browsers are not claimed as validated.

Host SSH key UI scenarios are in `12-host-ssh-keys.spec.ts`. They stub the SSH
endpoint by default. The real mounted-file scenario requires `SSH_KEYS_E2E=1` and an
isolated agent mounting a temporary host file; never point this scenario at
real host authorized keys. See [host SSH setup](../../docs/HOST-SSH-KEYS.md).

Interactive Swagger UI tests are in `13-api-documentation.spec.ts`. They check
local assets/CSP, real authenticated GET execution, editable request bodies,
DELETE payloads, path/query parameters, shared API authorization and visible
HTTP errors. Mutating calls are intercepted by the tests.
