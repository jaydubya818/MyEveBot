import { externalAlphaInstallation } from "./policy.ts";

/** Every model-backed (paid) path in MyEve and its disposition under an
 * external-alpha installation. A path is either INTEGRATED into the bounded
 * shared ledger (migration 0085/0086), DENIED (fail closed), or NOT_PAID
 * (provably no provider inference). paid-paths.test.ts scans the source tree
 * and fails when a dispatch site is not listed here. */
export type PaidPathDisposition = "INTEGRATED" | "DENIED" | "NOT_PAID";
export interface PaidPath {
  id: string;
  files: readonly string[];
  disposition: PaidPathDisposition;
  note: string;
}
export const externalAlphaPaidPaths: readonly PaidPath[] = Object.freeze([
  { id: "sofie-chat", files: ["lib/external-alpha/model.ts"], disposition: "INTEGRATED", note: "CHAT allowance: durable reserve before dispatch, settle, UNKNOWN fence; 10 turns/day, 2 operations and $0.10 per turn." },
  { id: "factory-productive-and-completion", files: ["lib/external-alpha/work-authority.ts", "lib/external-alpha/work-controller.ts"], disposition: "INTEGRATED", note: "Dispatched only by the Factory under a single-use authority (3 operations, $1.00); every operation recorded into the same allowance by external_alpha_factory_record, UNKNOWN retained, over-bound fences." },
  { id: "agent-model-selection", files: ["agent/agent.ts"], disposition: "INTEGRATED", note: "Under an external-alpha installation the selector may only return the budgeted external-alpha model or the deterministic evidence summary; any other model, including a plain gateway id, is refused." },
  { id: "partner-private-model", files: ["agent/lib/partner-model.ts"], disposition: "DENIED", note: "Private partner conversation model; unbudgeted." },
  { id: "engineering-conversation-model", files: ["lib/engineering/conversation-model.ts"], disposition: "DENIED", note: "Canary/alpha Work conversation budget; separate ledger." },
  { id: "engineering-native-model", files: ["lib/engineering/native-model.ts"], disposition: "DENIED", note: "Native execution and completion model; separate ledger." },
  { id: "owner-channel-model", files: ["lib/relay/owner/model.ts"], disposition: "DENIED", note: "Owner-channel Relay model; separate budget." },
  { id: "relay-peer-reply", files: ["lib/relay/message-reply.ts"], disposition: "DENIED", note: "Relay peer-reply caller." },
  { id: "relay-work-model", files: ["lib/relay/work.ts"], disposition: "DENIED", note: "Relay Work model call." },
  { id: "decision-intelligence-jev", files: ["lib/decision-intelligence/jev-provider.ts"], disposition: "DENIED", note: "Jev evaluation through the Gateway." },
  { id: "business-ask", files: ["app/api/business/ask/route.ts"], disposition: "DENIED", note: "Business ask route (generateText)." },
  { id: "voice-realtime-call", files: ["lib/voice/realtime.ts"], disposition: "DENIED", note: "OpenAI Realtime call." },
  { id: "voice-client-secret", files: ["agent/lib/effect/voice.ts"], disposition: "DENIED", note: "OpenAI Realtime client secret minting." },
  { id: "computer-use-loop", files: ["agent/lib/computer-use-loop.ts"], disposition: "DENIED", note: "Computer-use tool loop agent." },
  { id: "qualification-model", files: ["lib/qualification/client.ts"], disposition: "DENIED", note: "Permit-gated qualification model hook." },
  { id: "retained-summary", files: ["agent/lib/retained-work-summary.ts"], disposition: "NOT_PAID", note: "Deterministic canonical-evidence text, zero tokens, no provider." },
  { id: "cloud-conversation-model", files: ["lib/engineering/cloud-conversation-model.ts"], disposition: "NOT_PAID", note: "Deterministic cloud qualification model (paidModelOperations: 0); type-only gateway import." },
  { id: "model-catalog", files: ["app/api/models/route.ts", "lib/readiness.ts", "agent/lib/gateway-models.ts"], disposition: "NOT_PAID", note: "Read-only model catalog/readiness requests; no inference." },
  { id: "embeddings", files: [], disposition: "NOT_PAID", note: "MyEve has no embedding calls; Knowledge and Memory use PostgreSQL full-text search." },
] satisfies PaidPath[]);

export class ExternalAlphaPaidPathDenied extends Error {
  constructor(readonly pathId: string) {
    super("EXTERNAL_ALPHA_PAID_PATH_DENIED:" + pathId);
  }
}
export function externalAlphaPaidPathDenied(
  pathId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return externalAlphaInstallation(env);
}
/** First statement of every denied dispatch site. Absent policy cannot reopen it:
 * the installation name alone is enough to deny. */
export function denyExternalAlphaPaidPath(
  pathId: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (externalAlphaPaidPathDenied(pathId, env))
    throw new ExternalAlphaPaidPathDenied(pathId);
}
