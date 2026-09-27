/** Disposable acceptance implementation, never imported by production routes. */
import { DatabaseSync } from "node:sqlite";
import { digest } from "../../../lib/capsules/format";
import { fixtureCandidates, freshDestination } from "../../../lib/capsules/fixtures";
import { previewActivation, portableDigest, validatePortableExperience, validateActivationRequest, preservesScope, type ActivationRequest, type ActivationSnapshot, type ActivationReceipt, type CanonicalActivation, type PortableExperience, type PortableScope, type QualificationEvidence } from "../../../lib/capsules/integration-contract";
export const phases = ["stage", "validate", "preview", "activate_begin", "activate_row", "activate_receipt", "activate_commit", "rollback_row", "rollback_receipt", "rollback_commit"] as const;
export type Phase = typeof phases[number];
export const scope = (): PortableScope => ({ ownerRef: freshDestination().ownerRef, projectId: null, repository: null, workType: null, workId: null });
export function records(): PortableExperience[] {
  return fixtureCandidates().map(({ item }) => {
    const sourceScope = { ...scope(), projectId: item.scope.type === "project" ? item.scope.id : null };
    const hash = digest(item);
    return { contractVersion: 1, item, scope: sourceScope, truth: "CURRENT", supersedesId: null, supersededById: null,
      classification: "PRIVATE_PORTABLE", provenance: [{ sourceId: item.provenance.sourceRef, revision: item.provenance.revision, contentHash: hash, origin: "OWNER", reference: item.provenance.sourceRef }],
      learning: item.kind === "learning" ? { familyId: "recovery", version: 1, hash, status: "PROMOTED", scope: sourceScope,
        evaluation: { evaluatorVersion: "work-summary-v1", candidateHash: hash, result: "PASS", evidenceRefs: ["synthetic-feedback-1"] } } : null };
  });
}
export function request(input = records().slice(0, 2)): ActivationRequest {
  return { id: "acceptance-batch", records: input, targetScope: scope(), expectedRevision: "0", selectedDigests: input.map(portableDigest) };
}
export class ActivationFixture implements CanonicalActivation {
  private db: DatabaseSync;
  constructor(private path: string, private checkpoint?: (phase: Phase) => void) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL);
      INSERT OR IGNORE INTO state VALUES (1,0);
      CREATE TABLE IF NOT EXISTS batches (id TEXT PRIMARY KEY, request TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS active (id TEXT PRIMARY KEY, batch TEXT NOT NULL, record TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, receipt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS qualifications (digest TEXT PRIMARY KEY, evidence TEXT NOT NULL);`);
  }
  async snapshot(): Promise<ActivationSnapshot> {
    const { revision } = this.db.prepare("SELECT revision FROM state WHERE id=1").get() as { revision: number };
    const rows = this.db.prepare("SELECT record FROM active ORDER BY id").all() as Array<{ record: string }>;
    return { revision: String(revision), ownerRef: scope().ownerRef, eveRef: "sofie-b", scope: scope(), current: rows.map(row => JSON.parse(row.record)) };
  }
  private load(id: string): ActivationRequest {
    const row = this.db.prepare("SELECT request FROM batches WHERE id=?").get(id) as { request: string } | undefined;
    if (!row) throw new Error("Missing staged batch"); return JSON.parse(row.request);
  }
  async stage(input: ActivationRequest) {
    input = validateActivationRequest(input);
    this.db.prepare("INSERT OR IGNORE INTO batches VALUES (?,?)").run(input.id, JSON.stringify(input));
    if (digest(this.load(input.id)) !== digest(input)) throw new Error("Batch identity collision");
    this.checkpoint?.("stage");
  }
  async validate(id: string) { await this.preview(id); this.checkpoint?.("validate"); }
  async preview(id: string) {
    const result = await previewActivation(this.load(id), await this.snapshot(), { read: async record => {
      const row = this.db.prepare("SELECT evidence FROM qualifications WHERE digest=?").get(portableDigest(record)) as { evidence: string } | undefined;
      return row ? JSON.parse(row.evidence) : null;
    } });
    this.checkpoint?.("preview"); return result;
  }
  async recover(id: string): Promise<ActivationReceipt | null> {
    const row = this.db.prepare("SELECT receipt FROM receipts WHERE id=?").get(id) as { receipt: string } | undefined;
    return row ? JSON.parse(row.receipt) : null;
  }
  async activate(id: string, reviewedDigest: string) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.checkpoint?.("activate_begin");
      const prior = await this.recover(id);
      if (prior) { this.db.exec("ROLLBACK"); return prior; }
      const preview = await this.preview(id);
      if (preview.reviewDigest !== reviewedDigest) throw new Error("Stale activation preview");
      const chosen = preview.rows.filter(row => preview.request.selectedDigests.includes(row.itemDigest));
      if (!chosen.length || chosen.some(row => row.state !== "eligible")) throw new Error("Every selected item must be eligible");
      for (const record of preview.request.records.filter(r => preview.request.selectedDigests.includes(portableDigest(r)))) {
        const narrowed = { ...record, scope: preview.request.targetScope,
          learning: record.learning ? { ...record.learning, scope: preview.request.targetScope } : null };
        this.db.prepare("INSERT INTO active VALUES (?,?,?)").run(record.item.id, id, JSON.stringify(narrowed));
        this.checkpoint?.("activate_row");
      }
      const receipt: ActivationReceipt = { id, revision: String(Number(preview.request.expectedRevision) + 1), count: chosen.length, result: "active" };
      this.db.prepare("UPDATE state SET revision=? WHERE id=1").run(Number(receipt.revision));
      this.db.prepare("INSERT INTO receipts VALUES (?,?)").run(id, JSON.stringify(receipt));
      this.checkpoint?.("activate_receipt"); this.db.exec("COMMIT"); this.checkpoint?.("activate_commit"); return receipt;
    } catch (error) { try { this.db.exec("ROLLBACK"); } catch {} throw error; }
  }
  async rollback(id: string) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const prior = await this.recover(id);
      if (!prior) throw new Error("No activation receipt");
      if (prior.result === "rolled_back") { this.db.exec("ROLLBACK"); return prior; }
      if ((await this.snapshot()).revision !== prior.revision) throw new Error("Later destination changes require recovery review");
      this.db.prepare("DELETE FROM active WHERE batch=?").run(id); this.checkpoint?.("rollback_row");
      const receipt: ActivationReceipt = { ...prior, result: "rolled_back", revision: String(Number(prior.revision) + 1) };
      this.db.prepare("UPDATE state SET revision=? WHERE id=1").run(Number(receipt.revision));
      this.db.prepare("UPDATE receipts SET receipt=? WHERE id=?").run(JSON.stringify(receipt), id);
      this.checkpoint?.("rollback_receipt"); this.db.exec("COMMIT"); this.checkpoint?.("rollback_commit"); return receipt;
    } catch (error) { try { this.db.exec("ROLLBACK"); } catch {} throw error; }
  }
  async seedCurrent(input: PortableExperience[]) {
    for (const record of input) this.db.prepare("INSERT OR REPLACE INTO active VALUES (?, 'local', ?)").run(record.item.id, JSON.stringify(validatePortableExperience(record)));
    this.db.exec("UPDATE state SET revision=revision+1 WHERE id=1");
  }
  async qualify(record: PortableExperience, target = scope(), overrides: Partial<QualificationEvidence> = {}) {
    const evidence: QualificationEvidence = { itemDigest: portableDigest(record), destinationEveRef: "sofie-b", targetScopeDigest: digest(target), qualifierVersion: "fixture-qualifier-v1", result: "PASS", ...overrides };
    this.db.prepare("INSERT OR REPLACE INTO qualifications VALUES (?,?)").run(portableDigest(record), JSON.stringify(evidence));
  }
  async retrieve(target: PortableScope) { return (await this.snapshot()).current.filter(record => preservesScope(record.scope, target)); }
  async restart() { this.db.close(); this.db = new DatabaseSync(this.path); }
  async close() { this.db.close(); }
}
