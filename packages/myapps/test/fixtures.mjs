import { ACTIONS, QUERIES, appId, digest, leadCrmSpec } from '../src/contracts.ts';
export const OWNER = 'synthetic-owner-a';
export const principal = (ownerId = OWNER, kind = 'human') => ({ ownerId, actorId: kind === 'human' ? 'fixture-owner' : 'fixture-sofie', kind, allowedOperations: ['apps.read', 'apps.manage', ...(kind === 'human' ? ['apps.install'] : []), ...QUERIES.map(x => x.name), ...ACTIONS.map(x => x.name)] });
export const makePackage = (owner = OWNER, version = 1, base = null, intent = 'crm-request-1') => ({
  format: 'myeve.app-package.reference.v1', appId: appId(owner, intent), version, spec: leadCrmSpec(owner, version > 1),
  work: { ownerId: owner, workId: 'synthetic-work-' + version, workVersion: 1, workGeneration: 1 },
  source: { repositoryCommit: '1'.repeat(40), template: 'lead-crm.v1', candidateId: 'synthetic-candidate-' + version },
  factoryVersion: { sourceCommit: '2'.repeat(40), configurationDigest: digest({ provider: 'deterministic-fixture' }) },
  base, migration: { kind: 'identity', fromSchema: 1, toSchema: 1 },
});
export function verified(store, pkg = makePackage(), intent = 'crm-request-1') {
  const row = store.register(intent, pkg);
  store.recordVerification(pkg.spec.ownerId, pkg.appId, pkg.version, { format: 'myapps.verification.reference.v1', appDigest: row.digest, candidateId: pkg.source.candidateId, verifier: 'synthetic-independent-verifier', status: 'PASS', cleanupConfirmed: true, claims: ['fixture-only'] });
  return row;
}
export function installed(store, pkg = makePackage(), intent = 'crm-request-1') {
  const row = verified(store, pkg, intent);
  const preview = store.createPreview(pkg.spec.ownerId, pkg.appId, pkg.version);
  const session = store.session(principal(pkg.spec.ownerId));
  const approval = session.requestInstall(pkg.appId, preview.id);
  session.approveInstall(pkg.appId, approval.id);
  return { ...row, preview, approval };
}
export const leadInput = { name: 'Acme contact', company: 'Acme', contact: 'alex@example.invalid', source: 'Conference', valueCents: 500000 };
