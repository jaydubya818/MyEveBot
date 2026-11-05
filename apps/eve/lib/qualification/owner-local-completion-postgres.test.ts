import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Env, connection } from '../external-alpha/work-test-fixture.ts';
import { assertOwnerLocalCompletionStorage, completeDeliveredStageWorks, type ConfirmationContext } from './owner-local-authorizations.ts';

describe.skipIf(!connection)('owner-local completion under a restricted canonical Work role (real PostgreSQL)', () => {
  let e: Env;
  const role = 'completion_fixture_' + randomUUID().replaceAll('-', '');
  const db = {
    query: async (sql: string, args?: unknown[]) => {
      const c = await e.pool.connect(); try { await c.query(`SET ROLE ${role}`); return (await c.query(sql, args)).rows; }
      finally { await c.query('RESET ROLE'); c.release(); }
    },
    atomic: async <T,>(fn: (db: any) => Promise<T>) => {
      const c = await e.pool.connect(); try {
        await c.query('BEGIN'); await c.query(`SET LOCAL ROLE ${role}`);
        const result = await fn({ query: async (sql: string, args?: unknown[]) => (await c.query(sql, args)).rows });
        await c.query('COMMIT'); return result;
      } catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
    },
  };
  beforeAll(async () => {
    e = await Env.create(false, {}, false);
    await e.pool.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    await e.pool.query(`GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role};
      GRANT UPDATE ON engineering_work,business_partnership TO ${role}; GRANT INSERT ON engineering_work_events TO ${role};
      GRANT EXECUTE ON FUNCTION business_assert_effect(text,uuid,integer,integer,text,jsonb) TO ${role}`);
  }, 120000);
  afterAll(async () => { if (e) { await e.close(); await e.admin?.query?.(`DROP ROLE IF EXISTS ${role}`).catch(() => {}); } }, 60000);
  const fresh = async () => {
    const works = await Promise.all([1, 2, 3].map(() => e.seedWork()));
    const ctx: ConfirmationContext = { profile: 'myeve.private-beta.owner/v1', ownerId: e.owner, confirmationDigest: randomUUID().replaceAll('-', '').repeat(2),
      planSha256: 'c'.repeat(64), repository: 'local/dashboard', workIds: works.map(w => w.id), audit: () => undefined };
    return { db, ctx, works: works.map(w => ({ id: w.id, version: w.version, generation: w.generation })),
      delivery: { verdictSha256: 'a'.repeat(64), deliverySha256: 'b'.repeat(64), assurance: 'PRIVATE_BETA_LOCAL' }, reconcile: async () => undefined };
  };
  it('uses only existing Work event privileges and requires both SELECT and INSERT before confirmation', async () => {
    await assertOwnerLocalCompletionStorage(db);
    await e.pool.query(`REVOKE INSERT ON engineering_work_events FROM ${role}`);
    await expect(assertOwnerLocalCompletionStorage(db)).rejects.toThrow('EVENTS_UNQUALIFIED');
    await e.pool.query(`GRANT INSERT ON engineering_work_events TO ${role}`);
    expect((await e.pool.query("SELECT to_regclass('qjourney_event') AS journal")).rows[0].journal).toBeNull();

  });
  it('atomically completes three Works, records provenance and repairs an audit failure without repeating transitions', async () => {
    const c = await fresh(); c.ctx.audit = () => { throw Error('secondary audit unavailable'); };
    expect(await completeDeliveredStageWorks(c)).toEqual({ completed: true, auditPending: true });
    c.ctx.audit = () => undefined; expect(await completeDeliveredStageWorks(c)).toEqual({ completed: true, auditPending: false });
    const { rows } = await e.pool.query('SELECT lifecycle,version,generation FROM engineering_work WHERE id=ANY($1::uuid[])', [c.ctx.workIds]);
    expect(rows).toHaveLength(3);expect(rows.every((w: any) => w.lifecycle === 'accepted' && w.version === 2 && w.generation === 2)).toBe(true);
    expect((await e.pool.query('SELECT count(*)::int AS n FROM engineering_work_events WHERE work_id=ANY($1::uuid[]) AND kind LIKE $2', [c.ctx.workIds,'owner_local_delivery_accepted:%'])).rows[0].n).toBe(3);
  });
  it.each(['PREPARED', 'UNKNOWN'])('refuses %s consequential effects and rolls back all three Works', async status => {
    const c = await fresh(); await e.pool.query(`INSERT INTO engineering_execution(scope_id,scope_kind,work_id,revision,state) VALUES($1,'personal',$2,1,$3::jsonb)`,
      [e.owner, c.works[2].id, JSON.stringify({ effects: [{ status }] })]);
    await expect(completeDeliveredStageWorks(c)).rejects.toThrow('COMPLETION_STALE');
    expect((await e.pool.query('SELECT lifecycle FROM engineering_work WHERE id=ANY($1::uuid[])', [c.ctx.workIds])).rows.every((w: any) => w.lifecycle === 'active')).toBe(true);
  });
  it('refuses a newly shared Work without its exact current business decision', async () => {
    const c = await fresh();await e.pool.query(`INSERT INTO business_partnership(owner_a,owner_b,accepted_a,accepted_b) VALUES($1,$2,true,true) ON CONFLICT(id) DO NOTHING`, [e.owner, randomUUID()]);
    await e.pool.query(`INSERT INTO business_resource_grants(id,owner_id,kind,resource_id,revision_hash,scope,partnership_revision) VALUES($1,$2,'WORK',$3,$4,'BUSINESS_SHARED',1)`, [randomUUID(),e.owner,c.works[2].id,'d'.repeat(64)]);
    await expect(completeDeliveredStageWorks(c)).rejects.toThrow('shared_decision_required');
    expect((await e.pool.query('SELECT lifecycle FROM engineering_work WHERE id=ANY($1::uuid[])', [c.ctx.workIds])).rows.every((w: any) => w.lifecycle === 'active')).toBe(true);
  });
});
