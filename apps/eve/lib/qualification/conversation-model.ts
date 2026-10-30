import { createHash } from "node:crypto";
import type { gateway } from "ai";
import { z } from "zod";
import type { QdevConversation } from "./root.ts";

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
}).strict();

export type QualificationConversationConfig = {
  ownerId: string;
  /** Explicit host-approved request text for this frozen journey; other requests cannot select an execution tool. */
  approvedRequest: string;
  /** Must equal the pinned MyApps observer URL. Used only after a complete verified delivery presentation. */
  deliveryUrl?: string;
  /** Read-only current owner/enrollment/expiry/revocation check. It must never invoke a provider. */
  revalidate(input: { ownerId: string; sessionId: string; stepKey: string }): Promise<boolean>;
};

function result(content: Result["content"], toolCall = false): Result {
  return { content, finishReason: { unified: toolCall ? "tool-calls" : "stop", raw: toolCall ? "tool_calls" : "stop" },
    usage: { inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 0, text: 0, reasoning: 0 } },
    warnings: [], providerMetadata: { qdev: { kind: "DETERMINISTIC", paidModelOperations: 0 } } };
}
const textResult = (text: string) => result([{ type: "text", text }]);

function present(value: unknown, deliveryUrl?: string): string {
  const parsed = presentation.safeParse(value);
  if (!parsed.success) return unverified;
  const p = parsed.data;
  if (p.stages.some((s, i) => s.stage !== i + 1)) return unverified;
  if (p.status === "HALTED") {
    if (!p.haltedAt || !p.code || p.stages.length > p.haltedAt || p.verdictSha256 || p.deliverySha256) return unverified;
    return `The approved journey stopped at stage ${p.haltedAt} (${p.code}). Completed stage records: ${p.stages.length}. Its history and accounting remain retained; no automatic retry was started.`;
  }
  if (p.stages.length !== 4 || !p.verdictSha256 || !p.deliverySha256 || p.haltedAt !== undefined || p.code !== undefined) return unverified;
  return ["The approved journey completed all four stages.",
    `Independent verdict: ${p.verdictSha256}. Delivery evidence: ${p.deliverySha256}.`,
    ...(deliveryUrl ? [`[Open the delivered application](${deliveryUrl})`] : []),
    "Release readiness and tester activation still require their own authorization."].join("\n\n");
}

/** Free outer orchestration only. The authenticated tool/root and journey gate own every effect and every charged call.
 * No SDK provider, fallback, compaction, delegation or original-ledger access exists in this model. */
export function qualificationConversation(config: QualificationConversationConfig): QdevConversation {
  const ownerId = z.string().min(1).max(255).parse(config.ownerId);
  const approvedRequest = z.string().trim().min(1).max(4000).parse(config.approvedRequest);
  const revalidate = config.revalidate;
  if (typeof revalidate !== "function") throw Error("QDEV_CONVERSATION_CONFIGURATION");
  let deliveryUrl: string | undefined;
  if (config.deliveryUrl !== undefined) {
    const url = new URL(config.deliveryUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || /[\s()<>]/.test(url.href)) throw Error("QDEV_CONVERSATION_DELIVERY_URL");
    deliveryUrl = url.href;
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
        return textResult(present(json.data.value, deliveryUrl));
      }
      // A tool response without the expected call is never an invitation to rerun the journey.
      if (turn.some(m => m.role === "tool")) return textResult(unverified);
      if (!approved)
        return textResult(`This installation runs only its approved journey. Send: ${approvedRequest}`);
      if (!options.tools?.some(t => t.type === "function" && t.name === TOOL)) throw Error("QDEV_CONVERSATION_TOOL_UNAVAILABLE");
      return result([{ type: "tool-call", toolCallId, toolName: TOOL, input: "{}" }], true);
    }
    return { specificationVersion: "v4", provider: "myeve-qdev", modelId: "approved-journey-orchestrator", supportedUrls: {}, doGenerate: generate,
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
  } };
}
