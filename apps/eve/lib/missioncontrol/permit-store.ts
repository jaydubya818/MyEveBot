import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { WorkDatabase } from '../engineering/store.ts';
import { WorkStore } from '../engineering/store.ts';
import { assertCanonicalAlphaWork, alphaTasksTupleSha256 } from '../external-alpha/work-tuple.ts';
import { canonicalPermitJson, ownerEnrollmentSchema, verifyExecutionPermit, verifyAdmissionReceipt, verifyPermitControl } from './execution-permit.ts';
import { parsePolicyMessage } from '../../../../packages/capability-enforcement/src/ordering-wire.ts';
import { assertCapabilityAdmission } from '../../../../packages/capability-enforcement/src/postgres.ts';
import { capabilityPairDigest, capabilityPairSchema, type CapabilityPair } from './installed-client.ts';
import type { WorkAuthorityRecord } from '../external-alpha/work-authority.ts';

const denied = (): never => { throw Error('MISSIONCONTROL_BINDING_DENIED'); };
const sha256 = (value: unknown) => createHash('sha256').update(canonicalPermitJson(value)).digest('hex');

export class MissionControlBindings {
  constructor(readonly database: WorkDatabase, readonly ownerId: string) {
    if (!ownerId.trim() || ownerId.length > 200 || !database.atomic) throw Error('MISSIONCONTROL_TRANSACTION_REQUIRED');
  }
  private async atomic<T>(body: (database: WorkDatabase) => Promise<T>): Promise<T> {
    return this.database.atomic!(async database => {
      await database.query("SELECT set_config('myeve.missioncontrol_owner',$1,true)", [this.ownerId]);
      return body(database);
    });
  }
  async enrollment(installationId?: string) {
    return this.atomic(async database => {
      const [row] = await database.query('SELECT document FROM missioncontrol_owner_enrollments WHERE owner_id=$1', [this.ownerId]);
      const parsed = ownerEnrollmentSchema.safeParse(row?.document);
      if (!parsed.success || parsed.data.ownerId !== this.ownerId || (installationId && parsed.data.installationId !== installationId)) return denied();
      return parsed.data;
    });
  }
  async accept(permitValue: unknown, receiptValue: unknown, challenge: { commandId: string; challenge: string }, pairValue: CapabilityPair,
    workId: string, repository: string, now = Date.now()) {
    return this.atomic(async database => {
      const [row] = await database.query('SELECT missioncontrol_enrollment_document($1) AS document', [this.ownerId]);
      const enrollment = ownerEnrollmentSchema.parse(row?.document), pair = capabilityPairSchema.parse(pairValue);
      const source = parsePolicyMessage(JSON.parse(pair.myeve.message));
      const relay = parsePolicyMessage(JSON.parse(pair.relay.message));
      if (source.kind !== 'PERMIT' || source.authority !== 'myeve' || source.ownerId !== this.ownerId
        || source.installationId !== enrollment.installationId || source.capabilityId !== 'enterprise.fleet'
        || source.workId !== workId || source.expiresAt <= now || source.issuedAt > now
        || relay.kind !== 'PERMIT' || relay.authority !== 'relay' || relay.expiresAt <= now || relay.issuedAt > now) return denied();
      // Same policy locks are held through receipt retention. Dispatch later compares
      // every locked policy input, preventing reuse after a preference or evidence change.
      const policyConnection = { query: async (sql: string, values?: unknown[]) => ({rows:await database.query(sql,values)}) };
      const scope = { ownerId: this.ownerId, installationId: enrollment.installationId,
        organizationId: source.organizationId, agentId: source.agentId, environment: 'qualification' as const };
      const capabilityRequest = {capabilityId:source.capabilityId,workId,workGeneration:source.workGeneration,
        budgetMicros:source.budgetMicros,expectedRevision:source.version};
      const current = await assertCapabilityAdmission(policyConnection, scope, capabilityRequest);
      if (current.agentRevision !== source.agentRevision || current.registryVersion !== source.registryVersion) return denied();
      await database.query("SELECT id FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' AND id=$2 FOR UPDATE", [this.ownerId, workId]);
      const store = new WorkStore({ scopeId: this.ownerId, scopeKind: 'personal', actorId: this.ownerId }, database);
      const work = await store.get(workId);
      assertCanonicalAlphaWork(work, { ownerId: this.ownerId, repository });
      const verified = verifyExecutionPermit(permitValue, row?.document, { ownerId: this.ownerId,
        workId: work.id, workVersion: work.version, workGeneration: work.generation, tupleSha256: alphaTasksTupleSha256,
        maxCostMicrousd: work.maxCostUsd * 1000000, maxDurationSeconds: work.maxDurationSeconds }, now);
      const receipt = verifyAdmissionReceipt(receiptValue, verified, {...challenge,policyPairSha256:capabilityPairDigest(pair)}, now);
      const document = verified.document;
      if (source.missionId !== document.missionId || source.workGeneration !== work.generation
        || source.budgetMicros < document.admission.maxCostMicrousd) return denied();
      const [fence] = await database.query('SELECT * FROM missioncontrol_capability_snapshot($1,$2,$3,$4)',
        [this.ownerId,enrollment.installationId,source.agentId,source.backendId]);
      if (!fence?.snapshot_sha256 || fence.backend_incarnation !== source.incarnation
        || fence.backend_enrollment_version !== source.enrollmentVersion || fence.policy_id !== source.policyId) return denied();
      const { schema: _schema, permitId: _permitId, issuedAt: _issuedAt, expiresAt: _expiresAt,
        enrollmentRevision: _revision, approvalId: _approvalId, approvalDigest: _approvalDigest, ...binding } = document;
      const bindingSha256 = sha256(binding);
      await database.query(`INSERT INTO missioncontrol_work_bindings(owner_id,installation_id,work_id,work_version,work_generation,
        connection_id,mission_id,work_order_id,work_order_revision_id,binding_sha256,binding)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) ON CONFLICT DO NOTHING`,
      [this.ownerId, document.installationId, work.id, work.version, work.generation, document.connectionId, document.missionId,
        document.workOrderId, document.workOrderRevisionId, bindingSha256, JSON.stringify(binding)]);
      const [prior] = await database.query(`SELECT binding_sha256 FROM missioncontrol_work_bindings
        WHERE owner_id=$1 AND work_id=$2 AND work_version=$3 AND work_generation=$4`, [this.ownerId, work.id, work.version, work.generation]);
      if (prior?.binding_sha256 !== bindingSha256) return denied();
      await database.query(`INSERT INTO missioncontrol_execution_permits(owner_id,permit_id,work_id,work_version,work_generation,permit_sha256,envelope)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT DO NOTHING`,
      [this.ownerId, document.permitId, work.id, work.version, work.generation, verified.permitSha256, JSON.stringify(verified.envelope)]);
      const [priorPermit] = await database.query('SELECT permit_sha256 FROM missioncontrol_execution_permits WHERE owner_id=$1 AND permit_id=$2', [this.ownerId, document.permitId]);
      if (priorPermit?.permit_sha256 !== verified.permitSha256) return denied();
      const receiptSha256 = sha256(receipt);
      await database.query(`INSERT INTO missioncontrol_admission_receipts(owner_id,command_id,permit_id,envelope,receipt_sha256,issued_at,expires_at,
        capability_agent,capability_backend,capability_snapshot_sha256,capability_expires_at)
        VALUES($1,$2,$3,$4::jsonb,$5,to_timestamp($6::double precision/1000),to_timestamp($7::double precision/1000),$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
      [this.ownerId, receipt.document.commandId, document.permitId, JSON.stringify(receipt), receiptSha256, receipt.document.issuedAt, receipt.document.expiresAt,
        source.agentId,source.backendId,fence.snapshot_sha256,
        new Date(Math.min(new Date(fence.expires_at).getTime(),source.expiresAt,relay.expiresAt)).toISOString()]);
      const [priorReceipt] = await database.query('SELECT receipt_sha256 FROM missioncontrol_admission_receipts WHERE owner_id=$1 AND command_id=$2', [this.ownerId, receipt.document.commandId]);
      if (priorReceipt?.receipt_sha256 !== receiptSha256) return denied();
      await assertCapabilityAdmission(policyConnection,scope,capabilityRequest);
      if (Date.now() >= Math.min(receipt.document.expiresAt,source.expiresAt,relay.expiresAt)) return denied();
      return { work, permit: verified.envelope, receipt };
    });
  }
  async forWork(workId: string) {
    return this.atomic(async database => {
      const rows = await database.query(`SELECT b.binding,p.envelope AS permit,r.envelope AS admission,r.expires_at
        FROM missioncontrol_work_bindings b JOIN missioncontrol_execution_permits p USING(owner_id,work_id,work_version,work_generation)
        LEFT JOIN missioncontrol_admission_receipts r ON r.owner_id=p.owner_id AND r.permit_id=p.permit_id
        WHERE b.owner_id=$1 AND b.work_id=$2 ORDER BY b.work_version DESC,b.work_generation DESC,r.expires_at DESC NULLS LAST LIMIT 1`, [this.ownerId, workId]);
      return rows[0] ?? null;
    });
  }
  async controlCandidates():Promise<string[]> {
    return this.atomic(async database=>{
      // A not-yet-observed control may be a fresh revoke. Check those permits
      // first, but reserve half each full page for retained controls so a stream
      // of new permits cannot starve pending cleanup or lost acknowledgments.
      // Within each group, durable attempt time keeps unavailable peers rotating.
      const rows=await database.query(`WITH candidates AS (
        SELECT p.permit_id,p.created_at,attempt.attempted_at,
          EXISTS(SELECT 1 FROM missioncontrol_permit_controls c
            WHERE c.owner_id=p.owner_id AND c.permit_id=p.permit_id) AS retained_control
        FROM missioncontrol_execution_permits p
        LEFT JOIN missioncontrol_control_attempts attempt ON attempt.owner_id=p.owner_id AND attempt.permit_id=p.permit_id
        WHERE p.owner_id=$1 AND ((p.envelope#>>'{document,expiresAt}')::bigint>extract(epoch FROM clock_timestamp())*1000
          OR EXISTS(SELECT 1 FROM external_alpha_work_authority a WHERE a.owner_id=p.owner_id AND a.work_id=p.work_id
            AND a.work_version=p.work_version AND a.work_generation=p.work_generation AND a.state IN('ISSUED','DISPATCHING','CONSUMED','UNKNOWN'))
          OR EXISTS(SELECT 1 FROM missioncontrol_permit_controls c WHERE c.owner_id=p.owner_id AND c.permit_id=p.permit_id
            AND c.sequence=(SELECT max(latest.sequence) FROM missioncontrol_permit_controls latest
              WHERE latest.owner_id=c.owner_id AND latest.permit_id=c.permit_id)
            AND NOT EXISTS(SELECT 1 FROM missioncontrol_control_acknowledgments a WHERE a.owner_id=c.owner_id
              AND a.permit_id=c.permit_id AND a.sequence=c.sequence AND a.control_digest=c.control_digest AND a.cleanup='CONFIRMED')))
        ), ranked AS (
          SELECT *,row_number() OVER(PARTITION BY retained_control
            ORDER BY COALESCE(attempted_at,created_at),created_at,permit_id) AS ordinal FROM candidates
        ) SELECT permit_id FROM ranked
        ORDER BY (ordinal-1)/50,retained_control,ordinal LIMIT 100`,[this.ownerId]);
      return rows.map(row=>String(row.permit_id));
    });
  }
  async recordControlAttempt(permitId:string) {
    return this.atomic(async database=>{
      await database.query(`INSERT INTO missioncontrol_control_attempts(owner_id,permit_id)
        VALUES($1,$2) ON CONFLICT(owner_id,permit_id) DO UPDATE SET attempted_at=clock_timestamp()`,[this.ownerId,permitId]);
    });
  }
  async retainControlAcknowledgment(expected:{permitId:string;sequence:number;controlDigest:string;
    authority:'FENCED'|'NEW_ADMISSIONS_DENIED';cleanup:'PENDING_BACKEND'|'CONFIRMED'},value:unknown) {
    const response=z.object({permitId:z.literal(expected.permitId),sequence:z.literal(expected.sequence),
      authority:z.literal(expected.authority),cleanup:z.literal(expected.cleanup),accounting:z.literal('UNCHANGED')}).strict().parse(value);
    return this.atomic(async database=>{
      const rows=await database.query(`INSERT INTO missioncontrol_control_acknowledgments(owner_id,permit_id,sequence,control_digest,cleanup,response)
        SELECT $1,$2,$3,$4,$5,$6 FROM missioncontrol_permit_controls
        WHERE owner_id=$1 AND permit_id=$2 AND sequence=$3 AND control_digest=$4
        ON CONFLICT DO NOTHING RETURNING permit_id`,[this.ownerId,expected.permitId,expected.sequence,expected.controlDigest,expected.cleanup,response]);
      if(!rows.length){const [prior]=await database.query(`SELECT response FROM missioncontrol_control_acknowledgments
        WHERE owner_id=$1 AND permit_id=$2 AND sequence=$3 AND cleanup=$4 AND control_digest=$5`,
        [this.ownerId,expected.permitId,expected.sequence,expected.cleanup,expected.controlDigest]);
        if(canonicalPermitJson(prior?.response)!==canonicalPermitJson(response))return denied();}
    });
  }
  async fence(permitId:string,value:unknown,expectedDigest:string,now=Date.now()) {
    return this.atomic(async database=>{
      const [enrollment]=await database.query('SELECT missioncontrol_enrollment_document($1) AS document',[this.ownerId]);
      const [permit]=await database.query('SELECT envelope FROM missioncontrol_execution_permits WHERE owner_id=$1 AND permit_id=$2',[this.ownerId,permitId]);
      const verified=verifyPermitControl(value,permit?.envelope,enrollment?.document,now),c=verified.envelope.document;
      if(c.permitId!==permitId||verified.controlDigest!==expectedDigest)return denied();
      await database.query("SELECT id FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' AND id=$2 FOR UPDATE",[this.ownerId,c.work.id]);
      const [prior]=await database.query('SELECT sequence,control_digest FROM missioncontrol_permit_controls WHERE owner_id=$1 AND permit_id=$2 ORDER BY sequence DESC LIMIT 1',[this.ownerId,permitId]);
      if(prior&&(prior.sequence>c.sequence||(prior.sequence===c.sequence&&prior.control_digest!==expectedDigest)))return denied();
      await database.query(`INSERT INTO missioncontrol_permit_controls(owner_id,permit_id,sequence,operation,control_digest,envelope)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,[this.ownerId,permitId,c.sequence,c.operation,expectedDigest,verified.envelope]);
      return {schema:'mc-permit-control-ack/v1' as const,connectionId:c.connectionId,permitId,sequence:c.sequence,controlDigest:expectedDigest,
        authority:c.operation==='revoke'?'FENCED' as const:'NEW_ADMISSIONS_DENIED' as const,cleanup:'PENDING_BACKEND' as const};
    });
  }
  /** Called only after the existing Factory controller authenticates its fresh challenge. */
  async retainFactoryReadback(authority:WorkAuthorityRecord,original:unknown) {
    if(authority.envelope.document.ownerId!==this.ownerId)return denied();
    const readback=JSON.parse(JSON.stringify(original)),digest=sha256(readback);
    return this.atomic(async database=>{
      const rows=await database.query(`INSERT INTO missioncontrol_factory_readbacks(owner_id,authority_id,readback_sha256,readback)
        SELECT $1,$2,$3,$4 FROM missioncontrol_work_bindings b
        WHERE b.owner_id=$1 AND b.work_id=$5 AND b.work_version=$6 AND b.work_generation=$7
        ON CONFLICT DO NOTHING RETURNING readback_sha256`,[this.ownerId,authority.id,digest,readback,authority.workId,authority.workVersion,authority.workGeneration]);
      if(!rows.length){
        const [prior]=await database.query('SELECT readback_sha256 FROM missioncontrol_factory_readbacks WHERE owner_id=$1 AND authority_id=$2 AND readback_sha256=$3',[this.ownerId,authority.id,digest]);
        if(!prior)return denied();
      }
    });
  }
}
