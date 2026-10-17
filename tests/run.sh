#!/usr/bin/env bash
# Run Node tests, CodeQL, every Docker compatibility suite, and the UI.
set -euo pipefail
cd "$(dirname "$0")/.."

suite_names=('Unit and integration' 'CodeQL security' 'Docker compatibility' 'Browser UI')
suite_results=(SKIPPED SKIPPED SKIPPED SKIPPED)
suite_seconds=(0 0 0 0)
active_suite=-1
suite_started=0
test_started=$SECONDS
stack_started=false

finish() {
  local status=$? cleanup_status=0 i
  trap - EXIT
  if (( active_suite >= 0 )); then
    suite_results[$active_suite]=FAIL
    suite_seconds[$active_suite]=$((SECONDS - suite_started))
  fi
  if "$stack_started"; then
    "${COMPOSE[@]}" down -v --remove-orphans || cleanup_status=$?
    if (( status == 0 && cleanup_status != 0 )); then status=$cleanup_status; fi
  fi
  printf '\n===== npm test summary =====\n'
  for i in "${!suite_names[@]}"; do
    printf '  %-24s %-7s %ss\n' "${suite_names[$i]}" "${suite_results[$i]}" "${suite_seconds[$i]}"
  done
  if (( cleanup_status != 0 )); then printf '  Test stack cleanup: FAIL\n'; fi
  if (( status == 0 )); then
    printf 'Overall: PASS (%ss)\n' "$((SECONDS - test_started))"
  else
    printf 'Overall: FAIL (exit %s, %ss)\n' "$status" "$((SECONDS - test_started))"
  fi
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

begin_suite() {
  active_suite=$1
  suite_started=$SECONDS
}
pass_suite() {
  suite_results[$active_suite]=PASS
  suite_seconds[$active_suite]=$((SECONDS - suite_started))
  active_suite=-1
}

begin_suite 0
npm run test:unit
pass_suite

begin_suite 1
npm run test:codeql
pass_suite

# Keep the destructive test suites isolated from existing development stacks.
export COMPOSE_PROJECT_NAME="nda-test-$$"
begin_suite 2
DOCKER_VERSION=$(awk '!/^[[:space:]]*(#|$)/ { print; exit }' tests/compat/versions.txt)
if [ -z "$DOCKER_VERSION" ]; then
  echo "No Docker versions found in tests/compat/versions.txt" >&2
  exit 1
fi
export DOCKER_VERSION
COMPOSE=(docker compose -p "$COMPOSE_PROJECT_NAME" -f tests/compat/docker-compose.yml)
stack_started=true

npm run test:compat
pass_suite

# Compatibility tests tear their stacks down. Start a fresh stack for the UI.
begin_suite 3
"${COMPOSE[@]}" up -d --build --wait --wait-timeout 180 dind netbox agent
NETWORK="${COMPOSE_PROJECT_NAME}_default" BASE_URL=http://agent:1880 DIND_URL=http://dind:2375 npm run test:browser
pass_suite
