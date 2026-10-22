import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { capabilityRegistry } from '@mission-control/capability-control';

// Query plus transactional adapter over a pg pool; capability admission requires `atomic`.
export function atomicDatabase(pool) {
  return {
    query: async (sql, values) => (await pool.query(sql, values)).rows,
    atomic: async action => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await action({ query: async (sql, values) => (await client.query(sql, values)).rows });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
  };
}

export function engineeringTestAdminUrl(defaultPort) {
  const url = new URL(process.env.ENGINEERING_TEST_ADMIN_URL ?? `postgresql://postgres@127.0.0.1:${defaultPort}/postgres`);
  assert.equal(url.protocol, 'postgresql:');
  assert.equal(url.hostname, '127.0.0.1', 'Disposable loopback database only');
  assert(Number(url.port) > 0 && Number(url.port) <= 65535, 'An explicit local test port is required');
  assert.equal(url.pathname, '/postgres');
  return url;
}

// Provision only inside the empty database created by the integration script.
// Synthetic qualification facts are local fixtures, never deployment qualification.
export async function capabilityWorkFixture(admin, databaseUrl, { ownerId, agentId, capabilityIds, selectedAlternatives = {}, nativeProgressEvents = false }) {
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.match(url.pathname, /^\/(direct_work|direct_verifier|route_admission|gap2b|admission_context)_[a-f0-9]+$/);
  const suffix = randomUUID().replaceAll('-', '');
  const role = `work_runtime_${suffix}`;
  const installationId = `synthetic-install-${suffix}`, organizationId = `synthetic-org-${suffix}`;
  for (const name of ['migration', 'enforcement', 'decisions', 'ordering', 'lifecycle']) {
    await admin.query(await readFile(new URL(`../../../../docs/capability-control/${name}.sql`, import.meta.url), 'utf8'));
  }
  const required = new Set();
  function include(id) {
    const descriptor = capabilityRegistry.capabilities.find(item => item.id === id);
    assert(descriptor, `Unknown fixture capability: ${id}`);
    if (required.has(id)) return;
    required.add(id);
    descriptor.dependencies.forEach(include);
    if (descriptor.alternativeDependencies.length) {
      const selected = selectedAlternatives[id];
      assert(descriptor.alternativeDependencies.includes(selected), `Select a fixture harness for ${id}`);
      include(selected);
    }
  }
  include('work');
  capabilityIds.forEach(include);
  const facts = Object.fromEntries(capabilityRegistry.capabilities.filter(item => required.has(item.id)).map(item => [item.id, {
    supported: true, deployed: true, entitled: true, administrator: 'ALLOW', lifecycle: 'ACTIVE',
    ...(selectedAlternatives[item.id] ? { selectedAlternative: selectedAlternatives[item.id] } : {}),
    setup: Object.fromEntries(item.setupRequirements.map(key => [key, true])),
    qualification: Object.fromEntries(item.qualificationRequirements.map(key => [key, 'QUALIFIED'])),
  }]));
  await admin.query("INSERT INTO capability_control.installations VALUES($1,$2,'qualification',true)", [installationId, organizationId]);
  await admin.query('INSERT INTO capability_control.owner_state(installation_id,owner_id,preferences) VALUES($1,$2,$3)',
    [installationId, ownerId, Object.fromEntries([...required].map(id => [id, 'ENABLED']))]);
  await admin.query(`INSERT INTO capability_control.evidence VALUES($1,$2,$3,$4,$5,
    clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','synthetic-work-policy')`,
    [installationId, organizationId, ownerId, capabilityRegistry.version, facts]);
  await admin.query(`INSERT INTO capability_control.relay_agent_evidence VALUES($1,$2,$3,$4,1,$5,'ACTIVE',
    clock_timestamp()+interval '1 hour','synthetic-work-agent')`,
    [installationId, ownerId, organizationId, agentId, JSON.stringify([...required])]);
  await admin.query(`INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary)
    VALUES($1,$2,'Synthetic','synthetic','Owner assistant','Disposable integration fixture',true)`, [agentId, ownerId]);
  await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  await admin.query(`GRANT USAGE ON SCHEMA public,capability_control TO ${role}`);
  await admin.query(`GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO ${role}`);
  await admin.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  await admin.query(`GRANT EXECUTE ON FUNCTION business_assert_effect(text,uuid,integer,integer,text,jsonb),business_lock_authority() TO ${role}`);
  await admin.query(`GRANT SELECT ON ALL TABLES IN SCHEMA capability_control TO ${role}`);
  await admin.query(`GRANT EXECUTE ON FUNCTION capability_control.lock_admission_policy(text,text,text) TO ${role}`);
  assert.equal(typeof nativeProgressEvents, 'boolean');
  if (nativeProgressEvents) {
    // This role may append/read only this owner's native progress. The existing
    // event RLS stays enabled; no UPDATE/DELETE policy or broader role is granted.
    const { rows: [{ literal }] } = await admin.query('SELECT quote_literal($1::text) AS literal', [ownerId]);
    const scope = `owner_id=${literal} AND source_type='native-engineering'`;
    await admin.query(`CREATE POLICY ${role}_native_read ON public.eve_events FOR SELECT TO ${role} USING (${scope})`);
    await admin.query(`CREATE POLICY ${role}_native_insert ON public.eve_events FOR INSERT TO ${role} WITH CHECK (${scope})`);
  }
  url.username = role; url.password = '';
  const runtime = new pg.Pool({ connectionString: url.href, max: 6 });
  const settings = {
    MYEVE_CAPABILITY_CONTROL_ENABLED: 'true', MYEVE_CAPABILITY_INSTALLATION_ID: installationId,
    MYEVE_CAPABILITY_ENVIRONMENT: 'qualification', MYEVE_CAPABILITY_DATABASE_URL: url.href,
    MYEVE_CAPABILITY_ORIGIN: 'http://127.0.0.1',
  };
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  const database = atomicDatabase(runtime);
  // Check that the adapter actually uses restricted policy reads and cannot author policy.
  assert.equal((await database.query('SELECT * FROM capability_control.owner_state')).length, 0);
  await assert.rejects(database.query('DELETE FROM capability_control.evidence'), /permission denied/);
  if (nativeProgressEvents) await assert.rejects(database.query(`INSERT INTO eve_events(id,owner_id,type,source_type,summary)
    VALUES($1,$2,'NATIVE_OPERATION','native-engineering','Synthetic foreign-owner denial')`,
    [`synthetic-denial-${suffix}`, `${ownerId}-foreign`]), /row-level security/);
  // `url` is the restricted runtime URL for forked fixture children (process.env carries the capability settings).
  return { database, installationId, url: url.href, cleanup: async () => {
    await runtime.end();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (nativeProgressEvents) {
      await admin.query(`DROP POLICY ${role}_native_read ON public.eve_events`);
      await admin.query(`DROP POLICY ${role}_native_insert ON public.eve_events`);
    }
    await admin.query(`DROP OWNED BY ${role}`);
    await admin.query(`DROP ROLE ${role}`);
  } };
}
