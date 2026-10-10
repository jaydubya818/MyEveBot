import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { reconcileBackendControls } from '../../../packages/capability-enforcement/src/lifecycle-transport.ts';
import { verifyPolicyMessage } from '../../../packages/capability-enforcement/src/ordering-wire.ts';
import { randomUUID } from 'node:crypto';
import { CapabilityStore } from '../lib/capability-control/store.ts';
import { signLifecycleReceipt } from '../../../packages/capability-enforcement/src/lifecycle-wire.ts';

export async function qualifyLifecycle({ admin, runtime, check }) {
  await admin.query('GRANT INSERT ON capability_control.lifecycle_receipts TO capability_runtime');
  const ownerId = 'lifecycle-owner';
  const store = new CapabilityStore(runtime, { id: 'qualification-1', environment: 'qualification' }, { ownerId, source: 'settings' });
  const keys = [];
  for (const backendId of ['lifecycle-a', 'lifecycle-b']) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    keys.push({ keyId: backendId, jwk: await crypto.subtle.exportKey('jwk', pair.privateKey) });
    await admin.query('INSERT INTO capability_control.policy_destinations VALUES($1,$2,$3,$4,1,$5,$6)',
      ['qualification-1', ownerId, backendId, 'lifecycle-epoch', backendId, await crypto.subtle.exportKey('jwk', pair.publicKey)]);
  }
  const command = async operation => store.command({ requestId: randomUUID(), expectedRevision: (await store.inspect()).revision, capabilityId: 'missioncontrol', operation });
  await command('revoke');
  const [change] = (await admin.query('SELECT * FROM capability_control.policy_changes WHERE owner_id=$1', [ownerId])).rows;
  const receipt = (backend, sequence, state, inventoryComplete = true) => ({
    schema: 'capability-control.lifecycle.v1', kind: 'CONTROL_ACK', authority: 'myeve', ownerId,
    organizationId: 'organization-1', installationId: 'qualification-1', backendId: keys[backend].keyId,
    incarnation: 'lifecycle-epoch', enrollmentVersion: 1, version: change.revision, policyId: change.policy_id,
    capabilityId: 'missioncontrol', operation: 'revoke', sequence, state, observedAt: Date.now(),
    evidenceDigest: 'a'.repeat(64), inventoryDigest: 'b'.repeat(64), inventoryComplete,
  });
  const acknowledge = async (backend, value) => store.acknowledgeControl(keys[backend].keyId, await signLifecycleReceipt(value, keys[backend]));
  await check('signed lifecycle evidence never treats fence or stop request as completed cleanup', async () => {
    await acknowledge(0, receipt(0, 1, 'AUTHORITY_FENCED', false));
    assert.equal((await store.inspect()).backendControls[0].complete, false);
    await assert.rejects(command('enable'), /reconciled/);
    await acknowledge(0, receipt(0, 2, 'STOP_UNKNOWN', false));
    await assert.rejects(command('enable'), /reconciled/);
    await acknowledge(0, receipt(0, 3, 'STOP_CONFIRMED'));
    await assert.rejects(command('enable'), /reconciled/);
    await assert.rejects(acknowledge(0, receipt(0, 4, 'CLEANUP_CONFIRMED', false)), /LIFECYCLE_INVALID/);
  });
  await check('lifecycle rejects foreign owner installation policy enrollment and forged signatures', async () => {
    for (const changed of [{ ownerId: 'foreign' }, { installationId: 'foreign' }, { policyId: 'foreign' }, { incarnation: 'old' }, { enrollmentVersion: 2 }, { capabilityId: 'myfactory' }])
      await assert.rejects(acknowledge(0, { ...receipt(0, 4, 'CLEANUP_CONFIRMED'), ...changed }));
    await assert.rejects(store.acknowledgeControl(keys[0].keyId, await signLifecycleReceipt(receipt(0, 4, 'CLEANUP_CONFIRMED'), keys[1])));
    assert.equal((await store.inspect()).backendControls[0].complete, false);
  });
  await check('lifecycle retry is idempotent and sequence conflicts cannot overwrite history', async () => {
    const value = receipt(0, 4, 'CLEANUP_CONFIRMED');
    await Promise.all([acknowledge(0, value), acknowledge(0, value)]);
    await assert.rejects(acknowledge(0, { ...value, state: 'STOP_UNKNOWN' }), /CONFLICT/);
    await assert.rejects(acknowledge(0, receipt(0, 3, 'CLEANUP_CONFIRMED')), /STALE/);
    assert.equal((await admin.query('SELECT count(*)::int AS count FROM capability_control.lifecycle_receipts WHERE owner_id=$1 AND sequence=4', [ownerId])).rows[0].count, 1);
    await assert.rejects(command('enable'), /reconciled/);
  });
  await check('all frozen backends must confirm cleanup before explicit owner re-enable; old control remains auditable', async () => {
    await acknowledge(1, receipt(1, 1, 'CLEANUP_CONFIRMED'));
    assert.equal((await store.inspect()).backendControls[0].complete, true);
    assert.equal((await store.inspect()).capabilities.find(item => item.id === 'missioncontrol').preference, 'DISABLED');
    await command('enable');
    const view = await store.inspect();
    assert.equal(view.capabilities.find(item => item.id === 'missioncontrol').control, null);
    assert.equal(view.backendControls[0].operation, 'revoke');
    assert.equal(view.activeWork.status, 'UNKNOWN');
    assert.equal(view.audit.filter(item => item.operation === 'revoke').length, 1);
    assert.equal(view.audit.find(item => item.operation === 'enable').previous.control, 'REVOKE_REQUESTED');
  });
  await check('HTTP cleanup retry reaches older unresolved control beyond 100 later changes and lost delivery', async () => {
    const scope = { ownerId, organizationId: 'organization-1', installationId: 'qualification-1', environment: 'qualification', agentId: 'policy-propagation' };
    const pending = { requestId: randomUUID(), expectedRevision: (await store.inspect()).revision, capabilityId: 'missioncontrol', operation: 'revoke' };
    await store.command(pending); // Deliberately no original policy delivery.
    for (let i = 0; i < 105; i++) await store.command({ requestId: randomUUID(), expectedRevision: (await store.inspect()).revision, capabilityId: 'myfactory', operation: 'revoke' });
    let unavailable = true, stopped = false, received = [];
    const server = createServer(async (request, response) => {
      try {
        let body = ''; for await (const chunk of request) body += chunk;
        const fence = await verifyPolicyMessage(JSON.parse(body).envelope, keys[0]);
        received.push(fence.capabilityId);
        if (unavailable) { response.writeHead(503); response.end(); return; }
        const key = keys.find(item => item.keyId === fence.backendId);
        const { kind, controls, ...identity } = fence;
        const envelope = await signLifecycleReceipt({ ...identity, schema: 'capability-control.lifecycle.v1', kind: 'CONTROL_ACK',
          sequence: stopped ? 2 : 1, observedAt: Date.now(), state: stopped ? 'CLEANUP_CONFIRMED' : 'STOP_UNKNOWN',
          inventoryComplete: stopped, evidenceDigest: 'c'.repeat(64), inventoryDigest: 'd'.repeat(64) }, key);
        response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(envelope));
      } catch { response.writeHead(400); response.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const endpoints = Object.fromEntries(keys.map(key => [key.keyId, `http://127.0.0.1:${server.address().port}/lifecycle`]));
      const retrying = new CapabilityStore(runtime, store.installation, store.actor,
        () => reconcileBackendControls(runtime, scope, endpoints, keys[0]));
      await retrying.command(pending);
      assert.equal((await store.inspect()).backendControls.find(item => item.capabilityId === 'missioncontrol').complete, false);
      unavailable = false;
      await retrying.command(pending);
      assert.equal((await store.inspect()).backendControls.find(item => item.capabilityId === 'missioncontrol').backends[0].state, 'STOP_UNKNOWN');
      stopped = true;
      await retrying.command(pending);
      const view = await store.inspect();
      assert.ok(view.backendControls.every(item => item.complete));
      assert.equal(view.capabilities.find(item => item.id === 'missioncontrol').preference, 'DISABLED');
      assert.equal(received.filter(id => id === 'missioncontrol').length, 6);
      assert.equal(received.length, 12); // Latest control per capability, never a newest-100 starvation window.
      assert.equal((await admin.query('SELECT count(*)::int AS n FROM capability_control.audit WHERE owner_id=$1 AND request_id=$2', [ownerId, pending.requestId])).rows[0].n, 1);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });

}
