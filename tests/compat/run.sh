#!/usr/bin/env bash
#
# Run the hurl suite against the agent for one or more dockerd versions.
#
#   ./run.sh                 # test every version listed in versions.txt
#   ./run.sh 29.5.2          # test a single version
#   ./run.sh 29.5.2 28.3.1   # test a specific set of versions
#
# Exits non-zero if any version fails.
set -euo pipefail

cd "$(dirname "$0")"

COMPOSE=(docker compose -p nda-compat)

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

for v in "${versions[@]}"; do
  echo "==================================================================="
  echo "=== Testing agent against dockerd $v"
  echo "==================================================================="
  export DOCKER_VERSION="$v"
  cleanup "$v"

  if ! "${COMPOSE[@]}" up -d --build dind agent; then
    results["$v"]="SETUP-FAIL"; overall=1
    "${COMPOSE[@]}" logs || true
    cleanup "$v"
    continue
  fi

  if "${COMPOSE[@]}" run --rm tester; then
    results["$v"]="PASS"
  else
    results["$v"]="FAIL"; overall=1
    echo "--- agent logs ($v) ---"; "${COMPOSE[@]}" logs agent || true
    echo "--- dind logs ($v) ---";  "${COMPOSE[@]}" logs dind  || true
  fi

  cleanup "$v"
done

echo
echo "===== Compatibility summary ====="
for v in "${versions[@]}"; do
  printf '  dockerd %-12s %s\n' "$v" "${results[$v]:-UNKNOWN}"
done

exit "$overall"
