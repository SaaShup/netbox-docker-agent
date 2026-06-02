# Web UI end-to-end tests (Playwright)

Browser tests for the agent's dashboard ([public/index.html](../../public/index.html)),
driving the real UI against a running agent + daemon.

## Coverage

- `01-navigation.spec.ts` (**P1**) — the page loads without JS errors, the title
  is correct, every tab switches sections, and Home renders the host info and
  the system-usage chart.
- `02-lists.spec.ts` (**P2**) — a container/image/network seeded via the agent
  API shows up in the corresponding UI list, with the right count.
- `03-container-actions.spec.ts` (**P3**) — the Start / Stop / Kill / Restart
  buttons in a container card drive real operations: the test clicks the
  button, confirms the notification modal, and verifies the resulting daemon
  state via the API.

## Running

Requires the compat stack to be up (so the agent talks to a real daemon):

```sh
# from tests/compat — bring up dind + netbox + agent
DOCKER_VERSION=29.5.2 docker compose -p nda-compat up -d --build dind netbox agent

# then, from here
./run.sh
```

`run.sh` uses the official `mcr.microsoft.com/playwright` image (browsers
bundled) on the compose network, pointing `BASE_URL` at `http://agent:1880`.
The UI is behind basic auth; credentials default to `admin` / `saashup` and are
supplied via Playwright's `httpCredentials`.
