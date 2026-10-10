import { createHash } from 'node:crypto';
import { z } from 'zod';
import { capabilityRegistry, resolveCapabilities, type PolicySnapshot, type CapabilityFacts } from '@mission-control/capability-control';
import { capabilityCommandSchema, CapabilityError, type CapabilityActor, type CapabilityInstallation, type CapabilityReceipt } from './contracts.ts';
import { acknowledgeBackendControl, controlAcknowledgments } from '../../../../packages/capability-enforcement/src/lifecycle-source.ts';
import type { SignedLifecycleReceipt } from '../../../../packages/capability-enforcement/src/lifecycle-wire.ts';
import { assertRecoveryEnrollment, configuredRecoveryWitness, recoveryHead, assertRecoveryHead, advanceRecoveryWitness, type RecoveryWitness } from '../../../../packages/capability-enforcement/src/recovery-witness.ts';

export interface CapabilityConnection {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
}
export interface CapabilityPool { connect(): Promise<CapabilityConnection> }
const preferencesSchema = z.record(z.string(), z.enum(['ENABLED', 'DISABLED']));
const controlsSchema = z.record(z.string(), z.enum(['PAUSE_REQUESTED', 'REVOKE_REQUESTED']));
const budgetsSchema = z.record(z.string(), z.number().int().nonnegative().max(1_000_000_000_000));
const factsSchema = z.record(z.string(), z.object({
  supported: z.boolean(), deployed: z.boolean(), entitled: z.boolean(),
  administrator: z.enum(['ALLOW', 'DENY', 'PENDING_APPROVAL']),
  setup: z.record(z.string(), z.boolean()),
  qualification: z.record(z.string(), z.enum(['QUALIFIED', 'UNQUALIFIED'])),
  lifecycle: z.enum(['ACTIVE', 'PAUSED', 'REVOKED']), selectedAlternative: z.string().optional(),
}).strict());

export class CapabilityStore {
  constructor(readonly pool: CapabilityPool, readonly installation: CapabilityInstallation, readonly actor: CapabilityActor, readonly deliver?: (organizationId: string) => Promise<unknown>, readonly recovery: RecoveryWitness | undefined = configuredRecoveryWitness()) {
    if (!actor.ownerId.trim()) throw new CapabilityError('authentication_required', 'Sign in to manage capabilities.', 401);
  }

  private async transaction<T>(operation: (connection: CapabilityConnection, organizationId: string) => Promise<T>, snapshot = false) {
    const connection = await this.pool.connect();
    try {
      await connection.query('BEGIN');
      if (snapshot) await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const { rows: [role] } = await connection.query(`SELECT r.rolsuper OR r.rolbypassrls OR r.rolcreaterole
        OR has_schema_privilege(current_user,'capability_control','CREATE')
        OR has_table_privilege(current_user,'capability_control.platform_owner_bindings','INSERT,UPDATE,DELETE,TRUNCATE')
        OR has_table_privilege(current_user,'capability_control.evidence','INSERT,UPDATE,DELETE,TRUNCATE')
        OR has_table_privilege(current_user,'capability_control.installations','INSERT,UPDATE,DELETE,TRUNCATE') AS unsafe
        FROM pg_roles r WHERE r.rolname=current_user`);
      if (!role || role.unsafe !== false) throw new CapabilityError('runtime_role_unqualified', 'Capability storage requires a restricted runtime role.', 503);
      await connection.query("SELECT set_config('myeve.capability_owner',$1,true),set_config('myeve.capability_installation',$2,true)", [this.actor.ownerId, this.installation.id]);
      const { rows: [installation] } = await connection.query(
        'SELECT organization_id FROM capability_control.installations WHERE id=$1 AND environment=$2 AND active=true',
        [this.installation.id, this.installation.environment]);
      if (!installation) throw new CapabilityError('installation_unavailable', 'This capability installation is unavailable.', 503);
      const scope = { ownerId: this.actor.ownerId, installationId: this.installation.id, organizationId: String(installation.organization_id) };
      if (this.recovery) await connection.query('SELECT capability_control.lock_admission_policy($1,$2,$3)', [scope.installationId, scope.ownerId, 'policy-propagation']);
      await assertRecoveryEnrollment(connection, scope, this.recovery);
      const before = this.recovery ? await recoveryHead(connection, scope, this.recovery) : undefined;
      if (before) await assertRecoveryHead(this.recovery!, before);
      const result = await operation(connection, String(installation.organization_id));
      if (before) await advanceRecoveryWitness(this.recovery!, before, await recoveryHead(connection, scope, this.recovery!));
      await connection.query('COMMIT');
      return result;
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally { connection.release(); }
  }

  async inspect() {
    return this.transaction(async (connection, organizationId) => {
      const scope = [this.installation.id, this.actor.ownerId];
      const { rows: [row] } = await connection.query('SELECT * FROM capability_control.owner_state WHERE installation_id=$1 AND owner_id=$2 FOR SHARE', scope);
      const { rows: [binding] } = await connection.query("SELECT * FROM capability_control.platform_owner_bindings WHERE installation_id=$1 AND owner_id=$2 AND organization_id=$3 AND status='ACTIVE' AND expires_at>clock_timestamp()", [...scope, organizationId]);
      const { rows: [evidence] } = await connection.query('SELECT * FROM capability_control.evidence WHERE installation_id=$1 AND owner_id=$2', scope);
      const revision = row ? Number(row.revision) : 1;
      const preferences = preferencesSchema.parse(row?.preferences ?? {});
      const budgets = budgetsSchema.parse(row?.budgets ?? {});
      const controls = controlsSchema.parse(row?.controls ?? {});
      const now = Date.now();
      const evidenceCurrent = evidence?.organization_id === organizationId
        && evidence?.registry_version === capabilityRegistry.version
        && new Date(String(evidence.observed_at)).getTime() <= now
        && new Date(String(evidence.expires_at)).getTime() > now;
      const facts: Record<string, CapabilityFacts> = evidenceCurrent ? factsSchema.parse(evidence.facts) : {};
      const snapshot: PolicySnapshot = {
        registryVersion: capabilityRegistry.version, revision,
        observedAt: now, expiresAt: now + 1000,
        scope: { ownerId: this.actor.ownerId, organizationId, installationId: this.installation.id, environment: this.installation.environment },
        preferences, ordinaryDefaults: {}, facts,
        ...(binding ? { platformOwnerPolicy: {
          id: String(binding.id), revision: Number(binding.revision), ownerId: this.actor.ownerId,
          organizationId, installationId: this.installation.id, environment: this.installation.environment,
          status: 'ACTIVE' as const, administrationRecordId: String(binding.administration_record_id),
          membershipRecordId: String(binding.membership_record_id), installationRecordId: String(binding.installation_record_id),
          auditRecordId: String(binding.audit_record_id), expiresAt: new Date(String(binding.expires_at)).getTime(),
        } } : {}),
      };
      const resolved = resolveCapabilities(capabilityRegistry, snapshot, now);
      const { rows: [propagation] } = await connection.query(`SELECT revision,status FROM capability_control.policy_changes
        WHERE installation_id=$1 AND owner_id=$2 ORDER BY revision DESC LIMIT 1`, scope);
      const { rows: audit } = await connection.query('SELECT revision,request_id,source,capability_id,operation,previous,current,created_at FROM capability_control.audit WHERE installation_id=$1 AND owner_id=$2 ORDER BY revision DESC LIMIT 50', scope);
      const pendingAudit = propagation?.status === 'PENDING_PROPAGATION'
        ? audit.find(item => Number(item.revision) === Number(propagation.revision)) : undefined;
      const pendingCommand = pendingAudit ? capabilityCommandSchema.parse({
        requestId: pendingAudit.request_id, expectedRevision: Number(pendingAudit.revision) - 1,
        capabilityId: pendingAudit.capability_id, operation: pendingAudit.operation,
        ...(pendingAudit.operation === 'set_budget' ? { limitMicros: (pendingAudit.current as { limitMicros: number }).limitMicros } : {}),
      }) : null;
      const backendControls = await controlAcknowledgments(connection, this.installation.id, this.actor.ownerId);
      return {
        backendControls,
        pendingCommand,
        registryVersion: capabilityRegistry.version, revision,
        propagation: propagation ? { revision: Number(propagation.revision), status: String(propagation.status) } : null,
        platformOwner: !!binding, evidenceStatus: evidenceCurrent ? 'CURRENT' : 'UNAVAILABLE',
        activeWork: { status: 'UNKNOWN' as const, message: 'Active Work inventory is not connected. Disabling a preference preserves existing Work. Pause and revoke require backend acknowledgement.' },
        capabilities: resolved.map((resolution, index) => ({ ...capabilityRegistry.capabilities[index], ...resolution,
          control: controls[resolution.id] ?? null, limitMicros: budgets[resolution.id] ?? null,
          backendControl: backendControls.find(item => item.capabilityId === resolution.id) ?? null,
          admissionEligible: false as const,
          enforcement: 'BACKEND_COMPATIBILITY_REQUIRED' as const,
        })), audit,
      };
    }, true);
  }

  async acknowledgeControl(backendId: string, envelope: SignedLifecycleReceipt) {
    return this.transaction((connection, organizationId) => acknowledgeBackendControl(connection,
      { ownerId: this.actor.ownerId, organizationId, installationId: this.installation.id,
        environment: this.installation.environment, agentId: 'policy-propagation' }, backendId, envelope));
  }

  async command(value: unknown): Promise<CapabilityReceipt> {
    const command = capabilityCommandSchema.parse(value);
    if (!capabilityRegistry.capabilities.some(item => item.id === command.capabilityId))
      throw new CapabilityError('unknown_capability', 'This capability is not registered.', 400);
    const fingerprint = createHash('sha256').update(JSON.stringify(command)).digest('hex');
    let organization = '';
    const receipt = await this.transaction(async (connection, organizationId) => {
      organization = organizationId;
      const scope = [this.installation.id, this.actor.ownerId];
      await connection.query('INSERT INTO capability_control.owner_state(installation_id,owner_id) VALUES($1,$2) ON CONFLICT DO NOTHING', scope);
      const { rows: [state] } = await connection.query('SELECT * FROM capability_control.owner_state WHERE installation_id=$1 AND owner_id=$2 FOR UPDATE', scope);
      const { rows: [saved] } = await connection.query('SELECT fingerprint,receipt FROM capability_control.commands WHERE installation_id=$1 AND owner_id=$2 AND request_id=$3', [...scope, command.requestId]);
      if (saved) {
        if (saved.fingerprint !== fingerprint) throw new CapabilityError('idempotency_conflict', 'This request ID was already used for a different change.');
        return saved.receipt as unknown as CapabilityReceipt;
      }
      if (Number(state.revision) !== command.expectedRevision) throw new CapabilityError('revision_conflict', 'Capabilities changed in another session. Reload before saving.');
      const { rows: [destination] } = await connection.query(`SELECT 1 FROM capability_control.policy_destinations
        WHERE installation_id=$1 AND owner_id=$2 LIMIT 1`, scope);
      const preferences = preferencesSchema.parse(state.preferences);
      const budgets = budgetsSchema.parse(state.budgets);
      const controls = controlsSchema.parse(state.controls);
      const id = command.capabilityId;
      const previous = { preference: preferences[id] ?? null, limitMicros: budgets[id] ?? null, control: controls[id] ?? null };
      if (command.operation === 'enable' && controls[id]) {
        const completed = (await controlAcknowledgments(connection, this.installation.id, this.actor.ownerId))
          .find(item => item.capabilityId === id);
        if (!completed?.complete) throw new CapabilityError('control_pending', 'Backend control must be reconciled before this capability can be enabled.');
        delete controls[id];
      }
      if (controls[id] === 'REVOKE_REQUESTED' && command.operation === 'pause') throw new CapabilityError('revocation_pending', 'A pending revocation cannot be replaced with a pause.');
      if (command.operation === 'enable') preferences[id] = 'ENABLED';
      if (command.operation === 'disable' || command.operation === 'revoke') preferences[id] = 'DISABLED';
      if (command.operation === 'pause') controls[id] = 'PAUSE_REQUESTED';
      if (command.operation === 'revoke') controls[id] = 'REVOKE_REQUESTED';
      if (command.operation === 'set_budget') budgets[id] = command.limitMicros!;
      const revision = Number(state.revision) + 1;
      const controlRequested = command.operation === 'pause' || command.operation === 'revoke';
      const receipt: CapabilityReceipt = { requestId: command.requestId, revision, capabilityId: id, operation: command.operation,
        status: destination ? 'PENDING_PROPAGATION' : controlRequested ? 'PENDING_BACKEND' : 'SAVED', existingWork: controlRequested ? 'CONTROL_REQUESTED' : 'PRESERVED' };
      await connection.query('UPDATE capability_control.owner_state SET revision=$3,preferences=$4,budgets=$5,controls=$6 WHERE installation_id=$1 AND owner_id=$2', [...scope, revision, preferences, budgets, controls]);
      await connection.query('INSERT INTO capability_control.commands(installation_id,owner_id,request_id,fingerprint,receipt) VALUES($1,$2,$3,$4,$5)', [...scope, command.requestId, fingerprint, receipt]);
      await connection.query('INSERT INTO capability_control.audit(installation_id,owner_id,revision,request_id,actor_id,source,capability_id,operation,previous,current) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [...scope, revision, command.requestId, this.actor.ownerId, this.actor.source, id, command.operation, previous,
          { preference: preferences[id] ?? null, limitMicros: budgets[id] ?? null, control: controls[id] ?? null }]);
      if (controlRequested) await connection.query('INSERT INTO capability_control.control_requests(installation_id,owner_id,request_id,capability_id,revision,operation) VALUES($1,$2,$3,$4,$5,$6)',
        [...scope, command.requestId, id, revision, command.operation]);
      return receipt;
    });
    if (this.deliver && receipt.status === 'PENDING_PROPAGATION') {
      try { await this.deliver(organization); } catch { /* Persisted intent remains pending for retry. */ }
    }
    return receipt;
  }
}
export type CapabilityView = Awaited<ReturnType<CapabilityStore['inspect']>>;
