import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { capabilityRegistry } from '@mission-control/capability-control';
import { Env, connection } from '../external-alpha/work-test-fixture.ts';
import { hostedOwnerScope } from '../engineering/factory-mailbox.ts';

/**
 * Blocker 3, DB side (0113): the owner Factory writer guard / dispatch assertions pass the Work owner id to the capability fence. A hosted
 * installation keys its capability rows on hostedOwnerScope; the fence resolves to them. An installation with owner-keyed rows is unchanged.
 */
describe.skipIf(!connection)('PostgreSQL capability fence: hosted per-person capability scope', () => {
  let env: Env;
  const ids = capabilityRegistry.capabilities.map(item => item.id);
  async function seed(installation: string, owner: string) {
    const facts = Object.fromEntries(capabilityRegistry.capabilities.map(item => [item.id, { supported: true, deployed: true, entitled: true,
      administrator: 'ALLOW', setup: Object.fromEntries(item.setupRequirements.map(key => [key, true])),
      qualification: Object.fromEntries(item.qualificationRequirements.map(key => [key, 'QUALIFIED'])), lifecycle: 'ACTIVE' }]));
    await env.pool.query("INSERT INTO capability_control.installations VALUES($1,'fixture-organization','qualification',true) ON CONFLICT DO NOTHING", [installation]);
    await env.pool.query('INSERT INTO capability_control.owner_state(installation_id,owner_id,preferences) VALUES($1,$2,$3)',
      [installation, owner, Object.fromEntries(ids.map(id => [id, 'ENABLED']))]);
    await env.pool.query("INSERT INTO capability_control.evidence VALUES($1,'fixture-organization',$2,$3,$4,clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','fixture-evidence')",
      [installation, owner, capabilityRegistry.version, facts]);
    await env.pool.query("INSERT INTO capability_control.relay_agent_evidence VALUES($1,$2,'fixture-organization','fixture-agent',1,$3,'ACTIVE',clock_timestamp()+interval '1 hour','fixture-agent-record')",
      [installation, owner, JSON.stringify(ids)]);
    await env.pool.query("INSERT INTO capability_control.policy_destinations VALUES($1,$2,'fixture-factory','fixture-incarnation',1,'fixture-key','{}')", [installation, owner]);
    await env.pool.query("INSERT INTO capability_control.policy_changes(installation_id,owner_id,revision,policy_id,organization_id,capability_id,operation,destinations,status) VALUES($1,$2,1,'fixture-policy','fixture-organization','myfactory','enable','[]','ACKNOWLEDGED')",
      [installation, owner]);
  }
  const snapshot = async (owner: string, installation: string) => (await env.pool.query(
    "SELECT * FROM missioncontrol_capability_snapshot($1,$2,'fixture-agent','fixture-factory')", [owner, installation])).rows[0];
  beforeEach(async () => {
    env = await Env.create();
    for (const name of ['migration', 'enforcement', 'decisions', 'ordering', 'lifecycle'])
      await env.pool.query(await readFile(new URL('../../../../docs/capability-control/' + name + '.sql', import.meta.url), 'utf8'));
  }, 30000);
  afterEach(async () => { await env?.close(); });

  it('hosted: the Work owner resolves to the scope-keyed capability rows (same fence as the scope itself)', async () => {
    const installation = randomUUID(), scope = hostedOwnerScope({ installationId: installation, ownerId: env.owner });
    await seed(installation, scope);
    const viaOwner = await snapshot(env.owner, installation), viaScope = await snapshot(scope, installation);
    expect(viaOwner.snapshot_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(viaOwner).toEqual(viaScope);
    expect(viaOwner.backend_incarnation).toBe('fixture-incarnation');
  });
  it('owner-local: owner-keyed rows are used exactly as before; no rows refuses', async () => {
    const installation = randomUUID();
    await seed(installation, env.owner);
    expect((await snapshot(env.owner, installation)).snapshot_sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(snapshot(env.owner, randomUUID())).rejects.toThrow();
    await expect(snapshot(hostedOwnerScope({ installationId: installation, ownerId: env.owner }), installation)).rejects.toThrow('MISSIONCONTROL_CAPABILITY_CURRENTNESS_REQUIRED');
  });
});
