import test from 'node:test';
import assert from 'node:assert/strict';
import {assertReport} from './assert-report.mjs';

const expected = {'suite/a.test.ts': {passed: 1, skipped: []}, 'suite/b.test.ts': {passed: 1, skipped: ['separate Docker gate']}};
const passing = () => ({success: true, numTotalTests: 3, numPassedTests: 2, numPendingTests: 1, numFailedTests: 0, numTodoTests: 0, numFailedTestSuites: 0,
  testResults: Object.entries(expected).map(([name, contract]) => ({name: '/source/' + name, status: 'passed', assertionResults: [
    {fullName: name + ' qualified case', status: 'passed', failureMessages: []},
    ...contract.skipped.map(fullName => ({fullName, status: 'skipped', failureMessages: []})),
  ]}))});

test('qualifies exact files and counts while retaining explicitly separate skipped scope', () => {
  assert.deepEqual(assertReport(passing(), expected, '/source'), {files: 2, total: 3, passed: 2, skipped: 1});
});
test('rejects forged green totals, incomplete or foreign files, and changed skipped cases', () => {
  const changes = [
    r => {r.success = false;},
    r => {r.numTotalTests = 0;},
    r => {r.numPassedTests++;},
    r => {r.numPendingTests = 0;},
    r => {r.numFailedTests = 1;},
    r => {r.numTodoTests = 1;},
    r => {r.numFailedTestSuites = 1;},
    r => {r.testResults.pop();},
    r => {r.testResults.push(r.testResults[0]);},
    r => {r.testResults[0].name = '/other/suite/a.test.ts';},
    r => {r.testResults[0].status = 'failed';},
    r => {r.testResults[0].assertionResults = [];},
    r => {r.testResults[0].assertionResults[0].status = 'skipped';},
    r => {r.testResults[0].assertionResults[0].status = 'todo';},
    r => {r.testResults[0].assertionResults[0].failureMessages = ['failure'];},
    r => {r.testResults[1].assertionResults[1].fullName = 'different omitted case';},
    r => {r.testResults[1].assertionResults[1].status = 'passed';},
  ];
  for (const change of changes) {const report = passing(); change(report); assert.throws(() => assertReport(report, expected, '/source'));}
});
