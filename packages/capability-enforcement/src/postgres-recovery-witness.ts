import pg from 'pg';
import type { RecoveryHead } from './recovery-witness.ts';

export type PostgresRecoveryWitness = {
  kind: 'postgres'; databaseUrl: string; epoch: string; enrollmentId: string; qualificationDigest: string; installationDigest: string;
};
const pools = new Map<string, pg.Pool>();
function witnessPool(witness: PostgresRecoveryWitness) {
  let pool = pools.get(witness.databaseUrl);
  if (!pool) {
    if (pools.size >= 4) throw Error('CAPABILITY_RECOVERY_CONFIGURATION');
    pool = new pg.Pool({ connectionString: witness.databaseUrl, max: 2, connectionTimeoutMillis: 5000,
      statement_timeout: 5000, query_timeout: 6000, idle_in_transaction_session_timeout: 5000 });
    pool.on('error', () => { /* A subsequent uncached read fails closed; never log credentials. */ });
    pools.set(witness.databaseUrl, pool);
  }
  return pool;
}
function scopeParameters(witness: PostgresRecoveryWitness, head: RecoveryHead) {
  return [witness.enrollmentId, head.organizationId, head.installationId, head.ownerId, witness.epoch, witness.qualificationDigest, witness.installationDigest];
}
export async function readPostgresRecoveryHead(witness: PostgresRecoveryWitness, expected: RecoveryHead): Promise<unknown> {
  const { rows } = await witnessPool(witness).query('SELECT capability_witness.read_head($1,$2,$3,$4,$5,$6,$7) AS head', scopeParameters(witness, expected));
  return rows[0]?.head;
}
/** One independently committed CAS, before the application commits. No compensation/reset is permitted. */
export async function advancePostgresRecoveryHead(witness: PostgresRecoveryWitness, previous: RecoveryHead, next: RecoveryHead) {
  const connection = await witnessPool(witness).connect();
  try {
    await connection.query('BEGIN');
    await connection.query('SET LOCAL synchronous_commit = on');
    const { rows } = await connection.query('SELECT capability_witness.advance_head($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS head',
      [...scopeParameters(witness, previous), previous.revision, previous.digest, next.revision, next.digest]);
    await connection.query('COMMIT');
    return rows[0]?.head;
  } finally {
    // Discard on both success and ambiguity; a timed-out COMMIT must never be reused.
    connection.release(true);
  }
}
export async function closeRecoveryWitnessDatabases() {
  const current = [...pools.values()]; pools.clear();
  await Promise.all(current.map(pool => pool.end()));
}
