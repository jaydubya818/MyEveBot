import { isDeepStrictEqual } from "node:util";

import {
  draftLearningCandidate,
  learningCandidateSchema,
  learningProposalSchema,
  workFeedbackSchema,
  type LearningCandidate,
  type WorkFeedback,
} from "../digital-worker/learning.ts";
import { WorkStore } from "./store.ts";
import { WorkError } from "./types.ts";

export interface UnverifiedLearningDraft {
  feedbackClaim: WorkFeedback;
  candidate: LearningCandidate;
  status: "DRAFT_UNVERIFIED";
  trust: "ADVISORY_ONLY";
  createdAt: string;
}

const iso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);

function draftFromRow(row: Record<string, unknown>): UnverifiedLearningDraft {
  const feedbackClaim = workFeedbackSchema.parse(row.feedback_claim);
  const candidate = learningCandidateSchema.parse(row.candidate);
  const proposal = learningProposalSchema.parse({
    candidateId: candidate.candidateId,
    subject: candidate.subject,
    recommendation: candidate.recommendation,
    rationale: candidate.rationale,
    createdAt: candidate.createdAt,
  });
  const reconstructed = draftLearningCandidate(feedbackClaim, proposal);
  if (!isDeepStrictEqual(candidate, reconstructed) ||
      row.id !== candidate.candidateId || row.scope_id !== candidate.ownerId ||
      row.work_id !== candidate.sourceWorkId || Number(row.work_version) !== candidate.sourceWorkVersion ||
      row.repository !== candidate.applicability.repository ||
      row.work_shape !== candidate.applicability.workShape ||
      row.status !== "DRAFT_UNVERIFIED" || row.trust !== "ADVISORY_ONLY") {
    throw new WorkError("learning_draft_corrupt", "The learning draft no longer matches its persisted Work and source claim.");
  }
  return { feedbackClaim, candidate, status: "DRAFT_UNVERIFIED", trust: "ADVISORY_ONLY", createdAt: iso(row.created_at) };
}

/** Durable staging only. There is no qualification, promotion, model retrieval or
 * action/policy consumer here. Feedback provenance is explicitly unverified. */
export class EngineeringLearningDraftStore {
  constructor(readonly workStore: WorkStore) {}

  private owner() {
    const { scopeId, scopeKind, actorId } = this.workStore.principal;
    if (scopeKind !== "personal" || actorId !== scopeId)
      throw new WorkError("learning_scope", "Learning drafts require the current personal Work owner.", 403);
    return scopeId;
  }

  async stage(feedbackInput: unknown, proposalInput: unknown): Promise<UnverifiedLearningDraft> {
    const ownerId = this.owner();
    const feedback = workFeedbackSchema.parse(feedbackInput);
    const proposal = learningProposalSchema.parse(proposalInput);
    const candidate = draftLearningCandidate(feedback, proposal);
    const work = await this.workStore.get(feedback.workId);
    if (feedback.ownerId !== ownerId || feedback.scope.kind !== "personal" || feedback.scope.id !== ownerId ||
        feedback.workVersion !== work.version || feedback.repository !== work.repository)
      throw new WorkError("learning_work_changed", "Feedback does not match the current owner-scoped Work revision.");

    const rows = await this.workStore.database.query(
      `WITH scoped_work AS MATERIALIZED (
         SELECT w.scope_id,w.scope_kind,w.id,w.version,w.repository
         FROM engineering_work w
         WHERE w.scope_id=$1 AND w.scope_kind='personal' AND w.id=$2
           AND w.version=$3 AND w.repository=$4
         FOR SHARE OF w
       )
       INSERT INTO engineering_learning_drafts
         (id,scope_id,scope_kind,work_id,work_version,repository,work_shape,feedback_id,
          feedback_claim,candidate,content_hash)
       SELECT $5,w.scope_id,w.scope_kind,w.id,w.version,w.repository,$6,$7,$8::jsonb,$9::jsonb,$10
       FROM scoped_work w
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [ownerId, work.id, work.version, work.repository, candidate.candidateId,
        candidate.applicability.workShape, feedback.feedbackId,
        JSON.stringify(feedback), JSON.stringify(candidate), candidate.contentHash],
    );
    if (rows[0]) return draftFromRow(rows[0]);
    const existing = await this.workStore.database.query(
      `SELECT * FROM engineering_learning_drafts
       WHERE scope_id=$1 AND scope_kind='personal' AND id=$2 LIMIT 1`,
      [ownerId, candidate.candidateId],
    );
    if (existing[0]) {
      const draft = draftFromRow(existing[0]);
      if (isDeepStrictEqual(draft.feedbackClaim, feedback) && isDeepStrictEqual(draft.candidate, candidate)) return draft;
    }
    throw new WorkError("learning_draft_changed", "Work, feedback, or candidate identity changed. Reload before staging learning.");
  }

  async list(workId: string, limit = 25): Promise<UnverifiedLearningDraft[]> {
    this.owner();
    await this.workStore.get(workId);
    const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 25;
    const rows = await this.workStore.database.query(
      `SELECT * FROM engineering_learning_drafts
       WHERE scope_id=$1 AND scope_kind='personal' AND work_id=$2
       ORDER BY created_at DESC,id DESC LIMIT $3`,
      [this.workStore.principal.scopeId, workId, boundedLimit],
    );
    return rows.map(draftFromRow);
  }
}
