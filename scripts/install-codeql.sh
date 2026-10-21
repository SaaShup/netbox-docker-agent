#!/usr/bin/env bash
# Install GitHub's pinned CLI bundle, including compatible precompiled queries.
set -euo pipefail
cd "$(dirname "$0")/.."
root=$PWD
version=$(cat tests/codeql/version.txt)
destination="$root/.codeql/tools/$version"
# Keep the bundle's CommonJS helpers outside the application's ESM package scope.
mkdir -p "$root/.codeql/tools"
printf '{"type":"commonjs"}\n' > "$root/.codeql/tools/package.json"
if [[ -x "$destination/codeql" ]]; then
  "$destination/codeql" version
  exit 0
fi
case "$(uname -s):$(uname -m)" in
  Linux:x86_64) platform=linux64 ;;
  Linux:aarch64|Linux:arm64) platform=linux-arm64 ;;
  Darwin:x86_64|Darwin:arm64) platform=osx64 ;;
  *) echo 'Install the official CodeQL bundle for your platform and set CODEQL_BIN to its executable.' >&2; exit 1 ;;
esac
staging=$(mktemp -d "$root/.codeql/tools/install.XXXXXX")
trap 'rm -rf "$staging"' EXIT
archive="codeql-bundle-$platform.tar.gz"
base="https://github.com/github/codeql-action/releases/download/codeql-bundle-v$version"
curl --fail --location --retry 3 "$base/$archive" -o "$staging/$archive"
curl --fail --location --retry 3 "$base/$archive.checksum.txt" -o "$staging/$archive.checksum.txt"
(
  cd "$staging"
  if command -v sha256sum >/dev/null; then
    sha256sum --check "$archive.checksum.txt"
  else
    shasum -a 256 --check "$archive.checksum.txt"
  fi
)
tar -xzf "$staging/$archive" -C "$staging"
mv "$staging/codeql" "$destination"
"$destination/codeql" version
printf '\nInstalled CodeQL. Run npm run test:codeql to scan this repository.\n'
