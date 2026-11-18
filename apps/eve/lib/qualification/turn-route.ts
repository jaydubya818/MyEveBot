import { createHash } from "node:crypto";

/**
 * Turn routing for an owner-request QDEV installation (hosted private beta, owner-local private beta).
 *
 * The installation serves two things from one chat: the governed build journey (a free, deterministic `myeve-qdev`
 * model that proposes a plan and, after an exact confirmation, calls `qualification_journey`) and ordinary chat.
 * Before this module every owner message was derived into a build plan, so "hello" produced a plan.
 *
 * The route is a pure function of the owner's own latest message text:
 *   JOURNEY  an exact confirmation (`confirm <12 hex>`), or an explicit build request (an imperative whose direct
 *            object is a named software artifact, or the `/build` prefix);
 *   CHAT     everything else.
 * It is decided once, when the message is received, and recorded in durable session state (agent/lib/qdev-turn.ts) so
 * the budget/accounting hooks and the model selection of every step of that turn agree. A paid chat model is selected
 * only when that record says CHAT for the message actually in the prompt; anything else stays on the free model.
 * Independently of the record, a turn that already carries a `qualification_journey` call or result is always read
 * back by the deterministic model.
 */
export const JOURNEY_TOOL = "qualification_journey";
export type QdevTurnRoute = "JOURNEY" | "CHAT";

type Part = { type?: unknown; text?: unknown; toolName?: unknown; toolCallId?: unknown; approvalId?: unknown };
type Message = { role?: unknown; content?: unknown };

/** Exact confirmation. Surrounding quotes/backticks and one trailing `.`/`!` are tolerated; the 12 hex characters are not. */
export const CONFIRM = /^\s*["'`“”‘’]*confirm\s+([a-f0-9]{12})["'`“”‘’]*[.!]?["'`“”‘’]*\s*$/i;
export const PROPOSAL = /\[plan ([a-f0-9]{64})\]/;
export const STATUS_INTENT = /^\s*(status|progress|where (are we|is it)|how (is|'s) (it|the (journey|build|project|app)) (going|doing))\b/i;

const CLIENT_CONTEXT_PREFIX = "Client context:\n";
const parts = (m: Message | undefined): Part[] | null => Array.isArray(m?.content) ? m!.content as Part[] : null;

/** Text of a user message made only of text parts (or a plain string), trimmed; otherwise undefined. */
export function userTextOf(m: Message | undefined): string | undefined {
  if (m?.role !== "user") return undefined;
  if (typeof m.content === "string") return m.content.trim();
  const p = parts(m);
  return p && p.every(x => x.type === "text" && typeof x.text === "string") ? p.map(x => x.text as string).join("\n").trim() : undefined;
}
export function assistantTextOf(m: Message | undefined): string | undefined {
  if (m?.role !== "assistant") return undefined;
  if (typeof m.content === "string") return m.content;
  const p = parts(m);
  return p ? p.map(x => x.type === "text" && typeof x.text === "string" ? x.text : "").join("\n") : undefined;
}
/**
 * The web channel inserts its own `Client context:\n{json}` user message (thread id, client time, selected model) ahead of an owner turn. It is channel
 * metadata, never an owner request or confirmation. Only a message made entirely of such well-formed markers counts.
 */
export function isClientContext(m: Message | undefined): boolean {
  const p = parts(m);
  return m?.role === "user" && !!p && p.length > 0 && p.every(x => {
    if (x.type !== "text" || typeof x.text !== "string" || !x.text.startsWith(CLIENT_CONTEXT_PREFIX)) return false;
    try { const v: unknown = JSON.parse(x.text.slice(CLIENT_CONTEXT_PREFIX.length)); return v !== null && typeof v === "object" && !Array.isArray(v); } catch { return false; }
  });
}
export const isTurnMetadata = (m: Message | undefined) => m?.role === "system" || isClientContext(m);

// --- explicit build request -------------------------------------------------------------------------------------------
/** Leading decoration that is not part of the request: emoji/markdown, a short courtesy sentence, an address or filler word. */
const NOISE = String.raw`(?:[^\p{L}\p{N}/]+|(?:thanks|thank\s+you|great|cool|nice|perfect|awesome|hi|hey|hello|ok|okay|alright|so|now|then|next|also|sofie|eve|please|pls)\b[\s,!.:;-]*)*`;
const POLITE = String.raw`(?:(?:can|could|would|will)\s+(?:you|u)\s+(?:please\s+)?)`;
const WISH = String.raw`(?:(?:i\s+(?:want|need)|i['’]?d\s+like|i\s+would\s+like)\s+(?:you\s+)?to\s+|let['’]?s\s+|go\s+ahead\s+and\s+|please\s+)`;
const VERB = String.raw`(?:build|create|make|develop|generate|scaffold|code|implement|prototype)`;
/** A new thing (never "the/this/that …", which refers to something that already exists), or a counted number of them. */
const DETERMINER = String.raw`(?:a|an|my|our|another|one|two|three|four|five|\d{1,2})`;
const ARTIFACT = String.raw`(?:apps?|applications?|web\s?apps?|websites?|web\s?sites?|sites?|web\s?pages?|landing\s+pages?|dashboards?|tools?|games?|trackers?|calculators?|prototypes?|mvps?|portals?|widgets?|viewers?|editors?|uis?|interfaces?|(?:browser\s+|chrome\s+)?extensions?|clis?|apis?|bots?|plugins?)`;
/** Words allowed between the determiner and the artifact noun: adjectives and names, never a preposition/conjunction (the artifact must be the object itself). */
const MODIFIER = String.raw`(?:(?!(?:for|about|of|to|that|which|with|on|in|from|and|or|how|why|when|if|not|no)\b)[\p{L}\p{N}.#+'’/-]+\s+){0,6}?`;
/** The artifact must end the noun phrase: end of text, punctuation, or a complement. "app icon", "game plan", "tool list" are not artifacts. */
const AFTER = String.raw`(?=\s*(?:$|[.!,;:?)\]*_~-]|(?:for|that|which|to|with|showing|where|in|using|called|named|like|so|and|on|from|please|pls|thanks)\b))`;
const BUILD_REQUEST = new RegExp(String.raw`^${NOISE}(${POLITE})?(?:${WISH})?${VERB}\s+(?:(?:me|us)\s+)?${DETERMINER}\s+${MODIFIER}${ARTIFACT}${AFTER}`, "iu");
const BUILD_PREFIX = /^\s*\/build\s+\S/i;

/**
 * True only for an explicit request to build software: `/build <request>`, or an imperative (optionally polite) whose direct object is a
 * new, named software artifact ("Build me a React dashboard …", "Can you create a habit tracker app?"). Greetings, questions about models,
 * memory or capabilities, "how do I build …" questions, changes to existing things ("make the app icon blue") and anything that asks a
 * question other than the single polite "can you … ?" form are not build requests.
 */
export function explicitBuildRequest(text: string | undefined): boolean {
  if (typeof text !== "string" || text.length > 4000) return false;
  if (BUILD_PREFIX.test(text)) return true;
  const match = BUILD_REQUEST.exec(text);
  if (!match) return false;
  const questions = text.split("?").length - 1;
  if (questions === 0) return true;
  // One question mark, at the very end, on a "can/could/would/will you …" request. "Build an app? Not now." is not a request.
  return questions === 1 && match[1] !== undefined && /\?\s*$/.test(text);
}

/** The route of one owner message. Pure; a non-text message (attachments only) is chat. */
export function ownerMessageRoute(text: string | undefined): QdevTurnRoute {
  if (typeof text !== "string") return "CHAT";
  return CONFIRM.test(text) || explicitBuildRequest(text) ? "JOURNEY" : "CHAT";
}

// --- binding a recorded route to the prompt -------------------------------------------------------------------------
export const NON_TEXT_OWNER_MESSAGE = "non-text";
export type QdevTurnRecord = { route: QdevTurnRoute; fingerprint: string; turnId?: string };
/** Stable fingerprint of an owner message: sha256 of its whitespace-normalised text, or a fixed marker for a message with non-text parts. */
export function ownerMessageFingerprint(text: string | undefined): string {
  return typeof text === "string" ? createHash("sha256").update(text.replace(/\s+/g, " ").trim()).digest("hex") : NON_TEXT_OWNER_MESSAGE;
}

const journeyPart = (x: Part) => (x.type === "tool-call" || x.type === "tool-result") && x.toolName === JOURNEY_TOOL;
const hasJourneyPart = (m: Message | undefined) => (m?.role === "assistant" || m?.role === "tool") && !!parts(m)?.some(journeyPart);
const realUser = (m: Message | undefined) => m?.role === "user" && !isClientContext(m);

/** True when a `qualification_journey` call or result follows the owner's confirmation or build request: its readback is never handed to a paid model. */
export function journeyContinuation(prompt: unknown): boolean {
  if (!Array.isArray(prompt)) return false;
  const messages = prompt as Message[];
  let last = -1;
  for (let i = messages.length - 1; i >= 0; i--) if (hasJourneyPart(messages[i])) { last = i; break; }
  if (last < 0) return false;
  // The journey part belongs to the current turn unless the owner has sent a new (non-framework) message after the assistant's final text for it.
  let answered = -1;
  for (let i = last + 1; i < messages.length; i++) if (messages[i]?.role === "assistant" && !hasJourneyPart(messages[i]) && (assistantTextOf(messages[i]) ?? "").trim()) { answered = i; break; }
  return answered < 0;
}

/**
 * The route for one model dispatch. CHAT requires all of: the conversation serves chat, no journey call is pending readback, the message hook
 * recorded CHAT, and that record is for an owner message present among the latest owner messages of this prompt (which itself classifies as
 * CHAT). Every other case, including a missing or stale record, is JOURNEY: the free deterministic model.
 */
export function dispatchRoute(prompt: unknown, recorded: QdevTurnRecord | null | undefined): QdevTurnRoute {
  if (!Array.isArray(prompt) || recorded?.route !== "CHAT" || journeyContinuation(prompt)) return "JOURNEY";
  const owners = (prompt as Message[]).filter(realUser).slice(-3);
  const matched = owners.find(m => ownerMessageFingerprint(userTextOf(m)) === recorded.fingerprint);
  if (!matched) return "JOURNEY";
  return ownerMessageRoute(userTextOf(matched));
}

/** The plan proposal sent directly before the user message at `index` (channel metadata skipped), or null. */
export function proposalBefore(prompt: readonly Message[], index: number): string | null {
  let a = index - 1;
  while (a >= 0 && isTurnMetadata(prompt[a])) a--;
  return PROPOSAL.exec(assistantTextOf(prompt[a]) ?? "")?.[1] ?? null;
}

// --- the chat-turn model wrapper ------------------------------------------------------------------------------------
export const QDEV_CHAT_JOURNEY_TOOL_DENIED = "QDEV_PAID_PATH_DENIED:chat-journey-tool";
const CHAT_HINT = [
  "This installation also runs a governed build journey that you cannot start, confirm, resume or report on.",
  "If the owner wants software built, tell them to send an explicit request such as \"Build me a React dashboard showing …\" (or start the message with /build); they will get a plan and must reply with the exact confirmation text it names.",
  "If the previous assistant message proposed a plan and the owner seems to be agreeing, tell them to reply with exactly the confirmation text that proposal names (confirm followed by 12 characters); a plain yes does not start it.",
  "Never claim that a build was started, is running or finished, and never invent a plan digest or confirmation code.",
].join(" ");

/** Chat history for a paid model: journey tool calls/results (and anything tied to them) are removed, their deterministic text summary stays, and the build hint follows the leading system messages. */
export function chatTurnPrompt<M extends Message>(prompt: readonly M[]): M[] {
  const removedCalls = new Set<unknown>(), removedApprovals = new Set<unknown>();
  for (const m of prompt) for (const x of parts(m) ?? []) if (journeyPart(x)) removedCalls.add(x.toolCallId);
  for (const m of prompt) for (const x of parts(m) ?? []) if (x.type === "tool-approval-request" && removedCalls.has(x.toolCallId)) removedApprovals.add(x.approvalId);
  const drop = (x: Part) => journeyPart(x) || (x.toolCallId !== undefined && removedCalls.has(x.toolCallId)) || (x.approvalId !== undefined && removedApprovals.has(x.approvalId));
  const cleaned: M[] = [];
  for (const m of prompt) {
    const p = parts(m);
    if (!p || !(m.role === "assistant" || m.role === "tool") || !p.some(drop)) { cleaned.push(m); continue; }
    const kept = p.filter(x => !drop(x));
    if (kept.length) cleaned.push({ ...m, content: kept });
  }
  let lead = 0;
  while (lead < cleaned.length && cleaned[lead].role === "system") lead++;
  cleaned.splice(lead, 0, { role: "system", content: CHAT_HINT } as unknown as M);
  return cleaned;
}

type LanguageModel = { doGenerate(options: any): PromiseLike<any>; doStream(options: any): PromiseLike<any> };
const namesJourney = (x: any) => x?.toolName === JOURNEY_TOOL && (x.type === "tool-call" || x.type === "tool-input-start");

/**
 * Wrap the installation's normal chat model for a CHAT turn of a QDEV installation. The journey tool is not offered, a tool choice naming it is
 * refused, journey calls are absent from the history, and any journey tool call the model emits anyway fails the step before the framework can
 * execute it. Spend authority for a build stays solely with the confirmed, deterministic journey path.
 */
export function qdevChatTurnModel<T extends LanguageModel>(model: T): T {
  const prepare = (options: any) => {
    if (options?.toolChoice?.type === "tool" && options.toolChoice.toolName === JOURNEY_TOOL) throw Error(QDEV_CHAT_JOURNEY_TOOL_DENIED);
    return { ...options, prompt: chatTurnPrompt(options?.prompt ?? []),
      ...(Array.isArray(options?.tools) ? { tools: options.tools.filter((t: any) => t?.name !== JOURNEY_TOOL) } : {}) };
  };
  const base = model as any;
  return { specificationVersion: base.specificationVersion, provider: base.provider, modelId: base.modelId, supportedUrls: base.supportedUrls,
    async doGenerate(options: any) {
      const generated = await model.doGenerate(prepare(options));
      if (Array.isArray(generated?.content) && generated.content.some(namesJourney)) throw Error(QDEV_CHAT_JOURNEY_TOOL_DENIED);
      return generated;
    },
    async doStream(options: any) {
      const streamed = await model.doStream(prepare(options));
      if (!streamed?.stream || typeof streamed.stream.pipeThrough !== "function") return streamed;
      return { ...streamed, stream: streamed.stream.pipeThrough(new TransformStream({ transform(part: any, controller) {
        if (namesJourney(part)) controller.error(Error(QDEV_CHAT_JOURNEY_TOOL_DENIED)); else controller.enqueue(part);
      } })) };
    } } as unknown as T;
}
