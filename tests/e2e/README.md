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
- `04-logs.spec.ts` (**P4**) — the Logs tab fetches and renders the container's
  log output.
- `05-exec-terminal.spec.ts` (**P5**) — the Exec tab runs a one-shot command
  and shows its stdout, and the Terminal tab opens an interactive xterm.js
  console over the websocket exec channel and echoes a typed command.
- `06-images.spec.ts` (**P6**) — the per-image Remove and Pull buttons drive
  real delete / re-pull operations on the daemon.
- `07-notifications.spec.ts` (**P7**) — the notification modal pops up for an
  operation with the right title/message, then auto-dismisses.

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
