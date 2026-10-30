import { createHash } from "node:crypto";
import { QDEV_BASELINE } from "../external-alpha/qualification-accounting.ts";
import type { Work } from "../engineering/types.ts";
import type { ProgressView } from "./progress.ts";

/**
 * Post-delivery improvement proposal. It reuses the existing durable Work frontdoor (`WorkStore`) and records the owner's requested change
 * as a PAUSED Work bound to the exact accepted candidate. It is deliberately inert:
 *  - no ledger grant, reservation, provider, Relay, Factory, verifier or MyApps call is made, and the spent charter is neither reset nor reused;
 *  - `maxCostUsd` is the schema minimum and only a placeholder: a funded, owner-approved scope is a separate protected input;
 *  - the Work is created paused (database default) and is paused again if it was ever found running;
 *  - the same owner, delivered candidate and request text always map to the same Work (idempotent), and proposals per candidate are capped.
 */
export const MAX_IMPROVEMENTS_PER_BASELINE = 5;
export const MAX_IMPROVEMENT_REQUEST_CHARS = 2000;
export type ImprovementBaseline = NonNullable<ProgressView["baseline"]>;
export type ImprovementRecord = { workId: string; created: boolean };
export interface ImprovementRecorder {
  propose(input: { baseline: ImprovementBaseline; request: string }): Promise<ImprovementRecord>;
}
export class ImprovementRefused extends Error { constructor(readonly code: "QDEV_IMPROVEMENT_REQUEST" | "QDEV_IMPROVEMENT_LIMIT" | "QDEV_IMPROVEMENT_STATE") { super(code); } }
type Store = { list(): Promise<Work[]>; create(value: unknown): Promise<{ work: Work; created: boolean }>; change(id: string, value: unknown): Promise<Work> };

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const uuid = (seed: string) => { const h = sha(seed); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
export const normalizeImprovementRequest = (text: string) => text.replace(/\s+/g, " ").trim();

export function createImprovementRecorder(config: { ownerId: string; store: Store }): ImprovementRecorder {
  return { async propose({ baseline, request }) {
    const text = normalizeImprovementRequest(request);
    if (!text || text.length > MAX_IMPROVEMENT_REQUEST_CHARS) throw new ImprovementRefused("QDEV_IMPROVEMENT_REQUEST");
    const base = baseline.deliverySha256.slice(0, 12), req = sha(text).slice(0, 12);
    const title = `Improvement proposal (unfunded) [${base}] ${req}`;
    const existing = (await config.store.list()).filter(work => work.title.startsWith(`Improvement proposal (unfunded) [${base}]`));
    if (existing.length >= MAX_IMPROVEMENTS_PER_BASELINE && !existing.some(work => work.title === title)) throw new ImprovementRefused("QDEV_IMPROVEMENT_LIMIT");
    const { work, created } = await config.store.create({
      title,
      objective: [
        "IMPROVEMENT PROPOSAL — NOT STARTED, UNFUNDED. No spend, provider call, deployment or tester activation is authorized by this record.",
        `Requested change: ${text}`,
        `Based on the accepted delivered candidate: commit ${baseline.commit}, tree ${baseline.tree}, build artifact ${baseline.buildArtifactSha256}.`,
        `Independent verdict ${baseline.verdictSha256}; delivery evidence ${baseline.deliverySha256}.`,
        "The spent qualification charter is not reused. Running this change requires a new funded scope approved by the owner.",
      ].join("\n"),
      repository: QDEV_BASELINE.repository,
      criteria: [{ id: uuid(`criterion|${config.ownerId}|${baseline.deliverySha256}|${text}`), statement: `The owner accepts the requested change: ${text}`.slice(0, 1000), method: "human" }],
      maxCostUsd: 0.01,
      maxDurationSeconds: 60,
      idempotencyKey: uuid(`improvement|${config.ownerId}|${baseline.deliverySha256}|${text}`),
    });
    let current = work;
    if (current.lifecycle !== "active") throw new ImprovementRefused("QDEV_IMPROVEMENT_STATE");
    if (current.control !== "paused") current = await config.store.change(current.id, { operation: "pause", expectedVersion: current.version });
    if (current.control !== "paused") throw new ImprovementRefused("QDEV_IMPROVEMENT_STATE");
    return { workId: current.id, created };
  } };
}
