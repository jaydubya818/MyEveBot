import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

// Expected files/counts are reviewed source, never inferred from the report being
// qualified. Explicit skipped cases describe this job's scope, not passing tests.
export function assertReport(report, expected, sourceRoot) {
  assert.equal(report.success, true, 'Test report did not succeed');
  assert.ok(Array.isArray(report.testResults), 'Missing per-file results');
  const expectedFiles = Object.keys(expected).sort();
  const results = new Map();
  let total = 0, passed = 0, skipped = 0;
  for (const file of report.testResults) {
    assert.equal(typeof file.name, 'string', 'Missing suite path');
    const name = relative(resolve(sourceRoot), resolve(file.name)).split('\\').join('/');
    assert.ok(Object.hasOwn(expected, name), 'Unexpected suite: ' + name);
    assert.ok(!results.has(name), 'Duplicate suite: ' + name);
    results.set(name, file);
    const contract = expected[name];
    // Vitest's JSON reporter marks a file with only skipped assertions passed;
    // individual statuses and the explicit skipped identities remain mandatory.
    assert.equal(file.status, 'passed', 'Suite failed: ' + name);
    assert.ok(Array.isArray(file.assertionResults), 'Missing assertions: ' + name);
    assert.equal(file.assertionResults.length, contract.passed + contract.skipped.length, 'Assertion count changed: ' + name);
    const actualSkipped = [];
    let filePassed = 0;
    for (const test of file.assertionResults) {
      assert.equal(typeof test.fullName, 'string', 'Missing assertion identity');
      assert.ok(test.fullName.length > 0, 'Empty assertion identity');
      if (test.status === 'passed') filePassed++;
      else {
        assert.equal(test.status, 'skipped', 'Nonpassing assertion: ' + test.fullName);
        actualSkipped.push(test.fullName);
      }
      assert.deepEqual(test.failureMessages, [], 'Retained assertion failure: ' + test.fullName);
    }
    assert.equal(filePassed, contract.passed, 'Passing count changed: ' + name);
    assert.deepEqual(actualSkipped.sort(), [...contract.skipped].sort(), 'Skipped cases changed: ' + name);
    total += file.assertionResults.length; passed += filePassed; skipped += actualSkipped.length;
  }
  assert.deepEqual([...results.keys()].sort(), expectedFiles, 'Missing suites');
  assert.equal(report.numTotalTests, total);
  assert.equal(report.numPassedTests, passed);
  assert.equal(report.numPendingTests, skipped);
  assert.equal(report.numFailedTests, 0);
  assert.equal(report.numTodoTests, 0);
  assert.equal(report.numFailedTestSuites, 0);
  return {files: results.size, total, passed, skipped};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [profile, reportPath, sourceRoot] = process.argv.slice(2);
  assert.ok(profile && reportPath && sourceRoot, 'Usage: assert-report.mjs PROFILE REPORT SOURCE_ROOT');
  const profiles = JSON.parse(readFileSync(new URL('./report-expectations.json', import.meta.url)));
  assert.ok(Object.hasOwn(profiles, profile), 'Unknown report profile');
  const result = assertReport(JSON.parse(readFileSync(reportPath)), profiles[profile], sourceRoot);
  console.log(JSON.stringify({profile, ...result, status: 'PASS'}));
}
