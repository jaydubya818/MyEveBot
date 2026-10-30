import type { JournalEvent } from "./journal.ts";

/**
 * Read-only projection of the durable journey journal for the owner. It reads retained facts only: no provider, ledger, Factory, verifier or
 * MyApps call and no authority. A claimed-but-unsettled operation is reported as in flight / uncertain, never as complete.
 */
export const STAGE_LABELS = { 1: "Plan and first coding", 2: "Second coding and reconciliation", 3: "Build and ordinary tests", 4: "Independent verification" } as const;
export type StageState = "PENDING" | "IN_PROGRESS" | "ACCEPTED" | "HALTED";
export type ProgressView = {
  state: "NOT_STARTED" | "IN_PROGRESS" | "HALTED" | "VERIFIED_NOT_DELIVERED" | "DELIVERED";
  stages: Array<{ stage: 1 | 2 | 3 | 4; label: string; state: StageState; candidate?: string; uncertainOperations?: number }>;
  haltedAt?: number; code?: string;
  /** Present only when the journey is DELIVERED: the exact accepted candidate an improvement is based on. */
  baseline?: { commit: string; tree: string; buildArtifactSha256: string; verdictSha256: string; deliverySha256: string };
};

export function projectProgress(events: JournalEvent[]): ProgressView {
  const last = events.at(-1);
  const halted = last && last.kind === "HALTED" ? last : undefined;
  const accepted = new Map<number, Extract<JournalEvent, { kind: "STAGE_ACCEPTED" }>>();
  for (const event of events) if (event.kind === "STAGE_ACCEPTED" && !accepted.has(event.stage)) accepted.set(event.stage, event);
  const touched = (stage: number) => events.some(e => e.kind !== "HALTED" && e.kind !== "DELIVERY_ACCEPTED" && "stage" in e && e.stage === stage);
  const uncertain = (stage: number) => {
    const settled = new Set(events.filter(e => e.kind === "OP_SETTLED" && e.stage === stage).map(e => (e as { key: string }).key));
    return events.filter(e => e.kind === "OP_CLAIMED" && e.stage === stage && !settled.has(e.key)).length;
  };
  let firstOpen: number | undefined;
  const stages = ([1, 2, 3, 4] as const).map(stage => {
    const record = accepted.get(stage);
    let state: StageState = "PENDING";
    if (record) state = "ACCEPTED";
    else if (halted?.stage === stage) state = "HALTED";
    else if (touched(stage) && firstOpen === undefined) state = "IN_PROGRESS";
    if (!record && firstOpen === undefined) firstOpen = stage;
    const open = uncertain(stage);
    return { stage, label: STAGE_LABELS[stage], state, ...(record?.candidate ? { candidate: record.candidate.commit.slice(0, 12) } : {}), ...(open && !record ? { uncertainOperations: open } : {}) };
  });
  const delivery = events.find((e): e is Extract<JournalEvent, { kind: "DELIVERY_ACCEPTED" }> => e.kind === "DELIVERY_ACCEPTED");
  const build = accepted.get(3);
  if (accepted.has(4) && delivery && build?.candidate && build.buildArtifactSha256)
    return { state: "DELIVERED", stages, baseline: { commit: build.candidate.commit, tree: build.candidate.tree, buildArtifactSha256: build.buildArtifactSha256,
      verdictSha256: delivery.verdictSha256, deliverySha256: delivery.digest } };
  if (accepted.has(4) && !halted) return { state: "VERIFIED_NOT_DELIVERED", stages };
  if (halted) return { state: "HALTED", stages, haltedAt: halted.stage, code: /^QDEV_[A-Z_]+$/.test(halted.code) ? halted.code : "QDEV_HALTED" };
  return { state: events.length === 0 ? "NOT_STARTED" : "IN_PROGRESS", stages };
}

/** Owner-readable text. Never claims readiness or authority. */
export function describeProgress(view: ProgressView, deliveryUrl?: string): string {
  const lines = view.stages.map(s => `${s.stage}. ${s.label}: ${s.state === "ACCEPTED" ? "accepted" : s.state === "HALTED" ? "stopped" : s.state === "IN_PROGRESS" ? "in progress" : "not started"}`
    + (s.candidate ? ` (candidate ${s.candidate})` : "") + (s.uncertainOperations ? ` — ${s.uncertainOperations} operation(s) started but not confirmed; nothing is resent automatically` : ""));
  const head = {
    NOT_STARTED: "The approved journey has not started.",
    IN_PROGRESS: "The approved journey is in progress.",
    HALTED: `The approved journey stopped at stage ${view.haltedAt} (${view.code}). Its history and accounting remain retained; no automatic retry was started.`,
    VERIFIED_NOT_DELIVERED: "The candidate passed independent verification, but delivery has not been confirmed yet.",
    DELIVERED: "The candidate passed independent verification and its delivery was confirmed.",
  }[view.state];
  return [head, lines.join("\n"),
    ...(view.baseline ? [`Verdict ${view.baseline.verdictSha256.slice(0, 12)} · delivery ${view.baseline.deliverySha256.slice(0, 12)} · candidate ${view.baseline.commit.slice(0, 12)}.`] : []),
    ...(view.state === "DELIVERED" && deliveryUrl ? [`[Open the delivered application](${deliveryUrl})`] : []),
    ...(view.state === "DELIVERED" ? ["To improve it, describe the change you want. I will record it against this exact delivered candidate as an unfunded proposal; nothing runs until a new funded scope is approved."] : []),
    "Release readiness and tester activation still require their own authorization."].join("\n\n");
}
