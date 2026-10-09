import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical, digest, validatePackage, validateSpec } from '../src/contracts.ts';
import { ReferenceStore } from '../src/store.ts';
import { Crm } from '../src/crm.ts';
import { makePackage, principal, installed, verified, leadInput, OWNER } from './fixtures.mjs';

test('canonical package hashes key order independently and rejects lossy/non-JSON data', () => {
  assert.equal(digest({ b: 2, a: 1 }), digest({ a: 1, b: 2 }));
  assert.notEqual(digest([1, 2]), digest([2, 1]));
  for (const value of [undefined, NaN, Infinity, -0, 1.1, new Date(), { x: undefined }, Array(2), JSON.parse('{"__proto__":{}}')]) assert.throws(() => canonical(value));
  const cycle = {}; cycle.self = cycle; assert.throws(() => canonical(cycle));
});
test('every package identity/security component affects digest and arbitrary content is denied', () => {
  const pkg = makePackage(); validatePackage(pkg);
  for (const mutate of [p => p.spec.ownerId = 'foreign', p => p.spec.network.hosts.push('attacker.invalid'), p => p.spec.skills.push({ skill_id: 'email', version: '1.0.0', digest: digest({}) }), p => p.spec.code = 'fetch()', p => p.spec.secrets.push('SECRET'), p => p.migration.kind = 'sql', p => p.source.template = 'execute']) {
    const changed = structuredClone(pkg); mutate(changed);
    assert.notEqual(digest(changed), digest(pkg)); assert.throws(() => validatePackage(changed));
  }
  assert.throws(() => validateSpec({ ...pkg.spec, qualification: 'PASS' }));
});
test('candidate, verified, preview, pending and installed are separate; packages and Proof remain immutable', () => {
  const store = new ReferenceStore(), pkg = makePackage(), session = store.session(principal());
  const row = store.register('crm-request-1', pkg);
  assert.equal(session.get(pkg.appId).installedVersion, null);
  assert.throws(() => store.createPreview(OWNER, pkg.appId, 1));
  assert.equal(store.register('crm-request-1', pkg).digest, row.digest);
  assert.throws(() => store.register('crm-request-1', { ...pkg, source: { ...pkg.source, candidateId: 'changed' } }), /IMMUTABLE/);
  verified(store, pkg); const preview = store.createPreview(OWNER, pkg.appId, 1);
  const approval = session.requestInstall(pkg.appId, preview.id);
  assert.equal(session.get(pkg.appId).installedVersion, null);
  assert.throws(() => store.session(principal(OWNER, 'agent')).approveInstall(pkg.appId, approval.id), /APP_UNAVAILABLE/);
  session.approveInstall(pkg.appId, approval.id);
  assert.equal(session.approveInstall(pkg.appId, approval.id).duplicate, true);
  assert.equal(session.version(pkg.appId, 1).proof.installation, 'NOT_INSTALLED');
  assert.equal(session.get(pkg.appId).installedDigest, row.digest);
  store.close();
});
test('owner boundary denies registry, Proof, preview and runtime identically to missing App', () => {
  const store = new ReferenceStore(), pkg = makePackage(), row = installed(store, pkg), foreign = store.session(principal('synthetic-owner-b'));
  assert.deepEqual(foreign.list(), []);
  for (const id of [pkg.appId, 'app_' + '0'.repeat(32)]) {
    for (const call of [() => foreign.get(id), () => foreign.version(id, 1), () => foreign.history(id), () => foreign.preview(id, row.preview.id), () => foreign.approveInstall(id, row.approval.id), () => new Crm(store, principal('synthetic-owner-b')).query(id, 1, row.digest, 'listLeads', {})]) assert.throws(call, { message: 'APP_UNAVAILABLE' });
  }
  store.close();
});
test('UI and agent use one durable state; replay is exactly once and conflicting writes fail', () => {
  const directory = mkdtempSync(join(tmpdir(), 'myapps-test-')), path = join(directory, 'reference.sqlite');
  let store = new ReferenceStore(path, () => '2026-10-08T12:00:00.000Z');
  const pkg = makePackage(), row = installed(store, pkg), ui = new Crm(store, principal()), agent = new Crm(store, principal(OWNER, 'agent'));
  const created = ui.action(pkg.appId, 1, row.digest, 'createLead', leadInput, 'create-1');
  assert.deepEqual(ui.action(pkg.appId, 1, row.digest, 'createLead', leadInput, 'create-1'), created);
  assert.throws(() => ui.action(pkg.appId, 1, row.digest, 'createLead', { ...leadInput, name: 'changed' }, 'create-1'), /IDEMPOTENCY/);
  let current = agent.action(pkg.appId, 1, row.digest, 'updateStage', { leadId: created.id, expectedRevision: 1, stage: 'Proposal' }, 'stage-1');
  assert.equal(ui.query(pkg.appId, 1, row.digest, 'getLead', { leadId: created.id }).stage, 'Proposal');
  assert.throws(() => ui.action(pkg.appId, 1, row.digest, 'updateStage', { leadId: created.id, expectedRevision: 1, stage: 'Won' }, 'stale'), /REVISION/);
  for (const [operation, field] of [['addNote', { note: 'Synthetic note' }], ['recordSpend', { amountCents: 12345 }], ['scheduleFollowup', { date: '2026-10-08' }]]) current = ui.action(pkg.appId, 1, row.digest, operation, { leadId: created.id, expectedRevision: current.revision, ...field }, operation);
  const metrics = agent.query(pkg.appId, 1, row.digest, 'getMetrics', { asOf: '2026-10-08', periodStart: '2026-10-01' });
  assert.deepEqual(metrics, { openLeads: 1, openPipelineCents: 500000, followupsDue: 1, winRateBasisPoints: 0, closedThisPeriod: 0, acquisitionSpendCents: 12345 });
  store.close(); store = new ReferenceStore(path);
  assert.equal(new Crm(store, principal()).query(pkg.appId, 1, row.digest, 'getLead', { leadId: created.id }).notes.length, 1);
  assert.equal(store.session(principal()).history(pkg.appId).filter(e => e.action === 'createLead').length, 1);
  assert.ok(!JSON.stringify(store.session(principal()).history(pkg.appId)).includes('Synthetic note'));
  store.close(); rmSync(directory, { recursive: true });
});
test('revocation, disable, kill controls, stale versions and prohibited effects fail closed', () => {
  const store = new ReferenceStore(), pkg = makePackage(), row = installed(store), ui = new Crm(store, principal()), session = store.session(principal());
  assert.throws(() => ui.action(pkg.appId, 1, row.digest, 'sendEmail', {}, 'email'), /APP_UNAVAILABLE/);
  assert.throws(() => new Crm(store, { ...principal(), allowedOperations: [] }).query(pkg.appId, 1, row.digest, 'listLeads', {}), /APP_UNAVAILABLE/);
  assert.throws(() => ui.query(pkg.appId, 2, row.digest, 'listLeads', {}), /APP_UNAVAILABLE/);
  store.controls(true, false); assert.throws(() => ui.action(pkg.appId, 1, row.digest, 'createLead', leadInput, '1'), /APP_UNAVAILABLE/);
  store.controls(false, false); assert.throws(() => ui.query(pkg.appId, 1, row.digest, 'listLeads', {}), /APP_UNAVAILABLE/);
  store.controls(true, true); session.setEnabled(pkg.appId, false, 1);
  assert.throws(() => ui.query(pkg.appId, 1, row.digest, 'listLeads', {}), /APP_UNAVAILABLE/);
  session.setEnabled(pkg.appId, true, 2); store.revoke(OWNER, pkg.appId, 1);
  assert.throws(() => session.setEnabled(pkg.appId, true, 4), /APP_UNAVAILABLE/);
  assert.equal(session.version(pkg.appId, 1).state, 'REVOKED'); store.close();
});
test('successor install is explicit, preserves data and historical identity, and fences stale approvals', () => {
  const store = new ReferenceStore(), one = makePackage(), row = installed(store), session = store.session(principal());
  const lead = new Crm(store, principal()).action(one.appId, 1, row.digest, 'createLead', leadInput, '1');
  const two = makePackage(OWNER, 2, { version: 1, digest: row.digest }); verified(store, two);
  const preview = store.createPreview(OWNER, one.appId, 2), pending = session.requestInstall(one.appId, preview.id);
  assert.equal(session.get(one.appId).installedVersion, 1);
  session.setEnabled(one.appId, false, 1);
  assert.throws(() => session.approveInstall(one.appId, pending.id), /STALE/);
  const next = session.requestInstall(one.appId, preview.id); session.approveInstall(one.appId, next.id);
  assert.deepEqual(session.version(one.appId, 1).package, one);
  assert.equal(new Crm(store, principal()).query(one.appId, 2, digest(two), 'getLead', { leadId: lead.id }).company, 'Acme'); store.close();
});
