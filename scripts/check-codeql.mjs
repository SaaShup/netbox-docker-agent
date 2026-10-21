import { readFile } from 'node:fs/promises';

// CodeQL's CLI exit status describes analysis execution, not whether it found alerts.
const filename = process.argv[2];
try {
  const report = JSON.parse(await readFile(filename, 'utf8'));
  if (report.version !== '2.1.0' || !Array.isArray(report.runs) || !report.runs.length) throw Error('Invalid or empty SARIF report');
  let findings = 0;
  for (const run of report.runs) {
    if (!Array.isArray(run.results)) throw Error('SARIF results are missing');
    if (run.invocations?.some(invocation => invocation.executionSuccessful === false)) throw Error('CodeQL analysis did not complete successfully');
    for (const result of run.results) {
      findings++;
      const location = result.locations?.[0]?.physicalLocation;
      console.error(`${result.ruleId}: ${location?.artifactLocation?.uri || 'unknown file'}:${location?.region?.startLine || '?'} ${result.message?.text || ''}`);
    }
  }
  console.log(`CodeQL: ${findings} finding(s). Report: ${filename}`);
  if (findings) process.exitCode = 1;
} catch (error) {
  console.error(`Unable to validate CodeQL report: ${error.message}`);
  process.exitCode = 1;
}
