import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('concurrent CodeQL runs keep their databases and reports separate', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'nda-codeql-runner-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ['tests/codeql', 'scripts']) await mkdir(path.join(root, directory), { recursive: true });
  for (const file of ['tests/codeql/run.sh', 'tests/codeql/config.yml', 'tests/codeql/version.txt', 'scripts/check-codeql.mjs']) {
    await copyFile(new URL(`../../${file}`, import.meta.url), path.join(root, file));
  }
  const cli = path.join(root, 'fake-codeql');
  await writeFile(cli, `#!/bin/bash
set -eu
if [[ "$1" == version ]]; then exit 0; fi
if [[ "$2" == create ]]; then
  # Fails if another scan tries to create the same database.
  mkdir "$3"
elif [[ "$2" == analyze ]]; then
  for arg in "$@"; do
    if [[ "$arg" == --output=* ]]; then
      printf '{"version":"2.1.0","runs":[{"results":[]}]}' > "\${arg#--output=}"
    fi
  done
fi
`, { mode: 0o755 });
  const run = () => new Promise((resolve, reject) => {
    const child = spawn('bash', ['tests/codeql/run.sh'], {
      cwd: root, timeout: 10000,
      env: { ...process.env, CODEQL_BIN: cli, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}` },
    });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.on('error', reject);
    child.on('close', status => resolve({ status, output }));
  });
  const runs = await Promise.all([run(), run()]);
  const directories = runs.map(result => {
    assert.equal(result.status, 0, result.output);
    assert.equal((result.output.match(/CodeQL: 0 finding/g) || []).length, 2);
    return result.output.match(/^CodeQL reports: (.+)$/m)[1];
  });
  assert.notEqual(directories[0], directories[1]);
});
