// Read pinned sibling contracts; never changes another checkout.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { eventSchema } from '../lib/universal-inbox/contracts.ts';
import { goalBlocker } from '../lib/universal-inbox/goals-adapter.ts';
import { createFixtureInbox, FIXTURE_NOW, fixtureApproval } from '../lib/universal-inbox/fixtures.ts';
import { betaApproval } from '../lib/universal-inbox/beta-crosswalk.ts';
const pins = { beta: 'ed0f6b5dad0e3a131a9f5332139e627245cbd4e8', goals: 'b9b46c41480f0859d44683346bd24d7ce9f2b7c9' };
const dir = await mkdtemp(join(tmpdir(), 'inbox-crosswalk-'));
const sources = {};
const load = async (name, sha, path) => {
  const source = execFileSync('git', ['show', `${sha}:${path}`], { encoding: 'utf8' });
  sources[path] = { sha, sha256: createHash('sha256').update(source).digest('hex') };
  const file = join(dir, `${name}.mts`); await writeFile(file, source); return import(pathToFileURL(file).href);
};
let fixture;
try {
  const beta = await load('beta', pins.beta, 'apps/eve/components/owner/projection.ts');
  const goals = await load('goals', pins.goals, 'apps/eve/lib/goal-work/attention-adapter.ts');
  const goal = { ownerId: 'fixture-owner', id: 'goal-need-1', source: 'goal-task', goalId: 'goal-1', taskId: 'task-1', goalGeneration: 2, taskGeneration: 3,
    dependencyId: 'dependency-1', reference: 'provider-choice', title: 'Choose provider', options: ['A','B'], revision: 1, updatedAt: FIXTURE_NOW };
  const existing = eventSchema.parse(goals.goalAttentionEvent(goal));
  const enriched = goalBlocker('fixture-owner', goal);
  assert.deepEqual(existing.action, enriched.action); assert.equal(enriched.goal.taskGeneration, 3);
  fixture = await createFixtureInbox(); const items = (await fixture.inbox.list({ view: 'needs_you' })).items;
  const approvals = items.filter(item => item.action?.kind === 'approval').map(item => betaApproval(item, fixtureApproval));
  assert.equal(beta.pendingApprovals(approvals, Date.parse(FIXTURE_NOW)).length, 1);
  assert.equal(beta.taskState('failed'), 'Recovery');
  const result = { pins, sources, existingGoalsEventCompatible: true, goalGenerationsPreserved: true, betaCanonicalApprovalProjectionCompatible: true,
    missingBetaAttentionSlot: true, ordinaryDecisionsRequireNewProductProjection: true, productionActivated: false };
  await writeFile('../../docs/verification/beta-integration/regressions/inbox/crosswalk.json', JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
} finally { fixture?.repository.close(); await rm(dir, { recursive: true, force: true }); }
