import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { readPostgresRecoveryHead, advancePostgresRecoveryHead, type PostgresRecoveryWitness } from './postgres-recovery-witness.ts';
export { closeRecoveryWitnessDatabases } from './postgres-recovery-witness.ts';
import type { PolicyConnection } from './postgres.ts';

export type RecoveryScope = { ownerId: string; organizationId: string; installationId: string };
export type RecoveryHead = RecoveryScope & { schema: 'capability-control.recovery-head.v1'; epoch: string; revision: number; digest: string };
type FilesystemRecoveryWitness = { directory: string; epoch: string };
export type RecoveryWitness = FilesystemRecoveryWitness | PostgresRecoveryWitness;
export const isPostgresRecoveryWitness = (witness: RecoveryWitness): witness is PostgresRecoveryWitness => 'kind' in witness && witness.kind === 'postgres';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value instanceof Date ? value.toISOString()
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])) : value;

function databaseIdentity(value: string) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1) || url.hash) throw Error('CAPABILITY_RECOVERY_CONFIGURATION');
  return JSON.stringify([url.hostname.toLowerCase(), url.port || '5432', decodeURIComponent(url.pathname)]);
}
export function configuredRecoveryWitness(env = process.env): RecoveryWitness | undefined {
  const directory = env.MYEVE_CAPABILITY_RECOVERY_WITNESS_DIRECTORY;
  const epoch = env.MYEVE_CAPABILITY_RECOVERY_EPOCH;
  const databaseUrl = env.MYEVE_CAPABILITY_RECOVERY_WITNESS_DATABASE_URL;
  const enrollmentId = env.MYEVE_CAPABILITY_RECOVERY_WITNESS_ENROLLMENT_ID;
  const qualificationDigest = env.MYEVE_CAPABILITY_RECOVERY_WITNESS_QUALIFICATION_DIGEST;
  const installationDigest = env.MYEVE_CAPABILITY_RECOVERY_WITNESS_INSTALLATION_DIGEST;
  if (!directory && !epoch && !databaseUrl && !enrollmentId && !qualificationDigest && !installationDigest) return undefined;
  if (!epoch?.trim() || epoch.length > 255) throw Error('CAPABILITY_RECOVERY_CONFIGURATION');
  if (databaseUrl || enrollmentId || qualificationDigest || installationDigest) {
    if (directory || !databaseUrl || !enrollmentId?.trim() || enrollmentId.length > 255
      || !installationDigest || !/^[a-f0-9]{64}$/.test(installationDigest)
      || !qualificationDigest || !/^[a-f0-9]{64}$/.test(qualificationDigest) || !env.MYEVE_CAPABILITY_DATABASE_URL)
      throw Error('CAPABILITY_RECOVERY_CONFIGURATION');
    try {
      if (databaseIdentity(databaseUrl) === databaseIdentity(env.MYEVE_CAPABILITY_DATABASE_URL)) throw Error('same database');
      const url = new URL(databaseUrl);
      if (!url.username || [...url.searchParams.keys()].some(key => key !== 'sslmode')) throw Error('Unexpected connection override');
      if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.searchParams.get('sslmode') !== 'verify-full') throw Error('TLS required');
    } catch { throw Error('CAPABILITY_RECOVERY_CONFIGURATION'); }
    return { kind: 'postgres', databaseUrl, epoch, enrollmentId, qualificationDigest, installationDigest };
  }
  if (!directory?.startsWith('/')) throw Error('CAPABILITY_RECOVERY_CONFIGURATION');
  return { directory, epoch };
}

/** Enrollment is privileged database evidence; deleting process configuration cannot unenroll an owner. */
export async function assertRecoveryEnrollment(connection: PolicyConnection, scope: RecoveryScope, witness: RecoveryWitness | undefined) {
  const [enrollment] = (await connection.query(`SELECT epoch FROM capability_control.recovery_enrollments
    WHERE installation_id=$1 AND owner_id=$2`, [scope.installationId, scope.ownerId])).rows;
  if (enrollment && (!witness || enrollment.epoch !== witness.epoch)) throw Error('CAPABILITY_RECOVERY_WITNESS_REQUIRED');
  if (witness && !enrollment) throw Error('CAPABILITY_RECOVERY_ENROLLMENT_REQUIRED');
}

export async function recoveryHead(connection: PolicyConnection, scope: RecoveryScope, witness: RecoveryWitness): Promise<RecoveryHead> {
  const [state] = (await connection.query(`SELECT revision,preferences,budgets,controls FROM capability_control.owner_state
    WHERE installation_id=$1 AND owner_id=$2`, [scope.installationId, scope.ownerId])).rows;
  if (!state) throw Error('CAPABILITY_RECOVERY_ENROLLMENT_REQUIRED');
  const [installation] = (await connection.query('SELECT * FROM capability_control.installations WHERE id=$1 AND active', [scope.installationId])).rows;
  if (installation?.organization_id !== scope.organizationId) throw Error('CAPABILITY_RECOVERY_SCOPE');
  // These are existing privileged authority inputs, not another registry. Their changes
  // require trusted requalification; request handlers cannot reset the external witness.
  const inputs: Record<string, unknown> = { state, installation };
  for (const table of ['platform_owner_bindings', 'evidence', 'relay_agent_evidence', 'policy_destinations', 'recovery_enrollments']) {
    const rows = (await connection.query(`SELECT * FROM capability_control.${table} WHERE installation_id=$1 AND owner_id=$2`,
      [scope.installationId, scope.ownerId])).rows;
    inputs[table] = rows.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return { schema: 'capability-control.recovery-head.v1', ...scope, epoch: witness.epoch,
    revision: Number(state.revision), digest: digest(canonical(inputs)) };
}

async function filename(witness: FilesystemRecoveryWitness, scope: RecoveryScope) {
  const directory = await lstat(witness.directory);
  if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o077)) throw Error('CAPABILITY_RECOVERY_CUSTODY');
  return join(witness.directory, digest([scope.organizationId, scope.installationId, scope.ownerId]) + '.json');
}
async function readHead(path: string): Promise<RecoveryHead> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 4096 || (stat.mode & 0o077)) throw Error('CAPABILITY_RECOVERY_CUSTODY');
    return parseRecoveryHead(JSON.parse(await file.readFile('utf8')));
  } finally { await file.close(); }
}
function parseRecoveryHead(value: unknown): RecoveryHead {
  const row = value as Record<string, unknown> | undefined;
  if (!row || row.schema !== 'capability-control.recovery-head.v1' || !Number.isSafeInteger(row.revision) || Number(row.revision) < 1
    || !/^[a-f0-9]{64}$/.test(String(row.digest)) || ['epoch', 'ownerId', 'organizationId', 'installationId'].some(key => typeof row[key] !== 'string' || !String(row[key]).length))
    throw Error('CAPABILITY_RECOVERY_CORRUPT');
  return row as RecoveryHead;
}
function matches(actual: RecoveryHead, expected: RecoveryHead) {
  return ['schema', 'epoch', 'ownerId', 'organizationId', 'installationId', 'revision', 'digest']
    .every(key => actual[key as keyof RecoveryHead] === expected[key as keyof RecoveryHead]);
}
export async function assertRecoveryHead(witness: RecoveryWitness, expected: RecoveryHead) {
  let actual: RecoveryHead;
  try { actual = isPostgresRecoveryWitness(witness)
    ? parseRecoveryHead(await readPostgresRecoveryHead(witness, expected))
    : await readHead(await filename(witness, expected)); }
  catch { throw Error('CAPABILITY_RECOVERY_WITNESS_UNAVAILABLE'); }
  if (!matches(actual, expected)) throw Error('CAPABILITY_RECOVERY_QUARANTINED');
}

/** Provision only from a separately authorized controller against a verified current installation. Never called by request handlers. */
export async function initializeRecoveryWitness(witness: RecoveryWitness, head: RecoveryHead) {
  if (isPostgresRecoveryWitness(witness)) throw Error('CAPABILITY_RECOVERY_PRIVILEGED_ENROLLMENT_REQUIRED');
  const path = await filename(witness, head);
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(head) + '\n'); await file.sync(); } finally { await file.close(); }
  const directory = await open(witness.directory, 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}

/** Advance before the database commit. A failed/ambiguous commit quarantines instead of rolling the witness back. */
export async function advanceRecoveryWitness(witness: RecoveryWitness, previous: RecoveryHead, next: RecoveryHead) {
  parseRecoveryHead(previous); parseRecoveryHead(next);
  if (previous.epoch !== witness.epoch) throw Error('CAPABILITY_RECOVERY_NON_MONOTONIC');
  if (matches(previous, next)) { await assertRecoveryHead(witness, previous); return; }
  if (next.revision <= previous.revision || ['epoch', 'ownerId', 'organizationId', 'installationId'].some(key => previous[key as keyof RecoveryHead] !== next[key as keyof RecoveryHead]))
    throw Error('CAPABILITY_RECOVERY_NON_MONOTONIC');
  if (isPostgresRecoveryWitness(witness)) {
    let actual: RecoveryHead;
    try { actual = parseRecoveryHead(await advancePostgresRecoveryHead(witness, previous, next)); }
    catch { throw Error('CAPABILITY_RECOVERY_QUARANTINED'); }
    if (!matches(actual, next)) throw Error('CAPABILITY_RECOVERY_QUARANTINED');
    return;
  }
  const path = await filename(witness, previous), lock = await open(path + '.lock', 'wx', 0o600);
  const temporary = path + '.' + randomUUID();
  try {
    await assertRecoveryHead(witness, previous);
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(next) + '\n'); await file.sync(); } finally { await file.close(); }
    await rename(temporary, path);
    const directory = await open(witness.directory, 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await unlink(temporary).catch(() => {}); await lock.close(); await unlink(path + '.lock'); }
}
