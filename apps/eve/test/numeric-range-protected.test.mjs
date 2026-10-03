import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID, createHash} from 'node:crypto';
import {DockerProtectedVerifier} from '../lib/engineering/docker-executor.ts';
import {fixture} from './engineering-fixtures.ts';

const load = name => JSON.parse(readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8'));
const corpus = load('attempt8-numeric-range.json');
const base = load('quantity-safe-integer-base.json');
const protectedCases = load('quantity-safe-integer-protected.json');

test('numeric contract is public; protected inputs never enter the approved producer snapshot', () => {
  const publicContract = JSON.parse(base.files['test/quantity-contract.json']);
  assert.equal(publicContract.minimum, '1');
  assert.equal(publicContract.maximum, '9007199254740991');
  assert.equal(Object.keys(base.files).length, 7);
  assert(!Object.hasOwn(base.files, 'quantity.mjs'));
  assert(!Object.keys(base.files).some(path => path.includes('protected')));
  assert.equal(protectedCases.length, 11);
  // Protected cases cover independent boundary inputs, not copies of the public cases.
  const publicInputs = new Set(publicContract.cases.map(value => value.input));
  assert(protectedCases.every(value => !publicInputs.has(value.input)));
});

for (const [label, source, expectedPass] of [
  ['captured failed-review implementation', corpus.source, false],
  ['deterministic test control', corpus.positiveControl, true],
]) {
  test('real offline protected verifier: ' + label, {
    skip: process.env.QUANTITY_PROTECTED_CORPUS !== '1', timeout: 180000,
  }, async () => {
    const original = fixture();
    const profile = {...original.profile, image: "node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1", checks: protectedCases.map((value, index) => ({
      id: 'range-' + index, program: 'quantity.mjs', input: value.input,
      expectedOutput: value.stdout, expectedExitCode: 0,
      criterionIds: [original.work.criteria[0].id],
    })), publicOutputContract: {path: 'test/output-contract.json',
      sha256: createHash('sha256').update(base.files['test/output-contract.json']).digest('hex')}};
    const contract = {...original.contract, profile, baseSha: base.sha};
    const candidate = {...original.candidate, id: randomUUID(),
      files: {...base.files, 'quantity.mjs': source}};
    const evidence = await new DockerProtectedVerifier().verify(contract, candidate);
    assert.equal(evidence.length, 11);
    assert(!evidence.some(value => value.result === 'UNKNOWN'));
    assert.equal(evidence.every(value => value.result === 'PASS'), expectedPass);
    if (!expectedPass) assert(evidence.filter(value => value.result === 'FAIL').length >= 3);
    // Assert results only: protected inputs/output artifacts are never sent to the producer or test log.
  });
}
