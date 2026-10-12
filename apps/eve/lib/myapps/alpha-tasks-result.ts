import { createHash } from "node:crypto";
import type { WorkDatabase } from "../engineering/store.ts";
import { WorkStore } from "../engineering/store.ts";
import { digest as resultDigest } from "../engineering/contract.ts";
import {
  externalAlphaPolicy,
  externalAlphaPolicySchema,
  type ExternalAlphaPolicy,
} from "../external-alpha/policy.ts";
import {
  externalAlphaWorkConfig,
  externalAlphaWorkConfigSchema,
  assertExternalAlphaFactoryKeys,
  type ExternalAlphaWorkConfig,
} from "../external-alpha/work-config.ts";
import { readWorkAuthorityRecord } from "../external-alpha/work-authority.ts";
import { verifyExternalAlphaResult } from "../external-alpha/result-ingestion.ts";
import { readExternalAlphaWork } from "../external-alpha/work-readback.ts";
import {
  alphaTasksTupleSha256,
  alphaTasksCriteria,
} from "../external-alpha/work-tuple.ts";
import {
  executionPermitEnvelopeSchema,
  verifyExecutionPermit,
  permitDigest,
} from "../missioncontrol/execution-permit.ts";
import { requireValue } from "../../../../packages/myapps/src/contracts.ts";
import {
  validateOrigin,
  type Origin,
} from "../../../../packages/myapps/src/alpha-tasks/contracts.ts";

/** Pure custody read and existing verifier reuse. No execution, install, acceptance or rewritten Proof. */
export interface AlphaTasksCustody {
  policy: ExternalAlphaPolicy;
  config: ExternalAlphaWorkConfig;
}
export async function retainedAlphaTasksOrigin(
  database: WorkDatabase,
  ownerId: string,
  resultId: string,
  custody?: AlphaTasksCustody,
) {
  const policy = custody
      ? externalAlphaPolicySchema.parse(custody.policy)
      : externalAlphaPolicy(),
    config = custody
      ? externalAlphaWorkConfigSchema.parse(custody.config)
      : externalAlphaWorkConfig();
  requireValue(
    database.atomic && policy && config && policy.ownerId === ownerId,
    "APP_RESULT_UNAVAILABLE",
  );
  assertExternalAlphaFactoryKeys(config);
  return database.atomic!(async (db) => {
    await db.query("SELECT set_config('myeve.missioncontrol_owner',$1,true)", [
      ownerId,
    ]);
    const [active] = await db.query(
      "SELECT owner_id FROM external_alpha_policy WHERE owner_id=$1 AND policy_sha256=$2 AND activated_at IS NOT NULL AND revoked_at IS NULL AND clock_timestamp()<activated_at+interval '120 hours' FOR SHARE",
      [ownerId, resultDigest(policy)],
    );
    requireValue(active, "APP_CAPABILITY_DENIED");
    const unresolved = await db.query(
      `SELECT 1 FROM external_alpha_operation o JOIN external_alpha_allowance a ON a.id=o.allowance_id WHERE a.owner_id=$1 AND o.state IN('PREPARED','DISPATCHED','UNKNOWN')
      UNION ALL SELECT 1 FROM external_alpha_allowance WHERE owner_id=$1 AND state='UNKNOWN'
      UNION ALL SELECT 1 FROM external_alpha_tool_effect WHERE owner_id=$1 AND state IN('ACCEPTED','UNKNOWN') LIMIT 1`,
      [ownerId],
    );
    requireValue(unresolved.length === 0, "APP_EVIDENCE_PENDING");
    const [row] = await db.query(
      `SELECT a.*,r.result_id,r.envelope,r.verdict,r.cleanup_confirmed,r.settlement_state,r.exposure_unknown,
      r.manifest_digest,r.ingest_sha256,r.candidate_sha,n.proof,n.content_hash,d.request_digest
      FROM external_alpha_work_authority a JOIN external_alpha_work_result r ON r.authority_id=a.id AND r.owner_id=a.owner_id AND r.work_id=a.work_id
      JOIN engineering_native_results n ON n.id=r.result_id AND n.scope_id=r.owner_id AND n.scope_kind='personal'
        AND n.work_id=r.work_id AND n.work_version=r.work_version AND n.work_generation=r.work_generation AND n.candidate_sha=r.candidate_sha
      JOIN external_alpha_work_dispatch d ON d.authority_id=a.id AND d.owner_id=a.owner_id AND d.policy_sha256=a.policy_sha256
      WHERE a.owner_id=$1 AND r.result_id=$2 AND a.policy_sha256=$3`,
      [ownerId, resultId, resultDigest(policy)],
    );
    requireValue(
      row &&
        row.state === "COMPLETED" &&
        row.verdict === "PASS" &&
        row.cleanup_confirmed === true &&
        row.settlement_state === "SETTLED" &&
        row.exposure_unknown === false,
      "APP_EVIDENCE_PENDING",
    );
    await db.query(
      "SELECT id FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' AND id=$2 FOR SHARE",
      [ownerId, row.work_id],
    );
    const store = new WorkStore(
      { scopeId: ownerId, scopeKind: "personal", actorId: ownerId },
      db,
    );
    const work = await store.get(row.work_id),
      readback = await readExternalAlphaWork(store, work);
    requireValue(
      readback?.result?.resultId === resultId &&
        readback.result.current &&
        readback.accounting.unknownMicrousd === 0 &&
        readback.accounting.reservedMicrousd === 0,
      "APP_EVIDENCE_PENDING",
    );
    requireValue(
      (work.lifecycle === "active" && work.control === "agent") ||
        (work.lifecycle === "accepted" && Boolean(readback.acceptance)),
      "APP_WORK_STALE",
    );
    requireValue(
      work.criteria.length === alphaTasksCriteria.length &&
        work.criteria.every(
          (c, i) =>
            c.statement === alphaTasksCriteria[i] && c.method === "test",
        ),
      "APP_RESULT_BINDING",
    );
    const signed = JSON.parse(row.envelope),
      manifest = JSON.parse(
        Buffer.from(signed.encoded, "base64url").toString("utf8"),
      );
    const verified = verifyExternalAlphaResult({
      database: db,
      policy,
      config,
      authority: readWorkAuthorityRecord(row),
      work,
      envelope: signed,
      verdictHint: row.verdict,
      expectedRequestDigest: row.request_digest,
      expectedRunId: manifest.execution.runId,
    });
    requireValue(
      verified.verdict === "PASS" &&
        verified.cleanupConfirmed &&
        verified.manifest.status === "COMPLETED" &&
        verified.proofHash === row.content_hash &&
        resultDigest(row.proof) === row.content_hash &&
        verified.ingestSha256 === row.ingest_sha256 &&
        resultDigest(verified.manifest) === row.manifest_digest &&
        verified.proof.criteriaVersion === work.criteriaVersion &&
        work.criteria.every((c) =>
          verified.proof.evidence.some(
            (e) =>
              e.criterionId === c.id &&
              e.state === "PASS" &&
              e.resultRevision === row.candidate_sha,
          ),
        ) &&
        verified.candidate.commit === row.candidate_sha,
      "APP_RESULT_BINDING",
    );
    const [enrollment] = await db.query(
      "SELECT missioncontrol_enrollment_document($1) AS document",
      [ownerId],
    );
    const permits = await db.query(
      `SELECT p.envelope,p.permit_sha256,b.binding,b.binding_sha256 FROM missioncontrol_execution_permits p
      JOIN missioncontrol_work_bindings b USING(owner_id,work_id,work_version,work_generation)
      WHERE p.owner_id=$1 AND p.work_id=$2 AND p.work_version=$3 AND p.work_generation=$4
        AND NOT EXISTS(SELECT 1 FROM missioncontrol_permit_controls c WHERE c.owner_id=p.owner_id AND c.permit_id=p.permit_id AND c.operation='revoke')
      ORDER BY p.created_at DESC LIMIT 1`,
      [ownerId, row.work_id, row.work_version, row.work_generation],
    );
    requireValue(permits.length === 1, "APP_MISSION_BINDING");
    const packet = executionPermitEnvelopeSchema.parse(permits[0].envelope);
    // Verify historical provenance at issuance; this never renews its execution window.
    const permit = verifyExecutionPermit(
      packet,
      enrollment?.document,
      {
        ownerId,
        workId: row.work_id,
        workVersion: row.work_version,
        workGeneration: row.work_generation,
        tupleSha256: alphaTasksTupleSha256,
        maxCostMicrousd: 1300000,
        maxDurationSeconds: 180,
      },
      packet.document.issuedAt,
    );
    requireValue(
      permit.permitSha256 === permits[0].permit_sha256 &&
        permit.document.admission.factoryVersion === policy.factoryVersion,
      "APP_MISSION_BINDING",
    );
    requireValue(
      permit.enrollment.expiresAt > Date.now(),
      "APP_MISSION_BINDING",
    );
    const {
      schema: _schema,
      permitId: _permit,
      issuedAt: _issued,
      expiresAt: _expires,
      enrollmentRevision: _revision,
      approvalId: _approval,
      approvalDigest: _approvalHash,
      ...binding
    } = permit.document;
    requireValue(
      resultDigest(binding) === permits[0].binding_sha256 &&
        resultDigest(permits[0].binding) === permits[0].binding_sha256,
      "APP_MISSION_BINDING",
    );
    const p = permit.document,
      e = verified.manifest.execution,
      c = verified.candidate;
    const origin = validateOrigin({
      ownerId,
      installationId: p.installationId,
      connectionId: p.connectionId,
      tenantId: p.tenantId,
      projectId: p.projectId,
      missionId: p.missionId,
      planId: p.planId,
      planDigest: p.planDigest,
      workOrderId: p.workOrderId,
      workOrderRevisionId: p.workOrderRevisionId,
      workId: work.id,
      workVersion: row.work_version,
      workGeneration: row.work_generation,
      tupleSha256: alphaTasksTupleSha256,
      permitDigest: permitDigest(p),
      resultId,
      resultDigest: row.manifest_digest,
      proofHash: row.content_hash,
      authorityId: row.id,
      authoritySha256: row.document_sha256,
      factoryWorkOrderId: e.workOrderId,
      attemptNumber: e.attemptNumber,
      requestId: e.requestId,
      requestDigest: e.requestDigest,
      runId: e.runId,
      factoryVersion: e.factoryVersion,
      sourceDigest: e.sourceDigest,
      configurationDigest: e.configurationDigest,
      inputCommit: e.inputCommit,
      inputTree: e.inputTree,
      candidateCommit: c.commit,
      candidateTree: c.tree,
      patchDigest: c.patchDigest,
    }) as Origin;
    return {
      origin,
      currentWork: { version: work.version, generation: work.generation },
      originalProof: row.proof,
      signedEnvelopeDigest: createHash("sha256")
        .update(row.envelope)
        .digest("hex"),
      acceptance: readback.acceptance ?? null,
    };
  });
}
