import { WorkStore } from "./store.ts";
import { FactoryReceiptStore } from "./factory-receipt-store.ts";
import { FactoryEvidenceClient, evidenceKinds, verifySignedEvidence, verifyEvidence, type EvidenceBinding } from "./factory-evidence.ts";
import { digest } from "./contract.ts";
import { WorkError } from "./types.ts";

/** Immutable bytes scoped to the same owner, Work, signed receipt and candidate as Proof. */
export class FactoryEvidenceStore {
  constructor(readonly store: WorkStore) {}
  private scope(id: string) { return [this.store.principal.scopeId, this.store.principal.scopeKind, id]; }
  async ingest(id: string, requestId: string, receiptId: string, client: FactoryEvidenceClient) {
    const work = await this.store.get(id), receipts = new FactoryReceiptStore(this.store.principal, this.store.database);
    const request = await receipts.request(requestId), receipt = await receipts.get(requestId, receiptId), admission = await receipts.admission(requestId);
    const b = request.binding, candidate = receipt.provenance?.manifest.candidate;
    if (!request.eligible || b.workId !== id || b.workVersion !== work.version || b.workGeneration !== work.generation || receipt.state !== "ADMITTED" || admission?.receipt_id !== receiptId || !candidate)
      throw new WorkError("factory_evidence_authority", "Current admitted candidate receipt is required.");
    const binding: EvidenceBinding = { ownerScope: this.store.principal.scopeId, repository: work.repository, workId: id, workGeneration: work.generation,
      requestId: b.requestId, workOrderId: b.workOrderId, runId: b.runId, candidateCommit: candidate.commit, factoryVersion: b.factoryVersion };
    const prior = await this.list(id, candidate.commit, receiptId);
    if (prior.length === evidenceKinds.length) return prior;
    for (const evidence of await client.collect(binding)) {
      verifySignedEvidence(evidence, receipt.provenance!.manifest);
      await this.store.database.query(`INSERT INTO engineering_factory_evidence(scope_id,scope_kind,work_id,receipt_id,candidate_sha,reference,binding,metadata,bytes)
        SELECT $1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9
        FROM engineering_work w JOIN engineering_direct_workspaces n ON n.scope_id=w.scope_id AND n.scope_kind=w.scope_kind AND n.work_id=w.id
        JOIN engineering_factory_requests q ON q.scope_id=w.scope_id AND q.scope_kind=w.scope_kind AND q.work_id=w.id
        JOIN engineering_factory_admissions a ON a.request_id=q.id AND a.receipt_id=$4
        WHERE w.scope_id=$1 AND w.scope_kind=$2 AND w.id=$3 AND w.version=$10 AND w.generation=$11 AND w.lifecycle='active' AND w.control='agent'
          AND q.id=$12 AND q.current AND NOT q.cancelled AND q.actor_id=$13
          AND n.candidates->-1->>'sha'=$5 AND n.candidates->-1->'factoryProvenance'->>'receiptId'=$4::text
        ON CONFLICT(scope_id,scope_kind,work_id,candidate_sha,reference) DO NOTHING`,
        [...this.scope(id), receiptId, candidate.commit, evidence.proofReference, JSON.stringify(binding), JSON.stringify(evidence.ref), evidence.bytes, work.version, work.generation, requestId, this.store.principal.actorId]);
    }
    const retained = await this.list(id, candidate.commit, receiptId);
    if (retained.length !== evidenceKinds.length) throw new WorkError("factory_evidence_stale", "Work changed before evidence custody completed.");
    return retained;
  }
  async list(id: string, candidate: string, receiptId: string) {
    const work = await this.store.get(id);
    const rows = await this.store.database.query(`SELECT binding,metadata,reference,bytes FROM engineering_factory_evidence
      WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND candidate_sha=$4 AND receipt_id=$5 ORDER BY reference`, [...this.scope(id), candidate, receiptId]);
    if (!rows.length) return [];
    const [receipt] = await this.store.database.query(`SELECT r.provenance FROM engineering_factory_receipts r
      JOIN engineering_factory_requests q ON q.id=r.request_id JOIN engineering_factory_admissions a ON a.request_id=q.id AND a.receipt_id=r.id
      WHERE r.id=$4 AND r.state='ADMITTED' AND q.scope_id=$1 AND q.scope_kind=$2 AND q.work_id=$3`, [...this.scope(id), receiptId]);
    if (!receipt?.provenance?.manifest) throw new WorkError("factory_evidence_integrity", "Admitted receipt is unavailable.");
    const result = rows.map(row => {
      const b = row.binding as EvidenceBinding;
      if (b.ownerScope !== this.store.principal.scopeId || b.repository !== work.repository || b.workId !== id || b.candidateCommit !== candidate) throw new WorkError("factory_evidence_integrity", "Evidence custody binding changed.");
      const evidence = verifyEvidence({ scope: { ownerScope: b.ownerScope, repository: b.repository, workId: id, workGeneration: b.workGeneration, requestId: b.requestId },
        ref: row.metadata, proofReference: row.reference, base64: Buffer.from(row.bytes).toString("base64") },
        { ...b, evidenceReference: row.reference, expectedDigest: row.metadata.sha256, evidenceKind: row.metadata.kind });
      verifySignedEvidence(evidence, receipt.provenance.manifest);
      return evidence;
    });
    if (result.length > 2 || new Set(result.map(e => e.ref.kind)).size !== result.length) throw new WorkError("factory_evidence_integrity", "Duplicate evidence kinds in custody.");
    return result;
  }
  async readProof(id: string, resultId: string, reference: string) {
    await this.store.get(id);
    const [row] = await this.store.database.query(`SELECT r.proof,r.content_hash,e.receipt_id FROM engineering_native_results r
      JOIN engineering_factory_evidence e ON e.scope_id=r.scope_id AND e.scope_kind=r.scope_kind AND e.work_id=r.work_id AND e.candidate_sha=r.candidate_sha
      WHERE r.scope_id=$1 AND r.scope_kind=$2 AND r.work_id=$3 AND r.id=$4 AND e.reference=$5 AND r.proof->'artifactRefs' ? $5`, [...this.scope(id), resultId, reference]);
    if (!row || digest(row.proof) !== row.content_hash) throw new WorkError("factory_evidence_missing", "Evidence is not available in this Proof.", 404);
    const evidence = (await this.list(id, row.proof.resultRevision, row.receipt_id)).find(e => e.proofReference === reference);
    if (!evidence) throw new WorkError("factory_evidence_missing", "Evidence is not available in this Proof.", 404);
    return evidence;
  }
}
