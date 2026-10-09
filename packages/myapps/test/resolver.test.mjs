import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReferenceStore } from '../src/store.ts';
import { Crm } from '../src/crm.ts';
import { resolveApp, sofieRequest } from '../src/resolver.ts';
import { principal, installed, makePackage, leadInput, OWNER } from './fixtures.mjs';
test('Sofie fixture resolves exact installed state and replays one mutation', () => {
  const store = new ReferenceStore(), pkg = makePackage(), row = installed(store), crm = new Crm(store, principal());
  crm.action(pkg.appId, 1, row.digest, 'createLead', leadInput, 'create');
  const agent = principal(OWNER, 'agent'), first = sofieRequest(store, agent, 'turn1', 'Move Acme to Proposal.', '2026-10-08');
  assert.equal(first.lead.stage, 'Proposal');
  assert.deepEqual(sofieRequest(store, agent, 'turn1', 'Move Acme to Proposal.', '2026-10-08'), first);
  assert.equal(store.session(principal()).history(pkg.appId).filter(e => e.action === 'updateStage').length, 1);
  assert.equal(sofieRequest(store, agent, 'turn2', 'Send Acme a follow-up.', '2026-10-08').status, 'APPROVAL_REQUIRED');
  assert.equal(sofieRequest(store, agent, 'turn3', 'Add a Lead Source report.', '2026-10-08').status, 'WORK_REQUIRED');
  assert.equal(resolveApp(store, principal('synthetic-owner-b'), 'getLead').status, 'NO_MATCH');
  installed(store, makePackage(OWNER, 1, null, 'crm-request-2'), 'crm-request-2');
  assert.equal(resolveApp(store, agent, 'getLead').status, 'AMBIGUOUS'); store.close();
});
