#!/usr/bin/env bash
#
# Run the compatibility suite against the agent for one or more dockerd versions.
#
#   ./run.sh                 # test every version listed in versions.txt
#   ./run.sh 29.5.2          # test a single version
#   ./run.sh 29.5.2 28.3.1   # test a specific set of versions
#
# For each version it stands up dind(<version>) + a netbox mock + the agent,
# then runs:
#   1. the hurl suite (read/version/lifecycle + the original smoke tests)
#   2. the websocket-exec test (not expressible in hurl)
#   3. the netbox-contract test, against a freshly restarted agent so the
#      agent's own config-persistence during step 1 can't interfere
# ...before tearing everything down.
#
# Exits non-zero if any version fails.
set -euo pipefail

cd "$(dirname "$0")"

COMPOSE=(docker compose -p nda-compat)

# Main suite (run together against the same agent).
HURL_MAIN=(
  /tests/tests.hurl
  /tests/read.hurl
  /tests/version.hurl
  /tests/lifecycle.hurl
  /tests/volumes.hurl
  /tests/images.hurl
  /tests/metrics.hurl
  /tests/errors.hurl
)
# Agent->netbox tests: run in isolation (see below) — the contract callback
# and the dockerd event watcher, both of which depend on a clean netbox config.
HURL_NETBOX=(/tests/netbox.hurl /tests/events.hurl)

if [ "$#" -gt 0 ]; then
  versions=("$@")
else
  mapfile -t versions < <(grep -vE '^[[:space:]]*(#|$)' versions.txt)
fi

if [ "${#versions[@]}" -eq 0 ]; then
  echo "No versions to test (check versions.txt)." >&2
  exit 1
fi

declare -A results
overall=0

cleanup() { DOCKER_VERSION="${1:-x}" "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true; }

wait_healthy() { # $1 = container name
  for _ in $(seq 1 45); do
    [ "$("${COMPOSE[@]}" ps -q "$1" | xargs -r docker inspect -f '{{.State.Health.Status}}' 2>/dev/null)" = "healthy" ] && return 0
    sleep 2
  done
  return 1
}

hurl() { # remaining args: hurl files
  "${COMPOSE[@]}" run --rm tester \
    --test --color \
    --variable host=http://agent:1880 \
    --variable netbox=http://netbox:8080 \
    --variable dind=http://dind:2375 \
    --variable docker_version="$DOCKER_VERSION" \
    -u admin:saashup "$@"
}

for v in "${versions[@]}"; do
  echo "==================================================================="
  echo "=== Testing agent against dockerd $v"
  echo "==================================================================="
  export DOCKER_VERSION="$v"
  cleanup "$v"

  if ! "${COMPOSE[@]}" up -d --build dind netbox agent; then
    results["$v"]="SETUP-FAIL"; overall=1
    "${COMPOSE[@]}" logs || true
    cleanup "$v"
    continue
  fi

  step_fail=0

  # --- 1. hurl main suite ---------------------------------------------------
  hurl "${HURL_MAIN[@]}" || { echo "!!! hurl suite failed for $v"; step_fail=1; }

  # --- 2. websocket exec (F): not expressible in hurl -----------------------
  # Self-contained: it pulls nginx:alpine through the agent itself.
  "${COMPOSE[@]}" exec -T agent node --input-type=module - < ws-exec-test.mjs \
    || { echo "!!! websocket-exec test failed for $v"; step_fail=1; }

  # --- 3. netbox contract (E), isolated -------------------------------------
  # The agent rewrites /data/config.js from netbox responses during the suite
  # above, which can clear netbox_url. Restarting re-seeds a clean config (the
  # entrypoint copies it from /seed), giving this test a known-good agent.
  "${COMPOSE[@]}" restart agent >/dev/null 2>&1 || true
  if wait_healthy agent; then
    hurl "${HURL_NETBOX[@]}" || { echo "!!! netbox-contract test failed for $v"; step_fail=1; }
  else
    echo "!!! agent did not become healthy after restart for $v"; step_fail=1
  fi

  if [ "$step_fail" -eq 0 ]; then
    results["$v"]="PASS"
  else
    results["$v"]="FAIL"; overall=1
    echo "--- agent logs ($v) ---"; "${COMPOSE[@]}" logs agent | tail -40 || true
  fi

  cleanup "$v"
done

echo
echo "===== Compatibility summary ====="
for v in "${versions[@]}"; do
  printf '  dockerd %-12s %s\n' "$v" "${results[$v]:-UNKNOWN}"
done

exit "$overall"
