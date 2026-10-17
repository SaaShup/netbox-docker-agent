import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('CodeQL report gate rejects findings, incomplete analysis and invalid reports', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nda-codeql-report-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'results.sarif');
  const cases = [
    { name: 'clean scan', runs: [{ results: [], invocations: [{ executionSuccessful: true }] }], status: 0, message: /0 finding/ },
    { name: 'finding', runs: [{ results: [{ ruleId: 'js/clear-text-logging', message: { text: 'Sensitive data logged' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'src/server.js' }, region: { startLine: 32 } } }] }] }], status: 1, message: /js\/clear-text-logging: src\/server.js:32/ },
    { name: 'incomplete analysis', runs: [{ results: [], invocations: [{ executionSuccessful: false }] }], status: 1, message: /did not complete successfully/ },
    { name: 'missing results', runs: [{}], status: 1, message: /results are missing/ },
    { name: 'no runs', runs: [], status: 1, message: /Invalid or empty/ },
    { name: 'finding in second run', runs: [{ results: [] }, { results: [{ ruleId: 'example' }] }], status: 1, message: /1 finding/ },
    { name: 'malformed JSON', raw: '{', status: 1, message: /Unable to validate/ },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      await writeFile(filename, scenario.raw ?? JSON.stringify({ version: '2.1.0', runs: scenario.runs }));
      const result = spawnSync(process.execPath, ['scripts/check-codeql.mjs', filename], {
        cwd: new URL('../../', import.meta.url), encoding: 'utf8', timeout: 10000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, scenario.status, result.stdout + result.stderr);
      assert.match(result.stdout + result.stderr, scenario.message);
    });
  }
});
