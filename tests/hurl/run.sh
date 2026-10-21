#!/usr/bin/env bash
set -euo pipefail
if command -v hurl >/dev/null; then
  exec hurl --test --variable "host=${BASE_URL:-http://localhost:1880}" -u "${API_USERNAME:-admin}:${TEST_PASSWORD:-saashup}" tests/hurl/tests.hurl
fi
exec docker run --rm --network host -v "$PWD/tests/hurl:/tests:ro" ghcr.io/orange-opensource/hurl:latest --test --variable "host=${BASE_URL:-http://localhost:1880}" -u "${API_USERNAME:-admin}:${TEST_PASSWORD:-saashup}" /tests/tests.hurl
