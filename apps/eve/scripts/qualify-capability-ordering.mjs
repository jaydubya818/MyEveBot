import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { CapabilityStore } from '../lib/capability-control/store.ts';
import { capabilityRegistry } from '@mission-control/capability-control';
import { acknowledgePolicyFence, issueOrderedPermit, issueBackendOrderedPermit, pendingPolicyDeliveries } from '../../../packages/capability-enforcement/src/ordering-source.ts';
import { policyChallengeMaterial } from '../../../packages/capability-enforcement/src/decisions.ts';
import { signPolicyMessage, verifyPolicyMessage, policyMessageHash } from '../../../packages/capability-enforcement/src/ordering-wire.ts';

export async function qualifyOrdering({ admin, runtime, check }) {
  const keys = async keyId => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    return { private: { keyId, jwk: await crypto.subtle.exportKey('jwk', pair.privateKey) }, public: { keyId, jwk: await crypto.subtle.exportKey('jwk', pair.publicKey) } };
  };
  const source = await keys('source'), backend = await keys('backend'), challengeKey = generateKeyPairSync('ed25519');
  const scope = { ownerId: 'ordered-owner', organizationId: 'organization-1', installationId: 'qualification-1', environment: 'qualification', agentId: 'ordered-agent' };
  const actor = new CapabilityStore(runtime, { id: scope.installationId, environment: 'qualification' }, { ownerId: scope.ownerId, source: 'settings' });
  const binding = { scope, backendId: 'missioncontrol', keyId: 'challenge-key', publicKeyPem: challengeKey.publicKey.export({ type: 'spki', format: 'pem' }).toString() };
  await admin.query('GRANT INSERT,UPDATE ON capability_control.policy_changes,capability_control.policy_deliveries TO capability_runtime');
  await admin.query('INSERT INTO capability_control.owner_state(installation_id,owner_id,preferences) VALUES($1,$2,$3)',
    [scope.installationId, scope.ownerId, Object.fromEntries(capabilityRegistry.capabilities.map(item => [item.id, 'ENABLED']))]);
  await admin.query(`INSERT INTO capability_control.evidence SELECT installation_id,organization_id,$1,registry_version,facts,clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','ordered-test'
    FROM capability_control.evidence WHERE owner_id='synthetic-enforcement-owner'`, [scope.ownerId]);
  await admin.query("INSERT INTO capability_control.relay_agent_evidence VALUES($1,$2,$3,$4,1,$5,'ACTIVE',clock_timestamp()+interval '1 hour','ordered-test')",
    [scope.installationId, scope.ownerId, scope.organizationId, scope.agentId, JSON.stringify(capabilityRegistry.capabilities.map(item => item.id))]);
  await admin.query('INSERT INTO capability_control.policy_destinations VALUES($1,$2,$3,$4,1,$5,$6)',
    [scope.installationId, scope.ownerId, binding.backendId, 'isolated-incarnation-1', backend.public.keyId, backend.public.jwk]);
  async function tx(run) { const c = await runtime.connect(); try { await c.query('BEGIN'); const result = await run(c); await c.query('COMMIT'); return result; }
    catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); } }
  const command = async operation => actor.command({ requestId: randomUUID(), expectedRevision: (await actor.inspect()).revision, capabilityId: 'missioncontrol', operation });
  const challenge = () => ({ schema: 'myeve.policy-challenge.v1', requestId: randomUUID(), backendId: binding.backendId,
    installationId: scope.installationId, ownerId: scope.ownerId, organizationId: scope.organizationId, agentId: scope.agentId,
    keyId: binding.keyId, capabilityId: 'missioncontrol', workId: randomUUID(), missionId: 'mission-1', workGeneration: 1,
    budgetMicros: 0, actionDigest: 'a'.repeat(64), nonce: randomUUID(), issuedAt: Date.now(), expiresAt: Date.now() + 20_000,
    incarnation: 'isolated-incarnation-1', enrollmentVersion: 1 });
  const issue = value => tx(c => issueOrderedPermit(c, value, sign(null, Buffer.from(policyChallengeMaterial(value)), challengeKey.privateKey).toString('base64url'), binding, source.private));
  const acknowledge = async envelope => {
    const fence = await verifyPolicyMessage(envelope, source.public);
    const { kind, capabilityId, operation, controls, ...identity } = fence;
    const ack = await signPolicyMessage({ ...identity, kind: 'FENCE_ACK', fenceHash: await policyMessageHash(fence) }, backend.private);
    return tx(c => acknowledgePolicyFence(c, scope, binding.backendId, ack));
  };
  let firstDelivery, firstPermit;
  await check('ordered source stages a monotonic frozen change and prevents permits before exact acknowledgment', async () => {
    assert.equal((await command('enable')).status, 'PENDING_PROPAGATION');
    assert.equal((await actor.inspect()).propagation.status, 'PENDING_PROPAGATION');
    await assert.rejects(issue(challenge()), /PROPAGATION_PENDING/);
    const deliveries = await tx(c => pendingPolicyDeliveries(c, scope, source.private));
    assert.equal(deliveries.length, 1); firstDelivery = deliveries[0].envelope;
    assert.deepEqual(await tx(c => pendingPolicyDeliveries(c, scope, source.private)), deliveries);
  });
  await check('ordered source rejects forged acknowledgments and preserves pending state across connection loss', async () => {
    const fence = await verifyPolicyMessage(firstDelivery, source.public), { kind, capabilityId, operation, controls, ...identity } = fence;
    for (const changed of [{ ownerId: 'foreign' }, { incarnation: 'replaced' }, { enrollmentVersion: 2 }, { fenceHash: 'b'.repeat(64) }]) {
      const ack = await signPolicyMessage({ ...identity, kind: 'FENCE_ACK', fenceHash: await policyMessageHash(fence), ...changed }, backend.private);
      await assert.rejects(tx(c => acknowledgePolicyFence(c, scope, binding.backendId, ack)));
    }
    assert.equal((await actor.inspect()).propagation.status, 'PENDING_PROPAGATION');
  });
  await check('exact duplicate acknowledgments complete once and signed permits deduplicate concurrent retries', async () => {
    const results = await Promise.all([acknowledge(firstDelivery), acknowledge(firstDelivery)]);
    assert.ok(results.every(result => result.status === 'ACKNOWLEDGED'));
    const value = challenge(), permits = await Promise.all([issue(value), issue(value)]);
    assert.deepEqual(permits[0], permits[1]); firstPermit = permits[0];
    const parsed = await verifyPolicyMessage(firstPermit, source.public);
    assert.equal(parsed.missionId, 'mission-1'); assert.equal(parsed.kind, 'PERMIT'); assert.equal(parsed.version, 2);
    await assert.rejects(issue({ ...value, workId: 'foreign-work' }), /REFERENCE_CONFLICT/);
  });
  await check('ordered challenges reject omitted or changed incarnation and enrollment before new issuance', async () => {
    for (const changed of [{ incarnation: undefined }, { incarnation: 'old-boot' }, { enrollmentVersion: 2 }])
      await assert.rejects(issue({ ...challenge(), ...changed }), /CHALLENGE_INCARNATION/);
  });
  await check('receiving-backend signed native challenges bind the exact current policy and incarnation', async () => {
    const { kind, requiredCapabilities, agentRevision, sourcePermitHash, ...scopeFields } = await verifyPolicyMessage(firstPermit, source.public);
    const value = { ...scopeFields, kind: 'CHALLENGE', referenceId: randomUUID(), issuedAt: Date.now(), expiresAt: Date.now() + 20_000 };
    const envelope = await signPolicyMessage(value, backend.private);
    const issued = await tx(c => issueBackendOrderedPermit(c, envelope, scope, binding.backendId, source.private));
    assert.equal((await verifyPolicyMessage(issued, source.public)).referenceId, value.referenceId);
    assert.deepEqual(await tx(c => issueBackendOrderedPermit(c, envelope, scope, binding.backendId, source.private)), issued);
    for (const changed of [{ incarnation: 'old-boot' }, { enrollmentVersion: 2 }, { policyId: 'old-policy' }, { ownerId: 'foreign-owner' }, { registryVersion: 'stale-registry' }]) {
      const invalid = await signPolicyMessage({ ...value, referenceId: randomUUID(), ...changed }, backend.private);
      await assert.rejects(tx(c => issueBackendOrderedPermit(c, invalid, scope, binding.backendId, source.private)));
    }
    const forged = await signPolicyMessage({ ...value, referenceId: randomUUID() }, source.private);
    await assert.rejects(tx(c => issueBackendOrderedPermit(c, forged, scope, binding.backendId, source.private)));
  });
  await check('disable fences the next version and old acknowledgments cannot complete it', async () => {
    await command('disable');
    await acknowledge(firstDelivery);
    assert.equal((await actor.inspect()).propagation.status, 'PENDING_PROPAGATION');
    await assert.rejects(issue(challenge()), /POLICY_BLOCKED/);
    const [delivery] = await tx(c => pendingPolicyDeliveries(c, scope, source.private));
    assert.equal((await verifyPolicyMessage(delivery.envelope, source.public)).version, 3);
    await acknowledge(delivery.envelope);
    assert.equal((await actor.inspect()).propagation.status, 'ACKNOWLEDGED');
    assert.equal((await verifyPolicyMessage(firstPermit, source.public)).version, 2);
  });
  await check('an unavailable receiver cannot prevent a newer disable intent', async () => {
    await command('enable');
    const [older] = await tx(c => pendingPolicyDeliveries(c, scope, source.private));
    await command('disable');
    assert.equal((await acknowledge(older.envelope)).status, 'SUPERSEDED');
    const view = await actor.inspect();
    assert.equal(view.propagation.status, 'PENDING_PROPAGATION');
    assert.equal(view.pendingCommand.operation, 'disable');
    const [current] = await tx(c => pendingPolicyDeliveries(c, scope, source.private));
    assert.ok(JSON.parse(current.envelope.message).version > JSON.parse(older.envelope.message).version);
    await acknowledge(current.envelope);
  });
  await check('superseded restrictive intent remains in the exact signed latest delivery', async () => {
    const receipt = await command('revoke');
    await actor.command({ requestId: randomUUID(), expectedRevision: (await actor.inspect()).revision, capabilityId: 'memory', operation: 'disable' });
    const [delivery] = await tx(c => pendingPolicyDeliveries(c, scope, source.private));
    const message = await verifyPolicyMessage(delivery.envelope, source.public);
    assert.equal(message.capabilityId, 'memory');
    assert(message.controls.some(control => control.capabilityId === 'missioncontrol' && control.operation === 'revoke' && control.version === receipt.revision));
    await acknowledge(delivery.envelope);
    assert.equal((await actor.inspect()).propagation.status, 'ACKNOWLEDGED');
  });
  await check('key replacement or enrollment changes cannot stand in for a required acknowledgment', async () => {
    await actor.command({ requestId: randomUUID(), expectedRevision: (await actor.inspect()).revision, capabilityId: 'files', operation: 'disable' });
    const [delivery] = await tx(c => pendingPolicyDeliveries(c, scope, source.private));
    await admin.query("UPDATE capability_control.policy_destinations SET incarnation='replacement' WHERE owner_id=$1", [scope.ownerId]);
    await assert.rejects(acknowledge(delivery.envelope), /ENROLLMENT_CHANGED/);
    await assert.rejects(issue(challenge()), /PROPAGATION_PENDING|CONTROL_PENDING|POLICY_BLOCKED/);
    assert.equal((await actor.inspect()).propagation.status, 'PENDING_PROPAGATION');
  });
}
