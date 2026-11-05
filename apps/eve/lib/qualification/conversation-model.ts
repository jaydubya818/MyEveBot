import { createHash } from "node:crypto";
import type { gateway } from "ai";
import { z } from "zod";
import type { QdevConversation } from "./root.ts";
import type { JournalEvent } from "./journal.ts";
import { ImprovementRefused, type ImprovementRecorder } from "./improvement.ts";
import { describeProgress, projectProgress } from "./progress.ts";
import { VERDICT_ASSURANCE, type VerdictAssurance } from "./journey-profile.ts";

type Model = ReturnType<typeof gateway>;
type Options = Parameters<Model["doGenerate"]>[0];
type Result = Awaited<ReturnType<Model["doGenerate"]>>;
type Part = Awaited<ReturnType<Model["doStream"]>>["stream"] extends ReadableStream<infer P> ? P : never;
const TOOL = "qualification_journey";
const unverified = "The journey response could not be verified for this conversation. Review its retained history; no automatic retry was started.";
const pending = "The approved journey was already requested. Its response is pending or unavailable. Review its retained history; no automatic retry was started.";
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const presentation = z.object({
  status: z.enum(["COMPLETED_UNCLAIMED", "HALTED"]), readiness: z.literal("NOT_CLAIMED"), authority: z.literal("NONE"),
  stages: z.array(z.object({ stage: z.number().int().min(1).max(4), candidate: z.string().regex(/^[a-f0-9]{12}$/).optional() }).strict()).max(4),
  verdictSha256: sha.optional(), deliverySha256: sha.optional(), haltedAt: z.number().int().min(1).max(4).optional(),
  code: z.string().regex(/^QDEV_[A-Z_]+$/).max(100).optional(),
  assurance: z.enum(VERDICT_ASSURANCE).optional(),
  usage: z.object({ metering: z.literal("SUBSCRIPTION_UNMETERED"), operations: z.number().int().min(0).max(1000), runs: z.number().int().min(1).max(3) }).strict().optional(),
}).strict();

export type QualificationConversationConfig = {
  ownerId: string;
  /** Explicit host-approved request text for this frozen journey; other requests cannot select an execution tool. Exclusive with `ownerRequest`. */
  approvedRequest?: string;
  /**
   * Private-beta owner-local installation: any owner request is DERIVED into a plan (pure, deterministic, no provider), proposed back with its plan
   * digest, and runs only after the owner replies `confirm <first 12 hex of the plan digest>` to that exact proposal. Exclusive with `approvedRequest`.
   */
  ownerRequest?: { derive(text: string): OwnerRequestDerivation | null };
  /** Must equal the pinned MyApps observer URL. Used only after a complete verified delivery presentation. */
  deliveryUrl?: string;
  /** Read-only current owner/enrollment/expiry/revocation check. It must never invoke a provider. */
  revalidate(input: { ownerId: string; sessionId: string; stepKey: string }): Promise<boolean>;
  /** Optional read-only view of the retained journey journal. Enables progress answers; it never reaches a provider and grants nothing. */
  retained?(): Promise<JournalEvent[]>;
  /** Optional recorder for post-delivery improvement proposals. It records an inert, unfunded proposal only; it never starts, funds or resumes work. */
  improvements?: ImprovementRecorder;
};

function result(content: Result["content"], toolCall = false): Result {
  return { content, finishReason: { unified: toolCall ? "tool-calls" : "stop", raw: toolCall ? "tool_calls" : "stop" },
    usage: { inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 0, text: 0, reasoning: 0 } },
    warnings: [], providerMetadata: { qdev: { kind: "DETERMINISTIC", paidModelOperations: 0 } } };
}
const textResult = (text: string) => result([{ type: "text", text }]);

export type OwnerRequestDerivation = { request: string; requestSha256: string; planSha256: string; repository: string; environment: string; cohortId: string;
  /** True when the template's stage 1 has no SOFIE operation: planning happens inside the stage-1 MyFactory run (no MyEve model call). */
  planningInFactory?: boolean };

function present(value: unknown, deliveryUrl: string | undefined, assurance: VerdictAssurance, subject = "The approved journey"): string {
  const parsed = presentation.safeParse(value);
  if (!parsed.success) return unverified;
  const p = parsed.data;
  if (p.status === "HALTED" ? p.assurance !== undefined : p.assurance !== assurance) return unverified;
  // Unmetered usage is reported in operations, never as a money amount or $0.
  const usage = p.usage ? `Subscription usage: ${p.usage.operations} operation${p.usage.operations === 1 ? "" : "s"} across ${p.usage.runs} Factory run${p.usage.runs === 1 ? "" : "s"} (unmetered; no cost is recorded).` : null;
  if (p.stages.some((s, i) => s.stage !== i + 1)) return unverified;
  if (p.status === "HALTED") {
    if (!p.haltedAt || !p.code || p.stages.length > p.haltedAt || p.verdictSha256 || p.deliverySha256) return unverified;
    return [`${subject} stopped at stage ${p.haltedAt} (${p.code}). Completed stage records: ${p.stages.length}. Its history and accounting remain retained; no automatic retry was started.`, ...(usage ? [usage] : [])].join("\n\n");
  }
  if (p.stages.length !== 4 || !p.verdictSha256 || !p.deliverySha256 || p.haltedAt !== undefined || p.code !== undefined) return unverified;
  return [`${subject} completed all four stages.`,
    assurance === "INDEPENDENT" ? `Independent verdict: ${p.verdictSha256}. Delivery evidence: ${p.deliverySha256}.`
      : `Local verifier verdict (assurance PRIVATE_BETA_LOCAL: an owner-local verifier on this machine, NOT independent custody): ${p.verdictSha256}. Delivery evidence: ${p.deliverySha256}.`,
    ...(usage ? [usage] : []),
    ...(deliveryUrl ? [`[Open the delivered application](${deliveryUrl})`] : []),
    "Release readiness and tester activation still require their own authorization."].join("\n\n");
}

const statusIntent = /^\s*(status|progress|where (are we|is it)|how (is|'s) (it|the (journey|build|project|app)) (going|doing))\b/i;
const improveIntent = /^\s*(improve|improvement|change|add|fix|update|make|remove|support|show|let|rename|redesign)\b/i;
const improvementRefusal: Record<string, string> = {
  QDEV_IMPROVEMENT_REQUEST: "That improvement request is empty or too long (2000 characters at most). Nothing was recorded.",
  QDEV_IMPROVEMENT_LIMIT: "This delivered candidate already has the maximum number of recorded improvement proposals. Nothing new was recorded.",
  QDEV_IMPROVEMENT_STATE: "The improvement proposal could not be confirmed as paused, so it is not reported as recorded.",
};

/** Free outer orchestration only. The authenticated tool/root and journey gate own every effect and every charged call.
 * No SDK provider, fallback, compaction, delegation or original-ledger access exists in this model. */
export function qualificationConversation(config: QualificationConversationConfig): QdevConversation {
  const ownerId = z.string().min(1).max(255).parse(config.ownerId);
  const revalidate = config.revalidate;
  if (typeof revalidate !== "function" || (config.approvedRequest === undefined) === (config.ownerRequest === undefined)) throw Error("QDEV_CONVERSATION_CONFIGURATION");
  if (config.ownerRequest) {
    if (typeof config.ownerRequest.derive !== "function" || config.retained || config.improvements) throw Error("QDEV_CONVERSATION_CONFIGURATION");
    return ownerRequestConversation(ownerId, revalidate, config.ownerRequest.derive, deliveryUrlOf(config.deliveryUrl, true));
  }
  const approvedRequest = z.string().trim().min(1).max(4000).parse(config.approvedRequest);
  const deliveryUrl = deliveryUrlOf(config.deliveryUrl);
  const retained = config.retained, improvements = config.improvements;
  /** Owner questions outside the approved request: read-only progress, and an inert unfunded improvement proposal after confirmed delivery. */
  async function ownerReply(text: string | undefined): Promise<string> {
    const fallback = `This installation runs only its approved journey. Send: ${approvedRequest}`;
    if (!retained || text === undefined) return fallback;
    let view;
    try { view = projectProgress(await retained()); } catch { return `${fallback}\n\nRetained progress is unavailable right now; nothing was started.`; }
    if (improveIntent.test(text) && !statusIntent.test(text)) {
      if (view.state !== "DELIVERED" || !view.baseline) return `${describeProgress(view, deliveryUrl)}\n\nAn improvement can be requested only after this journey's delivery is confirmed. Nothing was recorded.`;
      if (!improvements) return "Improvement proposals are not enabled for this installation. Nothing was recorded.";
      try {
        const { workId, created } = await improvements.propose({ baseline: view.baseline, request: text });
        return [`${created ? "Recorded" : "Already recorded"} as a paused, unfunded improvement proposal (Work ${workId}) based on the delivered candidate ${view.baseline.commit.slice(0, 12)} (delivery ${view.baseline.deliverySha256.slice(0, 12)}).`,
          "Nothing was started, and no spend, provider call, deployment or tester activation is authorized. The spent charter is not reused; running this change needs a new funded scope approved by the owner."].join("\n\n");
      } catch (error) { return error instanceof ImprovementRefused ? improvementRefusal[error.code] : "The improvement request could not be recorded. Nothing was started."; }
    }
    return statusIntent.test(text) || view.state === "DELIVERED" || view.state === "IN_PROGRESS" ? describeProgress(view, deliveryUrl) : `${describeProgress(view, deliveryUrl)}\n\n${fallback}`;
  }
  return { ownerId, contextWindowTokens: 200_000, model(input) {
    const identity = z.object({ sessionId: z.string().min(1).max(255), stepKey: z.string().min(1).max(1000) }).strict().parse(input);
    const binding = { ownerId, ...identity };
    async function generate(options: Options): Promise<Result> {
      options.abortSignal?.throwIfAborted();
      let current = false;
      try { current = await revalidate({ ...binding }); } catch { /* fixed refusal; no private diagnostics */ }
      if (current !== true) throw Error("QDEV_CONVERSATION_UNAVAILABLE");
      options.abortSignal?.throwIfAborted();
      if (Buffer.byteLength(JSON.stringify(options.prompt)) > 1_000_000) throw Error("QDEV_CONVERSATION_BOUND");
      const userIndex = options.prompt.findLastIndex(m => m.role === "user");
      if (userIndex < 0) return textResult(`This installation runs only its approved journey. Send: ${approvedRequest}`);
      const user = options.prompt[userIndex];
      const approved = user.role === "user" && user.content.every(p => p.type === "text") &&
        user.content.map(p => p.type === "text" ? p.text : "").join("\n").trim() === approvedRequest;
      const toolCallId = "qdev-" + createHash("sha256").update(JSON.stringify([ownerId, identity.sessionId, userIndex, approvedRequest])).digest("hex").slice(0, 32);
      const turn = options.prompt.slice(userIndex + 1);
      const calls: { index: number; toolCallId: string; input: unknown }[] = [];
      const outputs: { index: number; toolCallId: string; output: unknown }[] = [];
      for (const [index, message] of turn.entries()) {
        if (message.role !== "assistant" && message.role !== "tool") continue;
        for (const part of message.content) {
          if (part.type !== "tool-call" && part.type !== "tool-result") continue;
          if (part.toolName !== TOOL) return textResult(unverified);
          if (part.type === "tool-call") calls.push({ index, toolCallId: part.toolCallId, input: part.input });
          else outputs.push({ index, toolCallId: part.toolCallId, output: part.output });
        }
      }
      if (calls.length || outputs.length) {
        if (!approved || calls.length !== 1 || outputs.length > 1 || calls[0].toolCallId !== toolCallId) return textResult(unverified);
        const call = calls[0];
        let args = call.input;
        try { if (typeof args === "string") args = JSON.parse(args); } catch { return textResult(unverified); }
        if (!args || typeof args !== "object" || Array.isArray(args) || Object.keys(args).length) return textResult(unverified);
        if (!outputs.length) return textResult(pending);
        const output = outputs[0];
        const json = z.object({ type: z.literal("json"), value: z.unknown() }).passthrough().safeParse(output.output);
        if (output.index <= call.index || output.toolCallId !== call.toolCallId || !json.success) return textResult(unverified);
        return textResult(present(json.data.value, deliveryUrl, "INDEPENDENT"));
      }
      // A tool response without the expected call is never an invitation to rerun the journey.
      if (turn.some(m => m.role === "tool")) return textResult(unverified);
      if (!approved) return textResult(await ownerReply(user.role === "user" && user.content.every(p => p.type === "text") ? user.content.map(p => p.type === "text" ? p.text : "").join("\n").trim() : undefined));
      if (!options.tools?.some(t => t.type === "function" && t.name === TOOL)) throw Error("QDEV_CONVERSATION_TOOL_UNAVAILABLE");
      return result([{ type: "tool-call", toolCallId, toolName: TOOL, input: "{}" }], true);
    }
    return deterministicModel("approved-journey-orchestrator", generate);
  } };
}

/** https only, except that the owner-local installation may link its own loopback preview (exact http://127.0.0.1:<port>). */
function deliveryUrlOf(value: string | undefined, ownerLocal = false): string | undefined {
  if (value === undefined) return undefined;
  const url = new URL(value);
  const loopback = ownerLocal && url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port !== "";
  if ((url.protocol !== "https:" && !loopback) || url.username || url.password || url.hash || /[\s()<>]/.test(url.href)) throw Error("QDEV_CONVERSATION_DELIVERY_URL");
  return url.href;
}

function deterministicModel(modelId: string, generate: (options: Options) => Promise<Result>) {
  return { specificationVersion: "v4", provider: "myeve-qdev", modelId, supportedUrls: {}, doGenerate: generate,
    async doStream(options: Options) {
      const generated = await generate(options);
      return { stream: new ReadableStream<Part>({ start(controller) {
        controller.enqueue({ type: "stream-start", warnings: [] });
        for (const item of generated.content) {
          if (item.type === "text") {
            controller.enqueue({ type: "text-start", id: "qdev" });
            controller.enqueue({ type: "text-delta", id: "qdev", delta: item.text });
            controller.enqueue({ type: "text-end", id: "qdev" });
          } else if (item.type === "tool-call") controller.enqueue(item);
        }
        controller.enqueue({ type: "finish", usage: generated.usage, finishReason: generated.finishReason, providerMetadata: generated.providerMetadata });
        controller.close();
      } }) };
    } };
}

type Prompt = Options["prompt"];
type Message = Prompt[number];
const CONFIRM = /^\s*confirm\s+([a-f0-9]{12})\s*$/i;
const PROPOSAL = /\[plan ([a-f0-9]{64})\]/;
const userTextOf = (m: Message | undefined): string | undefined =>
  m?.role === "user" && m.content.every(p => p.type === "text") ? m.content.map(p => p.type === "text" ? p.text : "").join("\n").trim() : undefined;
const assistantTextOf = (m: Message | undefined): string | undefined =>
  m?.role === "assistant" ? m.content.map(p => p.type === "text" ? p.text : "").join("\n") : undefined;
/**
 * The web channel inserts its own `Client context:\n{json}` user message (thread id, client time, selected model) ahead of an owner turn. It is channel
 * metadata, never an owner request or confirmation, so the proposal/confirmation adjacency skips it like a system message. Only a message made entirely of
 * such well-formed markers is skipped; anything else (including a malformed marker) still breaks adjacency and refuses.
 */
const CLIENT_CONTEXT_PREFIX = "Client context:\n";
const isClientContext = (m: Message | undefined): boolean => m?.role === "user" && m.content.length > 0 && m.content.every(p => {
  if (p.type !== "text" || !p.text.startsWith(CLIENT_CONTEXT_PREFIX)) return false;
  try { const v: unknown = JSON.parse(p.text.slice(CLIENT_CONTEXT_PREFIX.length)); return v !== null && typeof v === "object" && !Array.isArray(v); } catch { return false; }
});
const metadata = (m: Message | undefined) => m?.role === "system" || isClientContext(m);
const ownerFallback = "Send the development request you want built (for example: \"Build me a React dashboard showing GitHub repository health and failing CI pipelines.\"). I will show the derived plan and its digest; nothing runs until you confirm it.";
const confirmMismatch = "That confirmation does not match the plan proposed immediately before it, so nothing was started. Send the request again to get a fresh proposal.";

/**
 * Owner-request conversation (private beta, owner-local installation). Two owner turns are required before any effect:
 *   1. the owner's request -> a deterministic proposal naming the request digest, repository, release environment, derived cohort and the FULL plan
 *      digest (`[plan <64 hex>]`), with no tool call;
 *   2. `confirm <first 12 hex>` sent directly after that proposal -> exactly one `qualification_journey` call carrying the request text and the plan digest.
 * The proposal is re-derived from the owner's own request message at confirmation time, so an edited, foreign or stale proposal never selects the tool;
 * the root re-derives again and compares the digest before anything is constructed. Still no SDK provider, fallback or paid model in this path.
 */
function ownerRequestConversation(ownerId: string, revalidate: QualificationConversationConfig["revalidate"], derive: (text: string) => OwnerRequestDerivation | null,
  deliveryUrl: string | undefined): QdevConversation {
  const safeDerive = (text: string | undefined) => { if (text === undefined) return null; try { return derive(text); } catch { return null; } };
  /** The derivation the owner confirmed with the user message at `index`, or null. */
  function confirmed(prompt: Prompt, index: number): { code: string; derivation: OwnerRequestDerivation | null } | null {
    const match = CONFIRM.exec(userTextOf(prompt[index]) ?? "");
    if (!match) return null;
    let a = index - 1;
    while (a >= 0 && metadata(prompt[a])) a--;
    const proposal = PROPOSAL.exec(assistantTextOf(prompt[a]) ?? "");
    const proposed = prompt[a];
    if (!proposal || proposed?.role !== "assistant" || proposed.content.some(p => p.type !== "text")) return { code: match[1].toLowerCase(), derivation: null };
    let u = a - 1;
    while (u >= 0 && metadata(prompt[u])) u--;
    const derivation = safeDerive(userTextOf(prompt[u]));
    const ok = derivation && derivation.planSha256 === proposal[1] && derivation.planSha256.slice(0, 12) === match[1].toLowerCase();
    return { code: match[1].toLowerCase(), derivation: ok ? derivation : null };
  }
  const proposalText = (d: OwnerRequestDerivation) => [
    "I can run this as a private-beta owner journey (owner-local installation). Nothing has started.",
    `Request digest: ${d.requestSha256}. Repository: ${d.repository}. Release environment: ${d.environment}. Derived cohort: ${d.cohortId}.`,
    `Stages: 1 ${d.planningInFactory ? "planning and coding in one MyFactory run (no separate Sofie model call)" : "Sofie planning and coding"}, 2 coding, 3 Factory build and tests, 4 local verification and delivery. The verifier is owner-local (assurance PRIVATE_BETA_LOCAL), not independent custody; every stage is charged against the cohort ledger first and nothing is retried automatically.`,
    `[plan ${d.planSha256}]`,
    `To start exactly this plan, reply: confirm ${d.planSha256.slice(0, 12)}`,
  ].join("\n\n");
  return { ownerId, contextWindowTokens: 200_000, model(input) {
    const identity = z.object({ sessionId: z.string().min(1).max(255), stepKey: z.string().min(1).max(1000) }).strict().parse(input);
    const binding = { ownerId, ...identity };
    async function generate(options: Options): Promise<Result> {
      options.abortSignal?.throwIfAborted();
      let current = false;
      try { current = await revalidate({ ...binding }); } catch { /* fixed refusal; no private diagnostics */ }
      if (current !== true) throw Error("QDEV_CONVERSATION_UNAVAILABLE");
      options.abortSignal?.throwIfAborted();
      if (Buffer.byteLength(JSON.stringify(options.prompt)) > 1_000_000) throw Error("QDEV_CONVERSATION_BOUND");
      const userIndex = options.prompt.findLastIndex(m => m.role === "user" && !isClientContext(m));
      if (userIndex < 0) return textResult(ownerFallback);
      const confirmation = confirmed(options.prompt, userIndex), d = confirmation?.derivation ?? null;
      const toolCallId = "qdev-" + createHash("sha256").update(JSON.stringify([ownerId, identity.sessionId, userIndex, d?.planSha256 ?? null])).digest("hex").slice(0, 32);
      const turn = options.prompt.slice(userIndex + 1);
      const calls: { index: number; toolCallId: string; input: unknown }[] = [];
      const outputs: { index: number; toolCallId: string; output: unknown }[] = [];
      for (const [index, message] of turn.entries()) {
        if (message.role !== "assistant" && message.role !== "tool") continue;
        for (const part of message.content) {
          if (part.type !== "tool-call" && part.type !== "tool-result") continue;
          if (part.toolName !== TOOL) return textResult(unverified);
          if (part.type === "tool-call") calls.push({ index, toolCallId: part.toolCallId, input: part.input });
          else outputs.push({ index, toolCallId: part.toolCallId, output: part.output });
        }
      }
      if (calls.length || outputs.length) {
        if (!d || calls.length !== 1 || outputs.length > 1 || calls[0].toolCallId !== toolCallId) return textResult(unverified);
        const call = calls[0];
        let args = call.input;
        try { if (typeof args === "string") args = JSON.parse(args); } catch { return textResult(unverified); }
        const a = args as Record<string, unknown> | null;
        if (!a || typeof a !== "object" || Array.isArray(a) || Object.keys(a).sort().join(",") !== "planSha256,request" || a.request !== d.request || a.planSha256 !== d.planSha256)
          return textResult(unverified);
        if (!outputs.length) return textResult("The confirmed request was already started. Its response is pending or unavailable; no automatic retry was started.");
        const output = outputs[0];
        const json = z.object({ type: z.literal("json"), value: z.unknown() }).passthrough().safeParse(output.output);
        if (output.index <= call.index || output.toolCallId !== call.toolCallId || !json.success) return textResult(unverified);
        return textResult(present(json.data.value, deliveryUrl, "PRIVATE_BETA_LOCAL", "The confirmed request"));
      }
      // A tool response without the expected call is never an invitation to rerun the journey.
      if (turn.some(m => m.role === "tool")) return textResult(unverified);
      if (confirmation) {
        if (!d) return textResult(confirmMismatch);
        if (!options.tools?.some(t => t.type === "function" && t.name === TOOL)) throw Error("QDEV_CONVERSATION_TOOL_UNAVAILABLE");
        return result([{ type: "tool-call", toolCallId, toolName: TOOL, input: JSON.stringify({ request: d.request, planSha256: d.planSha256 }) }], true);
      }
      const text = userTextOf(options.prompt[userIndex]);
      if (text === undefined) return textResult(ownerFallback);
      if (statusIntent.test(text)) return textResult(`Progress is reported as the result of each confirmed request; this owner-local installation keeps no chat progress view yet. Nothing was started.\n\n${ownerFallback}`);
      const derived = safeDerive(text);
      if (!derived) return textResult(`That request is empty, too short or too long (2000 characters at most), contains control characters, or this installation is not configured to derive a plan. Nothing was started.`);
      return textResult(proposalText(derived));
    }
    return deterministicModel("owner-request-orchestrator", generate);
  } };
}
