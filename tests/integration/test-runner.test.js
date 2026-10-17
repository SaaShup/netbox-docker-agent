import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('npm test summarizes success, failures, skipped suites and cleanup without losing the exit code', async t => {
  const bin = await mkdtemp(path.join(tmpdir(), 'nda-test-summary-'));
  t.after(() => rm(bin, { recursive: true, force: true }));
  await writeFile(path.join(bin, 'npm'), `#!/bin/bash
if [[ "$2" == "$FAIL_SUITE" ]]; then exit 23; fi
if [[ "$2" == "$INTERRUPT_SUITE" ]]; then kill -TERM "$PPID"; fi
exit 0
`, { mode: 0o755 });
  await writeFile(path.join(bin, 'docker'), `#!/bin/bash
for arg in "$@"; do
  if [[ "$arg" == up && "$FAIL_SETUP" == 1 ]]; then exit 42; fi
  if [[ "$arg" == down ]]; then
    echo 'Test stack cleanup ran'
    if [[ "$FAIL_CLEANUP" == 1 ]]; then exit 43; fi
  fi
done
exit 0
`, { mode: 0o755 });

  const cases = [
    { name: 'success', env: {}, status: 0, results: ['PASS', 'PASS', 'PASS', 'PASS'] },
    { name: 'unit failure', env: { FAIL_SUITE: 'test:unit' }, status: 23, results: ['FAIL', 'SKIPPED', 'SKIPPED', 'SKIPPED'] },
    { name: 'CodeQL failure', env: { FAIL_SUITE: 'test:codeql' }, status: 23, results: ['PASS', 'FAIL', 'SKIPPED', 'SKIPPED'] },
    { name: 'compatibility failure', env: { FAIL_SUITE: 'test:compat' }, status: 23, results: ['PASS', 'PASS', 'FAIL', 'SKIPPED'] },
    { name: 'browser setup failure', env: { FAIL_SETUP: '1' }, status: 42, results: ['PASS', 'PASS', 'PASS', 'FAIL'] },
    { name: 'browser failure', env: { FAIL_SUITE: 'test:browser' }, status: 23, results: ['PASS', 'PASS', 'PASS', 'FAIL'] },
    { name: 'cleanup failure', env: { FAIL_CLEANUP: '1' }, status: 43, results: ['PASS', 'PASS', 'PASS', 'PASS'] },
    { name: 'suite and cleanup failure', env: { FAIL_SUITE: 'test:browser', FAIL_CLEANUP: '1' }, status: 23, results: ['PASS', 'PASS', 'PASS', 'FAIL'] },
    { name: 'interruption', env: { INTERRUPT_SUITE: 'test:unit' }, status: 143, results: ['FAIL', 'SKIPPED', 'SKIPPED', 'SKIPPED'] },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const result = spawnSync('bash', ['tests/run.sh'], {
        cwd: new URL('../../', import.meta.url),
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAIL_SUITE: '', FAIL_SETUP: '', FAIL_CLEANUP: '', INTERRUPT_SUITE: '', ...scenario.env },
        encoding: 'utf8', timeout: 10000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, scenario.status, result.stdout + result.stderr);
      const summary = result.stdout.slice(result.stdout.indexOf('===== npm test summary ====='));
      const names = ['Unit and integration', 'CodeQL security', 'Docker compatibility', 'Browser UI'];
      names.forEach((name, i) => assert.match(summary, new RegExp(`${name} +${scenario.results[i]} +\\d+s`)));
      assert.match(summary, new RegExp(`Overall: ${scenario.status ? 'FAIL' : 'PASS'} .*\\d+s\\)\\n$`));
      if (scenario.status) assert.ok(summary.includes(`exit ${scenario.status},`));
      if (scenario.env.FAIL_CLEANUP) assert.match(summary, /Test stack cleanup: FAIL/);
      assert.equal(result.stdout.includes('Test stack cleanup ran'), scenario.results[1] === 'PASS');
    });
  }
});
