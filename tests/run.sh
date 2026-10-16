#!/usr/bin/env bash
# Run Node tests, every Docker compatibility suite (including Hurl), and the UI.
set -euo pipefail
cd "$(dirname "$0")/.."

npm run test:unit

# Keep the destructive test suites isolated from existing development stacks.
export COMPOSE_PROJECT_NAME="nda-test-$$"
DOCKER_VERSION=$(awk '!/^[[:space:]]*(#|$)/ { print; exit }' tests/compat/versions.txt)
if [ -z "$DOCKER_VERSION" ]; then
  echo "No Docker versions found in tests/compat/versions.txt" >&2
  exit 1
fi
export DOCKER_VERSION
COMPOSE=(docker compose -p "$COMPOSE_PROJECT_NAME" -f tests/compat/docker-compose.yml)
cleanup() { "${COMPOSE[@]}" down -v --remove-orphans; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

npm run test:compat

# Compatibility tests tear their stacks down. Start a fresh stack for the UI.
"${COMPOSE[@]}" up -d --build --wait --wait-timeout 180 dind netbox agent
NETWORK="${COMPOSE_PROJECT_NAME}_default" BASE_URL=http://agent:1880 DIND_URL=http://dind:2375 npm run test:browser
