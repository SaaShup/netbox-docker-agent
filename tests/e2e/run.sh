#!/usr/bin/env bash
#
# Run the Playwright UI tests against a running agent.
#
# Expects the compat stack (dind + netbox + agent) to be up on the compose
# network (see ../compat). Uses the official Playwright image, which already
# bundles the browsers, so only the JS package is installed at run time.
#
#   NETWORK=nda-compat_default BASE_URL=http://agent:1880 ./run.sh
set -euo pipefail

cd "$(dirname "$0")"

NETWORK="${NETWORK:-nda-compat_default}"
BASE_URL="${BASE_URL:-http://agent:1880}"
IMAGE="mcr.microsoft.com/playwright:v1.49.1-noble"

docker run --rm --network "$NETWORK" \
  -v "$PWD:/e2e" -w /e2e \
  -e BASE_URL="$BASE_URL" \
  -e DIND_URL="${DIND_URL:-http://dind:2375}" \
  -e CI=1 \
  "$IMAGE" \
  sh -c "npm install --no-audit --no-fund --silent && npx playwright test"
