import test from 'node:test';
import assert from 'node:assert/strict';
import {failedFixturePhase, measureFixturePreparation} from './fixture-timing.mjs';
test('whole setup duration is not presented as a command deadline or per-phase measurement', async () => {
  const report = {}, fixture = {}, readings = [0, 65001];
  assert.equal(await measureFixturePreparation(report, async () => fixture, () => readings.shift()), fixture);
  assert.deepEqual(report.fixturePreparation, {status: 'PASS', scope: 'startFixtureDatabase-total', elapsedMs: 65001, phaseTimings: 'NOT_COLLECTED', failedPhase: null});
});
test('failure phase uses only the existing redacted diagnostic, preserves failure, and otherwise stays UNKNOWN', async () => {
  const error = Error('Disposable fixture command failed: {"stage":"PREPARE_FUNCTIONS","code":"ETIMEDOUT","elapsedMs":60065,"timeoutMs":60000}; backend: {"bytes":0}');
  const report = {}, readings = [100, 60200];
  await assert.rejects(measureFixturePreparation(report, async () => {throw error;}, () => readings.shift()), caught => caught === error);
  assert.deepEqual(report.fixturePreparation, {status: 'FAIL', scope: 'startFixtureDatabase-total', elapsedMs: 60100, phaseTimings: 'NOT_COLLECTED', failedPhase: 'PREPARE_FUNCTIONS'});
  for (const message of ['PREPARE_FUNCTIONS timed out', 'Disposable fixture command failed: not-json', 'Disposable fixture command failed: {"stage":"invented"}']) assert.equal(failedFixturePhase(Error(message)), 'UNKNOWN');
  const unknown = {}; await assert.rejects(measureFixturePreparation(unknown, async () => {throw Error('60 seconds');}));
  assert.equal(unknown.fixturePreparation.failedPhase, 'UNKNOWN');
});
