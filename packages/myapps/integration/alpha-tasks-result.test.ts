import { afterEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import {
  Env,
  connection,
  files,
} from "../../../apps/eve/lib/external-alpha/work-test-fixture.ts";
import {
  buildSignedResult,
  type BuildOptions,
} from "../../../apps/eve/lib/external-alpha/result-test-fixture.ts";
import { bindDispatch } from "../../../apps/eve/lib/external-alpha/dispatch-readback.ts";
import { prepareRequest } from "../../../apps/eve/lib/external-alpha/work-controller.ts";
import { publicKeyId } from "../../../apps/eve/lib/external-alpha/work-authority.ts";
import {
  ingestExternalAlphaResult,
  settleExternalAlphaResult,
} from "../../../apps/eve/lib/external-alpha/result-ingestion.ts";
import { permitFixture } from "../../../apps/eve/lib/missioncontrol/permit-test-fixture.ts";
import { permitDigest } from "../../../apps/eve/lib/missioncontrol/execution-permit.ts";
import { alphaTasksTupleSha256 } from "../../../apps/eve/lib/external-alpha/work-tuple.ts";
import { digest } from "../../../apps/eve/lib/engineering/contract.ts";
import { retainedAlphaTasksOrigin } from "../../../apps/eve/lib/myapps/alpha-tasks-result.ts";
import { BetaIntegration } from "../../../apps/eve/lib/beta-integration/runtime.ts";
import {
  PrivateResultAcceptance,
  PRIVATE_ACCEPT,
} from "../../../apps/eve/lib/external-alpha/private-acceptance.ts";
import type { WorkDatabase } from "../../../apps/eve/lib/engineering/store.ts";

describe.skipIf(!connection)(
  "read-only retained Alpha Tasks provenance (synthetic PostgreSQL)",
  () => {
    const envs: Env[] = [];
    afterEach(async () => {
      await Promise.all(envs.splice(0).map((e) => e.close()));
    });
    async function fixture(opts?: BuildOptions, unknown = false) {
      const e = await Env.create();
      envs.push(e);
      const work = await e.seedWork(),
        issued = await e.svc.issue(work, files);
      await e.svc.claim(issued);
      const receiptKey = generateKeyPairSync("ed25519").publicKey;
      const config = e.workConfig([
        {
          keyId: publicKeyId(receiptKey),
          publicKey: receiptKey
            .export({ type: "spki", format: "pem" })
            .toString(),
        },
      ]);
      const dispatch = await bindDispatch(
          e.db,
          issued,
          prepareRequest(issued, work, config),
        ),
        workOrderId = randomUUID();
      const authority = await e.svc.finish(issued.id, "CONSUMED", {
        receipt: {
          authorityId: issued.id,
          authoritySha256: issued.documentSha256,
          requestId: issued.requestId,
          workOrderId,
          consumedAt: new Date().toISOString(),
        },
      });
      const { signed } = buildSignedResult({
        authority,
        work,
        workOrderId,
        keys: e.resultKeys,
        opts: { ...opts, requestDigest: dispatch.requestDigest },
      });
      const result = await ingestExternalAlphaResult({
        database: e.db,
        policy: e.policy,
        config,
        authority,
        work,
        envelope: signed,
        expectedRequestDigest: dispatch.requestDigest,
        expectedRunId: "00000000-0000-4000-8000-0000000000a1",
      });
      await settleExternalAlphaResult(e.db, e.policy, authority, {
        quiescent: true,
        operations: [
          {
            operationId: "synthetic",
            phase: "productive",
            state: unknown ? "unknown" : "settled",
            actualMicrousd: unknown ? null : 0,
            reservedMicrousd: 100,
            model: e.policy.model,
            pricingRevision: "fixture",
          },
        ],
      });
      // Seed independently signed historical provenance in this disposable fixture only.
      // This test does not qualify installed admission, remote execution or source closure.
      const permit = permitFixture({
        ownerId: e.owner,
        workId: work.id,
        workVersion: work.version,
        workGeneration: work.generation,
        tupleSha256: alphaTasksTupleSha256,
        maxCostMicrousd: 1300000,
        maxDurationSeconds: 180,
      });
      permit.document.admission.factoryVersion =
        permit.enrollment.factoryVersion = e.policy.factoryVersion;
      const p = permit.document;
      const {
        schema: _schema,
        permitId: _permitId,
        issuedAt: _issued,
        expiresAt: _expires,
        enrollmentRevision: _revision,
        approvalId: _approval,
        approvalDigest: _approvalHash,
        ...binding
      } = p;
      await e.pool.query(
        "INSERT INTO missioncontrol_owner_enrollments(owner_id,installation_id,revision,document) VALUES($1,$2,1,$3)",
        [e.owner, p.installationId, permit.enrollment],
      );
      await e.pool.query(
        `INSERT INTO missioncontrol_work_bindings(owner_id,installation_id,work_id,work_version,work_generation,
      connection_id,mission_id,work_order_id,work_order_revision_id,binding_sha256,binding) VALUES($1,$2,$3,1,1,$4,$5,$6,$7,$8,$9)`,
        [
          e.owner,
          p.installationId,
          work.id,
          p.connectionId,
          p.missionId,
          p.workOrderId,
          p.workOrderRevisionId,
          digest(binding),
          binding,
        ],
      );
      await e.pool.query(
        `INSERT INTO missioncontrol_execution_permits(owner_id,permit_id,work_id,work_version,work_generation,permit_sha256,envelope)
      VALUES($1,$2,$3,1,1,$4,$5)`,
        [e.owner, p.permitId, work.id, permitDigest(p), permit.signPermit()],
      );
      const admission=permit.signReceipt();
      await e.pool.query(`INSERT INTO missioncontrol_admission_receipts(owner_id,command_id,permit_id,envelope,receipt_sha256,
        issued_at,expires_at,capability_agent,capability_backend,capability_snapshot_sha256,capability_expires_at)
        VALUES($1,$2,$3,$4,$5,to_timestamp($6::double precision/1000),to_timestamp($7::double precision/1000),
          'synthetic-agent','synthetic-backend',$8,clock_timestamp()+interval '1 hour')`,
        [e.owner,admission.document.commandId,p.permitId,admission,digest(admission),admission.document.issuedAt,
          admission.document.expiresAt,'a'.repeat(64)]);
      // This disposable importer fixture seeds historical custody explicitly.
      // The receiving triggers are qualified separately using actual admission.
      for(const stage of ['ISSUE','DISPATCH'])await e.pool.query(`INSERT INTO missioncontrol_alpha_admission_bindings
        (owner_id,authority_id,stage,permit_id,command_id,receipt_sha256) VALUES($1,$2,$3,$4,$5,$6)`,
        [e.owner,authority.id,stage,p.permitId,admission.document.commandId,digest(admission)]);
      const db: WorkDatabase = {
        ...e.db,
        atomic: async (action) => {
          const client = await e.pool.connect();
          try {
            await client.query("BEGIN");
            const value = await action({
              query: async (sql, args) => (await client.query(sql, args)).rows,
            });
            await client.query("COMMIT");
            return value;
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          } finally {
            client.release();
          }
        },
      };
      const read = (owner = e.owner, id = result.resultId) =>
        retainedAlphaTasksOrigin(db, owner, id, { policy: e.policy, config });
      return { e, work, result, config, permit, authority, read };
    }
    it("preserves accepted Work historical identity and original PARTIAL Proof without writes or renewed execution", async () => {
      const s = await fixture(),
        before = await s.read();
      expect(before.origin).toMatchObject({
        missionId: s.permit.document.missionId,
        planDigest: s.permit.document.planDigest,
        resultId: s.result.resultId,
        workVersion: 1,
        workGeneration: 1,
        attemptNumber: 1,
      });
      expect(before.originalProof.outcome).toBe("PARTIAL");
      const beta = new BetaIntegration(s.e.pool, {
        repository: s.e.policy.repository,
        maxCostUsd: 1.3,
        maxDurationSeconds: 180,
      });
      const service = new PrivateResultAcceptance(beta, s.e.policy, s.config),
        item = await service.request(s.e.owner, s.work.id);
      const response = await beta.inbox(s.e.owner).respond({
        itemId: item.id,
        actionId: item.action!.id,
        actionBinding: item.actionBinding!,
        expectedRevision: item.revision,
        idempotencyKey: "accept-synthetic",
        answer: PRIVATE_ACCEPT,
      });
      await service.accept(response);
      const after = await s.read();
      expect(after.origin).toEqual(before.origin);
      expect(after.originalProof).toEqual(before.originalProof);
      expect(after.currentWork).toEqual({ version: 2, generation: 2 });
      expect(after.acceptance).toBeTruthy();
      expect(await s.e.count("external_alpha_work_result")).toBe(1);
      expect(await s.e.count("external_alpha_work_authority")).toBe(1);
      expect(await s.e.count("engineering_candidate_publications")).toBe(0);
      await expect(s.read(randomUUID())).rejects.toThrow();
      await expect(s.read(s.e.owner, randomUUID())).rejects.toThrow();
    });
    it.each([
      "PARTIAL",
      "UNKNOWN",
      "revoked-policy",
      "revoked-permit",
      "stale-work",
    ] as const)(
      "rejects %s without promoting historical evidence",
      async (kind) => {
        const s = await fixture(
          kind === "PARTIAL" ? { verification: "UNKNOWN" } : undefined,
          kind === "UNKNOWN",
        );
        if (kind === "revoked-policy")
          await s.e.pool.query(
            "UPDATE external_alpha_policy SET revoked_at=clock_timestamp()",
          );
        if (kind === "revoked-permit")
          await s.e.pool.query(
            `INSERT INTO missioncontrol_permit_controls(owner_id,permit_id,sequence,operation,control_digest,envelope)
      VALUES($1,$2,1,'revoke',$3,$4)`,
            [
              s.e.owner,
              s.permit.document.permitId,
              "a".repeat(64),
              s.permit.signControl(),
            ],
          );
        if (kind === "stale-work")
          await s.e.pool.query(
            "UPDATE engineering_work SET generation=generation+1 WHERE id=$1",
            [s.work.id],
          );
        await expect(s.read()).rejects.toThrow();
        expect(await s.e.count("external_alpha_work_result")).toBe(1);
      },
    );
    it('keeps the exact dispatch permit even when another valid permit exists for the same Work',async()=>{
      const s=await fixture(),before=await s.read();
      const other={...s.permit.document,permitId:randomUUID(),approvalId:randomUUID()};
      await s.e.pool.query(`INSERT INTO missioncontrol_execution_permits(owner_id,permit_id,work_id,work_version,work_generation,permit_sha256,envelope)
        VALUES($1,$2,$3,1,1,$4,$5)`,[s.e.owner,other.permitId,s.work.id,permitDigest(other),s.permit.signPermit(other)]);
      expect((await s.read()).origin).toEqual(before.origin);
      await s.e.pool.query(`INSERT INTO missioncontrol_permit_controls(owner_id,permit_id,sequence,operation,control_digest,envelope)
        VALUES($1,$2,1,'revoke',$3,$4)`,[s.e.owner,s.permit.document.permitId,'a'.repeat(64),s.permit.signControl()]);
      await expect(s.read()).rejects.toThrow('APP_MISSION_BINDING');
      expect(await s.e.count('external_alpha_work_result')).toBe(1);
    });
    it('refuses historical provenance without an exact dispatch custody record',async()=>{
      const s=await fixture();
      // Superuser fixture corruption, never a recovery/backfill path.
      await s.e.pool.query('ALTER TABLE missioncontrol_alpha_admission_bindings DISABLE TRIGGER missioncontrol_alpha_binding_immutable');
      await s.e.pool.query("DELETE FROM missioncontrol_alpha_admission_bindings WHERE stage='DISPATCH'");
      await s.e.pool.query('ALTER TABLE missioncontrol_alpha_admission_bindings ENABLE TRIGGER missioncontrol_alpha_binding_immutable');
      await expect(s.read()).rejects.toThrow('APP_MISSION_BINDING');
    });
  },
);
