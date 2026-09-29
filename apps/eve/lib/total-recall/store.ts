import { WorkStore } from "../engineering/store.ts";
import { assertLearningFamily, assertSafeEvidence, behaviors, candidateHash, digest, familyId, feedbackInput, transitionLearning,
  type FeedbackInput, type LearningFamily, type LearningCommand, type LearningScope } from "./learning.ts";

/** Requires a server-authenticated personal Work owner. Never use a model-supplied principal. */
export class LearningStore {
  constructor(readonly work: WorkStore) {
    if (work.principal.scopeKind !== "personal" || work.principal.actorId !== work.principal.scopeId) throw new Error("Learning requires the personal Work owner.");
  }
  private get owner() { return this.work.principal.scopeId; }
  async get(id: string): Promise<LearningFamily | null> {
    const [row] = await this.work.database.query(`SELECT document FROM recall_learning WHERE owner_id=$1 AND id=$2`, [this.owner, id]);
    if (row) assertLearningFamily(row.document,this.owner);
    return row?.document ?? null;
  }
  async list(): Promise<LearningFamily[]> {
    const rows = await this.work.database.query(`SELECT document FROM recall_learning WHERE owner_id=$1 ORDER BY updated_at DESC,id LIMIT 25`, [this.owner]);
    return rows.map(r => { assertLearningFamily(r.document,this.owner); return r.document; });
  }
  async feedback(value: unknown): Promise<LearningFamily> {
    const input = feedbackInput.parse(value);
    assertSafeEvidence(JSON.stringify(input));
    if (input.correctionOf && input.replacesVersion) throw new Error("Choose correction or qualified replacement, not both.");
    const work = await this.work.get(input.workId);
    if (work.version !== input.workVersion) throw new Error("Work changed; reload before recording feedback.");
    // Snapshot content also passes secret exclusion; it is never guidance.
    assertSafeEvidence(JSON.stringify({ objective: work.objective, criteria: work.criteria }));
    const scope: LearningScope = { ownerId: this.owner, repository: work.repository, workType: input.workType,
      workId: input.scope === "WORK" ? work.id : null };
    const id = familyId(scope);
    for (let attempt = 0; attempt < 6; attempt++) {
      const old = await this.get(id);
      const family: LearningFamily = old ? structuredClone(old) : { id, revision: 0, scope, versions: [], events: [] };
      const duplicate = family.versions.flatMap(v => v.evidence).find(e => e.eventId === input.eventId);
      if (duplicate) {
        if (duplicate.note !== input.note || duplicate.type !== input.type || duplicate.targetRef !== input.targetRef || duplicate.workId !== work.id || duplicate.workVersion !== work.version ||
            !family.versions.some(v => v.evidence.includes(duplicate) && v.behavior === input.behavior && v.correctionOf === (input.correctionOf ?? null) && (v.replacesVersion ?? null) === (input.replacesVersion ?? null))) throw new Error("Feedback event identity changed.");
        return family;
      }
      if (family.events.length >= 400 || family.versions.length >= 40) throw new Error("Learning history needs operator archival before more versions.");
      const prior = input.correctionOf ? family.versions.find(v => v.version === input.correctionOf) : null;
      if (input.correctionOf && (!prior || prior.status !== "PROMOTED")) throw new Error("Correction must name the active version.");
      const replaces = input.replacesVersion ? family.versions.find(v => v.version === input.replacesVersion) : null;
      if (input.replacesVersion && (!replaces || replaces.status !== "PROMOTED")) throw new Error("Replacement must name the active version.");
      // Same proposed behavior adds evidence to a candidate only; evaluated and
      // promoted versions are immutable and new evidence creates a new version.
      let candidate = family.versions.find(v => v.status === "CANDIDATE" && !v.evaluation && v.behavior === input.behavior && v.correctionOf === (input.correctionOf ?? null) && (v.replacesVersion ?? null) === (input.replacesVersion ?? null));
      if (!candidate) {
        const version = family.versions.length + 1;
        candidate = { version, behavior: input.behavior, status: "CANDIDATE", hash: candidateHash(scope, version, input.behavior, input), evidence: [], evaluation: null, reason: null, correctionOf: input.correctionOf ?? null, replacesVersion: input.replacesVersion ?? null, createdAt: new Date().toISOString() };
        family.versions.push(candidate);
      }
      if (family.versions.reduce((count, v) => count + v.evidence.length, 0) >= 100) throw new Error("Evidence limit reached for this candidate.");
      const now = new Date().toISOString();
      candidate.evidence.push({ eventId: input.eventId, workId: work.id, workVersion: work.version, target: input.target, targetRef: input.targetRef, type: input.type, note: input.note,
        actorId: this.owner, recordedAt: now, provenance: "authenticated_owner_feedback", objective: work.objective.slice(0, 1000), criteria: { version: work.criteriaVersion, ref: `engineering-criteria:${work.id}:v${work.criteriaVersion}`, hash: digest(work.criteria) } });
      // A correction withdraws obsolete guidance immediately, before evaluation
      // of the replacement. Failed replacements never restore the wrong rule.
      if (prior) { prior.status = "SUPERSEDED"; prior.reason = "Owner correction pending evaluation."; }
      family.events.push({ id: input.eventId, kind: "feedback", version: candidate.version, actorId: this.owner, at: now, reason: input.type });
      family.revision++;
      if (await this.save(family, old?.revision ?? 0, { id: work.id, version: work.version })) return family;
    }
    throw new Error("Concurrent feedback changed; reload and retry with the same event identity.");
  }
  private async save(family: LearningFamily, revision: number, work?: { id: string; version: number }): Promise<boolean> {
    const rows = await this.work.database.query(
      `INSERT INTO recall_learning(owner_id,id,repository,work_type,work_id,revision,document)
       SELECT $1,$2,$3,$4,$5,$6,$7::jsonb
       WHERE $9::uuid IS NULL OR EXISTS (SELECT 1 FROM engineering_work
         WHERE scope_id=$1 AND scope_kind='personal' AND id=$9 AND version=$10 FOR SHARE)
       ON CONFLICT(owner_id,id) DO UPDATE SET document=EXCLUDED.document,revision=EXCLUDED.revision,updated_at=now()
       WHERE recall_learning.revision=$8 RETURNING id`,
      [this.owner, family.id, family.scope.repository, family.scope.workType, family.scope.workId, family.revision, JSON.stringify(family), revision, work?.id ?? null, work?.version ?? null]);
    return rows.length === 1;
  }
  async command(id: string, revision: number, command: LearningCommand, workBinding?: { id: string; version: number }): Promise<LearningFamily> {
    const old = await this.get(id);
    if (!old) throw new Error("Learning not found.");
    const replay = old.events.some(e => e.id === command.eventId);
    if (!replay && old.revision !== revision) throw new Error("Learning changed; reload before deciding.");
    if (old.events.length >= 400) throw new Error("Learning history needs operator archival.");
    const next = transitionLearning(old, command, this.owner, new Date().toISOString());
    if (next.revision === old.revision) return next;
    if (!await this.save(next, old.revision, workBinding)) throw new Error("Learning changed concurrently; reload before deciding.");
    return next;
  }
  /** Retrieval and its usage receipt share one statement and lock. Work identity
   * comes from the authenticated current Work, never candidate text. */
  async retrieve(workId: string, workType: FeedbackInput["workType"], contextRef: string) {
    const work = await this.work.get(workId);
    // Validate the matching aggregates before receipt creation, including
    // provenance and malicious historical evidence, not merely display text.
    const matching = await this.work.database.query(`SELECT document FROM recall_learning WHERE owner_id=$1 AND repository=$2 AND work_type=$3 AND (work_id IS NULL OR work_id=$4)`,[this.owner,work.repository,workType,work.id]);
    matching.forEach(row => assertLearningFamily(row.document,this.owner));
    if (!contextRef || contextRef.length > 200) throw new Error("A bounded context receipt identity is required.");
    const rows = await this.work.database.query(
      `WITH eligible AS MATERIALIZED (
         SELECT l.* FROM recall_learning l
         WHERE l.owner_id=$1 AND l.repository=$2 AND l.work_type=$3 AND (l.work_id IS NULL OR l.work_id=$4)
           AND EXISTS (SELECT 1 FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' AND id=$4 AND version=$6)
         ORDER BY l.work_id NULLS LAST,l.id LIMIT 2 FOR SHARE OF l
       ), active AS MATERIALIZED (
         SELECT e.id,e.document,v AS version FROM eligible e, jsonb_array_elements(e.document->'versions') v
         WHERE v->>'status'='PROMOTED' AND v->'evaluation'->>'result'='PASS'
           AND v->'evaluation'->>'candidateHash'=v->>'hash'
       ), selected AS MATERIALIZED (
         SELECT * FROM active WHERE (SELECT count(DISTINCT version->>'behavior') FROM active)=1
       ), used AS (
         INSERT INTO recall_learning_uses(owner_id,work_id,family_id,version,candidate_hash,context_ref)
         SELECT $1,$4,id,(version->>'version')::integer,version->>'hash',$5 FROM selected
         ON CONFLICT DO NOTHING RETURNING family_id
       ) SELECT jsonb_build_object('scope',document->'scope','id',id) AS document,version FROM selected`,
      [this.owner, work.repository, workType, work.id, contextRef, work.version]);
    // If Work and repository guidance conflict, neither is silently selected.
    if (new Set(rows.map(r => r.version.behavior)).size > 1) return [];
    return rows.map(row => {
      const family = row.document as LearningFamily;
      const v = row.version as LearningFamily["versions"][number];
      if (v.hash !== candidateHash(family.scope, v.version, v.behavior, v) || v.evaluation?.candidateHash !== v.hash || v.evaluation.result !== "PASS") throw new Error("Learning evidence is invalid.");
      return { id: family.id, version: v.version, hash: v.hash, scope: family.scope, behavior: v.behavior, guidance: behaviors[v.behavior], evidence: v.evidence.map(e => ({ workId: e.workId, workVersion: e.workVersion, eventId: e.eventId, provenance: e.provenance })), trust: "ADVISORY_ONLY" as const };
    });
  }
}
