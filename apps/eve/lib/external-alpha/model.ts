import { gateway } from "ai";
import { digest } from "../engineering/contract.ts";
import { db } from "../../agent/lib/receipts-db.ts";
import {
  resolveSessionAgent,
  type SessionAgentResolutionInput,
} from "../../agent/lib/session-settings.ts";
import { externalAlphaPolicy } from "./policy.ts";
import { ExternalAlphaAllowance } from "./allowance.ts";
import { EXTERNAL_ALPHA_CONTEXT_BYTES, EXTERNAL_ALPHA_OUTPUT_TOKENS, EXTERNAL_ALPHA_INSTRUCTIONS, externalAlphaContextBinding, omitUnavailableSkillCatalog } from "./context.ts";
import type { ExecutionDatabase } from "../execution-types.ts";
type Model = ReturnType<typeof gateway>;
type Options = Parameters<Model["doGenerate"]>[0];
type Result = Awaited<ReturnType<Model["doGenerate"]>>;
type Part =
  Awaited<ReturnType<Model["doStream"]>>["stream"] extends ReadableStream<
    infer P
  >
    ? P
    : never;
/** No sandbox, external apps, autonomous delegation, paid embeddings or
 * publication tools. Each remaining tool retains its canonical owner checks. */
export const externalAlphaTools = new Set([
  "ask_question",
  "get_agent",
  "list_agents",
  "manage_agent",
  "get_goal",
  "list_goals",
  "create_goal",
  "update_goal",
  "inspect_tasks",
  "manage_goal_task",
  "list_decisions",
  "record_decision",
  "engineering_work",
  "engineering_factory",
]);
export function externalAlphaPrompt(options: Options, selectedWork = false): Options {
  if (
    options.prompt.some(
      (m) => m.role === "user" && m.content.some((p) => p.type !== "text"),
    )
  )
    throw Error("EXTERNAL_ALPHA_TEXT_CONTEXT_REQUIRED");
  const tools = options.tools?.filter(
    (t) => t.type === "function" && externalAlphaTools.has(t.name) &&
      (!selectedWork || ["ask_question", "engineering_work", "engineering_factory"].includes(t.name)),
  );
  const prompt = options.prompt.map(message => message.role === "system"
    ? { ...message, content: omitUnavailableSkillCatalog(message.content) }
    : message);
  const contextBytes = Buffer.byteLength(JSON.stringify({ prompt, tools }));
  if (contextBytes > EXTERNAL_ALPHA_CONTEXT_BYTES)
    throw Error(`EXTERNAL_ALPHA_CONTEXT_BOUND: ${contextBytes}/${EXTERNAL_ALPHA_CONTEXT_BYTES} bytes`);
  return {
    prompt,
    tools,
    toolChoice: { type: "auto" },
    maxOutputTokens: EXTERNAL_ALPHA_OUTPUT_TOKENS,
    abortSignal: options.abortSignal,
    providerOptions: { gateway: { only: ["openai"] } },
  };
}
type ModelPrincipal = {
  principalId?: string;
  principalType?: string;
  authenticator?: string;
  attributes?: Record<string, unknown>;
};
export function externalAlphaModel(
  input: SessionAgentResolutionInput & {
    stepKey: string;
    auth: {
      current?: ModelPrincipal | null;
      initiator?: ModelPrincipal | null;
    };
  },
): Model {
  async function generate(options: Options): Promise<Result> {
    const policy = externalAlphaPolicy();
    const current = input.auth.current,
      initiator = input.auth.initiator;
    if (
      !policy ||
      input.ownerId !== policy.ownerId ||
      current?.authenticator !== "myeve-web-session" ||
      initiator?.authenticator !== "myeve-web-session" ||
      current.principalType !== "user" ||
      initiator.principalType !== "user" ||
      current.principalId !== policy.ownerId ||
      initiator.principalId !== policy.ownerId ||
      current.attributes?.owner !== "true" ||
      initiator.attributes?.owner !== "true" ||
      current.attributes?.myeveRoleId ||
      initiator.attributes?.myeveRoleId ||
      !input.sessionId ||
      !/^.+:\d+$/.test(input.stepKey)
    )
      throw Error("EXTERNAL_ALPHA_OWNER_REQUIRED");
    const agent = await resolveSessionAgent(input);
    if (!agent || agent.ownerId !== policy.ownerId || agent.status !== "active")
      throw Error("EXTERNAL_ALPHA_AGENT_REQUIRED");
    options.abortSignal?.throwIfAborted();
    const turn = input.stepKey.slice(0, input.stepKey.lastIndexOf(":"));
    // Eve can skip a failed dynamic instruction resolver. Never pay for a turn
    // without the successful current assembly and this Agent's exact policy.
    function requirePolicy(currentAgent: NonNullable<typeof agent>) {
      const binding = externalAlphaContextBinding({ownerId: policy!.ownerId, sessionId: input.sessionId!, turnId: turn, workId: current?.attributes?.myeveEngineeringWorkId}, currentAgent);
      if (!currentAgent.instructions || !options.prompt.some(message => message.role === "system" && message.content.includes(binding) && message.content.includes(EXTERNAL_ALPHA_INSTRUCTIONS) && message.content.includes(currentAgent.instructions)))
        throw Error("EXTERNAL_ALPHA_POLICY_CONTEXT_REQUIRED");
    }
    requirePolicy(agent);
    // A conversation explicitly bound to Work does not need Agent/Goal management
    // schemas. This narrows model visibility only; tool authority is unchanged.
    const scoped = externalAlphaPrompt(options, typeof current.attributes?.myeveEngineeringWorkId === "string");
    // Read-only catalog request, no model dispatch. Refuse missing/invalid rates;
    // every paid operation reserves conservative bytes-as-tokens exposure first.
    const catalog = await Promise.race([
      gateway.getAvailableModels(),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(Error("EXTERNAL_ALPHA_PRICING_UNAVAILABLE")),
          5000,
        );
        timer.unref();
      }),
    ]);
    const price = catalog.models.find((m) => m.id === policy.model)?.pricing;
    const rates = price
      ? [
          price.input,
          price.output,
          price.cachedInputTokens ?? price.input,
          price.cacheCreationInputTokens ?? price.input,
        ].map(Number)
      : [];
    if (rates.length !== 4 || rates.some((v) => !Number.isFinite(v) || v <= 0))
      throw Error("EXTERNAL_ALPHA_PRICING_UNAVAILABLE");
    const inputBound =
      Buffer.byteLength(
        JSON.stringify({ prompt: scoped.prompt, tools: scoped.tools }),
      ) + 1024;
    const reserve = Math.ceil(
      2 *
        (inputBound * Math.max(rates[0], rates[2], rates[3]) +
          1024 * rates[1]) *
        1e6,
    );
    const budget = new ExternalAlphaAllowance(
      db() as ExecutionDatabase,
      policy,
    );
    const allowance = await budget.admit({
      kind: "CHAT",
      bindingId: input.sessionId + ":" + turn,
      requestSha256: digest({
        ownerId: policy.ownerId,
        agentId: agent.id,
        sessionId: input.sessionId,
        turn,
      }),
    });
    const remaining = new Date(allowance.deadline).getTime() - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0)
      throw Error("EXTERNAL_ALPHA_DEADLINE");
    const op = await budget.reserve({
      allowanceId: allowance.id,
      stepKey: input.stepKey,
      requestSha256: digest({
        model: policy.model,
        prompt: scoped.prompt,
        tools: scoped.tools,
        maxOutputTokens: 1024,
      }),
      microusd: reserve,
    });
    if (op.state === "SETTLED") {
      await budget.assertActive(allowance.id);
      return op.result as Result;
    }
    try {
      await budget.assertActive(allowance.id);
      const dispatchAgent = await resolveSessionAgent(input);
      if (
        !dispatchAgent ||
        dispatchAgent.id !== agent.id ||
        dispatchAgent.ownerId !== policy.ownerId ||
        dispatchAgent.status !== "active"
      )
        throw Error("EXTERNAL_ALPHA_AGENT_REVOKED");
      requirePolicy(dispatchAgent);
      const dispatchRemaining =
        new Date(allowance.deadline).getTime() - Date.now();
      if (!Number.isFinite(dispatchRemaining) || dispatchRemaining <= 0)
        throw Error("EXTERNAL_ALPHA_DEADLINE");
      options.abortSignal?.throwIfAborted();
      const response = await gateway(policy.model).doGenerate({
        ...scoped,
        abortSignal: AbortSignal.any([
          ...(options.abortSignal ? [options.abortSignal] : []),
          AbortSignal.timeout(Math.min(dispatchRemaining, 60000)),
        ]),
      });
      const raw = response.providerMetadata?.gateway?.cost;
      const cost =
        typeof raw === "number" ||
        (typeof raw === "string" && raw.trim() !== "")
          ? Number(raw)
          : NaN;
      if (!Number.isFinite(cost) || cost < 0)
        throw Error("EXTERNAL_ALPHA_USAGE_UNKNOWN");
      const bad = response.content.some(
        (p) =>
          !["text", "reasoning", "tool-call"].includes(p.type) ||
          (p.type === "tool-call" &&
            (p.providerExecuted || !externalAlphaTools.has(p.toolName))),
      );
      const clean: Result = {
        ...response,
        content: bad
          ? []
          : response.content.filter((p) => p.type !== "reasoning"),
      };
      await budget.settle(op, Math.ceil(cost * 1e6), clean);
      if (bad) throw Error("EXTERNAL_ALPHA_TOOL_DENIED");
      await budget.assertActive(allowance.id);
      const freshAgent = await resolveSessionAgent(input);
      if (
        !freshAgent ||
        freshAgent.id !== agent.id ||
        freshAgent.ownerId !== policy.ownerId ||
        freshAgent.status !== "active"
      )
        throw Error("EXTERNAL_ALPHA_AGENT_REVOKED");
      return clean;
    } catch (e) {
      await budget.unknown(op);
      throw e;
    }
  }
  return {
    specificationVersion: "v4",
    provider: "myeve-external-alpha",
    modelId: "owner-budgeted",
    supportedUrls: {},
    doGenerate: generate,
    async doStream(options) {
      const result = await generate(options);
      return {
        stream: new ReadableStream<Part>({
          start(c) {
            c.enqueue({ type: "stream-start", warnings: result.warnings });
            for (const [i, p] of result.content.entries())
              if (p.type === "text") {
                const id = String(i);
                c.enqueue({ type: "text-start", id });
                c.enqueue({ type: "text-delta", id, delta: p.text });
                c.enqueue({ type: "text-end", id });
              } else if (p.type === "tool-call") c.enqueue(p);
            c.enqueue({
              type: "finish",
              usage: result.usage,
              finishReason: result.finishReason,
              providerMetadata: result.providerMetadata,
            });
            c.close();
          },
        }),
      };
    },
  };
}
