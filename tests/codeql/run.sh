#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
root=$PWD
version=$(cat tests/codeql/version.txt)
codeql_bin=${CODEQL_BIN:-"$root/.codeql/tools/$version/codeql"}
if [[ ! -x "$codeql_bin" ]]; then
  echo 'CodeQL is not installed. Run npm run codeql:install, or set CODEQL_BIN to an installed executable.' >&2
  exit 1
fi
mkdir -p .codeql/databases .codeql/results
run_dir=$(mktemp -d "$root/.codeql/databases/scan.XXXXXX")
report_dir="$root/.codeql/results/${run_dir##*/}"
mkdir -p "$report_dir"
printf 'CodeQL reports: %s\n' "$report_dir"
"$codeql_bin" version
result=0
for language in javascript actions; do
  database="$run_dir/$language"
  report="$report_dir/$language.sarif"
  "$codeql_bin" database create "$database" \
    --language="$language" --source-root="$root" \
    --codescanning-config="$root/tests/codeql/config.yml" \
    --threads="${CODEQL_THREADS:-2}" --ram="${CODEQL_RAM:-2048}"
  "$codeql_bin" database analyze "$database" \
    "codeql/$language-queries:codeql-suites/$language-security-extended.qls" \
    --format=sarifv2.1.0 --output="$report" \
    --threads="${CODEQL_THREADS:-2}" --ram="${CODEQL_RAM:-2048}"
  node scripts/check-codeql.mjs "$report" || result=1
done
exit "$result"
