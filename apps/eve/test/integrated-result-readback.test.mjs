import assert from 'node:assert/strict';
import test from 'node:test';
import { canReviewRetainedResult, resultPublicationReadback } from '../components/owner/result-readback.ts';

function fixture() {
  const work = { id: 'work', scopeId: 'owner', version: 2, generation: 3, criteriaVersion: 4,
    lifecycle: 'active', control: 'human', criteria: [{ id: 'criterion', method: 'test' }] };
  const result = { id: 'result', work_id: 'work', work_version: 2, work_generation: 3,
    current_work_version: 2, current_work_generation: 3, candidate_sha: 'candidate', content_hash: 'digest',
    proof: { workId: 'work', workVersion: 2, criteriaVersion: 4, outcome: 'PARTIAL', resultRevision: 'candidate',
      evidence: [{ criterionId: 'criterion', resultRevision: 'candidate', state: 'PASS', producer: 'trusted-verifier' }] },
    publicationReadback: { binding: { owner: 'owner', workId: 'work', resultId: 'result', resultHash: 'digest', version: 2, generation: 3, candidate: 'candidate' },
      ci: { status: 'FAIL' }, review: { status: 'PENDING' }, ownerAcceptance: 'NOT_RUN' } };
  return { result, work };
}

test('a current retained candidate can link to independent backend review without asserting completion', () => {
  const { result, work } = fixture();
  assert.equal(canReviewRetainedResult(result, work), true);
  assert.equal(result.proof.outcome, 'PARTIAL');
  assert.equal(resultPublicationReadback(result, work), result.publicationReadback);
  assert.equal(resultPublicationReadback(result, work).ci.status, 'FAIL');
});

for (const [name, alter] of Object.entries({
  empty: r => r.proof.evidence = [],
  duplicate: r => r.proof.evidence.push({ ...r.proof.evidence[0] }),
  foreignCriterion: r => r.proof.evidence[0].criterionId = 'foreign',
  staleCandidate: r => r.proof.evidence[0].resultRevision = 'old',
  executor: r => r.proof.evidence[0].producer = 'executor',
  failed: r => r.proof.evidence[0].state = 'FAIL',
  unknown: r => r.proof.evidence[0].state = 'UNKNOWN',
  stale: r => r.proof.evidence[0].state = 'STALE',
  notRun: r => r.proof.evidence[0].state = 'NOT_RUN',
  proofCandidate: r => r.proof.resultRevision = 'old',
  foreignWork: r => r.proof.workId = 'foreign',
  oldProofVersion: r => r.proof.workVersion = 1,
  oldResultVersion: r => r.work_version = 1,
  changedVersion: r => r.current_work_version = 3,
  oldGeneration: r => r.work_generation = 2,
  changedGeneration: r => r.current_work_generation = 4,
  absentGeneration: r => delete r.work_generation,
  oldCriteria: r => r.proof.criteriaVersion = 3,
})) test(`review link fails closed for ${name}`, () => {
  const { result, work } = fixture(); alter(result);
  assert.equal(canReviewRetainedResult(result, work), false);
});

test('missing, terminal, stopping, empty criteria and incomplete human criteria fail closed', () => {
  const { result, work } = fixture();
  assert.equal(canReviewRetainedResult(result, undefined), false);
  assert.equal(resultPublicationReadback(result, undefined), null);
  for (const lifecycle of ['accepted', 'cancelled', 'failed', 'superseded'])
    assert.equal(canReviewRetainedResult(result, { ...work, lifecycle }), false);
  assert.equal(canReviewRetainedResult(result, { ...work, control: 'stopping' }), false);
  assert.equal(canReviewRetainedResult(result, { ...work, criteria: [] }), false);
  work.criteria.push({ id: 'human', method: 'human' });
  assert.equal(canReviewRetainedResult(result, work), false);
  result.proof.evidence.push({ criterionId: 'human', resultRevision: 'candidate', state: 'PASS', producer: 'human' });
  assert.equal(canReviewRetainedResult(result, work), true);
});

for (const key of ['owner', 'workId', 'resultId', 'resultHash', 'version', 'generation', 'candidate'])
  test(`foreign publication ${key} is not presented as current`, () => {
    const { result, work } = fixture(); result.publicationReadback.binding[key] = 'foreign';
    assert.equal(resultPublicationReadback(result, work), null);
  });
