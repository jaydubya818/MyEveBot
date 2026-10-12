import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finishQualification, bounded } from './cleanup.mjs';
test('lost Relay cleanup acknowledgment prevents PASS while remaining owned resources are cleaned', async () => {
  const report = { status: 'PASS' }, completed = [];
  const confirmed = await finishQualification(report, [
    ['relay', async () => { throw Error('lost acknowledgment'); }],
    ['convex', async () => { completed.push('convex'); }],
    ['postgres', async () => { completed.push('postgres'); }],
  ]);
  assert.equal(confirmed, false);
  assert.equal(report.status, 'FAIL');
  assert.deepEqual(completed, ['convex', 'postgres']);
  assert.deepEqual(report.fixtureCleanup.map(item => item.status), ['UNCONFIRMED', 'CONFIRMED', 'CONFIRMED']);
});
test('unavailable child exit is bounded; confirmed cleanup cannot erase an earlier journey failure', async () => {
  await assert.rejects(bounded(new Promise(() => {}), 10, 'child'), /child timeout/);
  const report = { status: 'FAIL' };
  assert.equal(await finishQualification(report, [['own fixture', async () => {}]]), true);
  assert.equal(report.status, 'FAIL');
});
