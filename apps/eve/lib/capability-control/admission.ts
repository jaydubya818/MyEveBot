import pg from 'pg';
import { CapabilityAdmissionError, withCapabilityAdmission } from '@myeve/capability-enforcement';
import type { WorkDatabase, WorkStore } from '../engineering/store.ts';
import { WorkError, type Work } from '../engineering/types.ts';
import { capabilityConfiguration } from './runtime.ts';

let pool: pg.Pool | undefined;

/** Qualification requires canonical policy and Work in the same database, never a copied cache. */
export function capabilityWorkDatabase(): WorkDatabase {
  const config = capabilityConfiguration();
  if (config.databaseUrl !== process.env.DATABASE_URL)
    throw new WorkError('capability_database_binding', 'Work and canonical capability policy require one qualified database.', 503);
  if (!pool) {
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 4,
      connectionTimeoutMillis: 5000, statement_timeout: 5000, idle_in_transaction_session_timeout: 5000 });
    pool.on('error', () => console.error('Capability Work database idle connection failed.'));
  }
  const current = pool;
  return {
    query: async (sql, values) => (await current.query(sql, values)).rows,
    atomic: async action => {
      const client = await current.connect();
      try {
        await client.query('BEGIN');
        const result = await action({ query: async (sql, values) => (await client.query(sql, values)).rows });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
    },
  };
}

export async function closeCapabilityWorkDatabase() {
  const current = pool; pool = undefined;
  await current?.end();
}

export async function admitCapabilityWork<T>(store: WorkStore, work: Work,
  capabilityId: string, agentId: string, budgetUsd: number,
  admit: (database: WorkDatabase, evidence: Record<string, unknown>) => Promise<T>): Promise<T> {
  const config = capabilityConfiguration();
  const principal = store.principal;
  if (principal.scopeKind !== 'personal' || principal.actorId !== principal.scopeId || work.scopeId !== principal.scopeId)
    throw new WorkError('capability_owner_scope', 'Current owner authority is required.', 403);
  if (!store.database.atomic)
    throw new WorkError('capability_transaction_required', 'Transactional capability admission is not configured.', 503);
  return store.database.atomic(async database => {
    const [installation] = await database.query('SELECT organization_id FROM capability_control.installations WHERE id=$1', [config.id]);
    if (!installation) throw new WorkError('capability_installation_missing', 'Capability installation is unavailable.', 503);
    const connection = { query: async (sql: string, values?: unknown[]) => ({ rows: await database.query(sql, values) }) };
    return withCapabilityAdmission(connection, {
      ownerId: principal.scopeId, installationId: config.id, environment: config.environment,
      organizationId: installation.organization_id, agentId,
    }, { capabilityId, workId: work.id, workGeneration: work.generation, budgetMicros: Math.ceil(budgetUsd * 1_000_000) }, async evidence => {
      const agents = await database.query("SELECT id FROM agents WHERE owner_id=$1 AND id=$2 AND status='active' AND is_primary=true FOR SHARE", [principal.scopeId, agentId]);
      if (agents.length !== 1) throw new WorkError('capability_agent_scope', 'The current primary agent is required.', 403);
      return admit(database, evidence);
    });
  }).catch(error => {
    if (error instanceof CapabilityAdmissionError)
      throw new WorkError('capability_admission_denied', error.message, 403);
    throw error;
  });
}
