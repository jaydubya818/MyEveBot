import { describe, expect, it } from "vitest";
import { chatTurnPrompt, CONFIRM, dispatchRoute, explicitBuildRequest, journeyContinuation, JOURNEY_TOOL, ownerMessageFingerprint, ownerMessageRoute,
  QDEV_CHAT_JOURNEY_TOOL_DENIED, qdevChatTurnModel, type QdevTurnRecord } from "./turn-route.ts";

const PLAN = "5371fffa714d" + "0".repeat(52);
const CODE = PLAN.slice(0, 12);
const user = (text: string) => ({ role: "user", content: [{ type: "text", text }] });
const assistant = (text: string) => ({ role: "assistant", content: [{ type: "text", text }] });
const system = { role: "system", content: "You are Sofie." };
const clientContext = user(`Client context:\n${JSON.stringify({ threadId: "t", model: "openai/gpt-5.4-mini" })}`);
const proposal = assistant(`I can run this as a private-beta journey on your Mac's MyFactory (hosted installation). Nothing has started.\n\n[plan ${PLAN}]\n\nTo start exactly this plan, reply: confirm ${CODE}`);
const call = { role: "assistant", content: [{ type: "tool-call", toolCallId: "qdev-1", toolName: JOURNEY_TOOL, input: "{}" }] };
const toolResult = { role: "tool", content: [{ type: "tool-result", toolCallId: "qdev-1", toolName: JOURNEY_TOOL, output: { type: "json", value: { status: "HALTED" } } }] };
const delivered = assistant("The confirmed request completed all four stages.");
/** A thread that already proposed, confirmed, ran and reported one build. */
const priorBuild = [system, user("Build me a React dashboard showing repository health"), proposal, user(`confirm ${CODE}`), call, toolResult, delivered];
const recordFor = (text: string | undefined): QdevTurnRecord => ({ route: ownerMessageRoute(text), fingerprint: ownerMessageFingerprint(text) });

const CHAT = [
  // greetings, courtesy, bare affirmatives
  "hello", "hello - what model is this?", "hi", "hey Sofie", "good morning!", "thanks", "thank you!", "ok", "yes", "go ahead", "confirm", "👍", "yes, go ahead", "sure, do it",
  // model / memory / capability questions
  "what model is this?", "which model are you?", "what model are you running on", "are you GPT or Claude?",
  "what do you remember about me?", "remember that I like green tea", "what did I tell you yesterday?", "forget my birthday", "do you have memory?",
  "what can you do?", "can you build apps?", "can you make a website recommendation?", "how do I build an app?", "what would it take to build a dashboard?", "why did you make a plan?",
  "explain how the build journey works", "what is MyFactory?", "summarize this thread", "what's the weather in Austin?", "write a poem about dashboards",
  // "make/create/build" that is not software
  "make me a sandwich", "make a note that the dashboard meeting moved", "create a list of apps I use", "make me a plan for a website",
  "Generate a game plan for Q1", "Please create a site visit checklist", "Let's create a game night plan", "make a calculator joke", "Create a tool list for the kitchen",
  "make one tool recommendation", "Make a game of it", "create a tracker of my expenses in this chat", "Write me a Python script that renames files",
  // changes to, or talk about, existing things
  "Make the app icon blue", "build the app", "make this dashboard faster", "make that tool quieter", "I built an app last year", "is the app done?", "don't build me an app",
  // questions and second thoughts
  "create a dashboard? no wait, just tell me the weather", "Build an app? Not now, just chatting", "make a website? how much does that cost", "can you build me an app? or is that too much?",
  // status talk is chat (the chat model sees the thread)
  "how's it going", "status", "progress on my diet?", "Where are we going for dinner?", "what happened to my build?",
  // not an exact confirmation
  "confirm 5371fffa714", "confirm it please", "confirm 5371fffa714d and also add dark mode", "", "   ",
];
const BUILD = [
  "Build me a React dashboard showing GitHub repository health and failing CI pipelines.",
  "build a habit tracker", "Create a todo list app", "make me a simple web app for tracking workouts", "Please build a landing page for my bakery",
  "Can you build me a dashboard?", "can u build me a dashboard", "could you please create a calculator for mortgage payments", "I want you to build a tool that converts CSV to JSON",
  "I'd like you to make a game", "let's build a prototype", "/build something that tracks my reading", "Develop an internal portal for the team", "generate a website for my portfolio",
  "Thanks! Now build me a todo app", "🚀 Build me a dashboard", "**Build me a dashboard**", "Hey Sofie, build me a dashboard.", "build me 2 dashboards", "Build a Chrome extension that saves tabs",
  "build a CLI for renaming photos", "create a REST API for my recipes", "Build a Slack bot that posts standup reminders", "build another tracker, like the last one",
];

describe("explicitBuildRequest", () => {
  it.each(CHAT)("is false for %j", text => expect(explicitBuildRequest(text)).toBe(false));
  it.each(BUILD)("is true for %j", text => expect(explicitBuildRequest(text)).toBe(true));
  it("is false for non-strings and oversized text", () => {
    expect(explicitBuildRequest(undefined)).toBe(false);
    expect(explicitBuildRequest("build me an app " + "x".repeat(4000))).toBe(false);
  });
});

describe("ownerMessageRoute", () => {
  it.each(CHAT)("%j is CHAT", text => expect(ownerMessageRoute(text)).toBe("CHAT"));
  it.each(BUILD)("%j is JOURNEY", text => expect(ownerMessageRoute(text)).toBe("JOURNEY"));
  it("the reported production bug: a greeting plus a model question is chat", () => expect(ownerMessageRoute("hello - what model is this?")).toBe("CHAT"));
  it.each([`confirm ${CODE}`, `  Confirm ${CODE}  `, `confirm ${CODE}.`, `"confirm ${CODE}"`, `\`confirm ${CODE}\``, `confirm ${CODE}!`])(
    "exact confirmation %j is JOURNEY and keeps the code in the first capture", text => {
      expect(ownerMessageRoute(text)).toBe("JOURNEY");
      expect(CONFIRM.exec(text)?.[1].toLowerCase()).toBe(CODE);
    });
  it("a message with non-text parts is chat", () => expect(ownerMessageRoute(undefined)).toBe("CHAT"));
});

describe("dispatchRoute: a paid chat model needs a positive, current CHAT record", () => {
  const hello = "hello - what model is this?";
  it("CHAT when the hook recorded CHAT for the owner message in the prompt", () => {
    expect(dispatchRoute([system, clientContext, user(hello)], recordFor(hello))).toBe("CHAT");
    expect(dispatchRoute([...priorBuild, clientContext, user("what model is this?")], recordFor("what model is this?"))).toBe("CHAT");
    expect(dispatchRoute([system, user("build a habit tracker"), proposal, clientContext, user("why did you make a plan?")], recordFor("why did you make a plan?"))).toBe("CHAT");
  });
  it("whitespace differences between the received message and the prompt do not matter", () => {
    expect(dispatchRoute([system, user("  hello -   what model\nis this?  ")], recordFor("hello - what model is this?"))).toBe("CHAT");
  });
  it("JOURNEY with no record, a JOURNEY record, or a record for a different message (stale or forged)", () => {
    const prompt = [system, clientContext, user(hello)];
    expect(dispatchRoute(prompt, null)).toBe("JOURNEY");
    expect(dispatchRoute(prompt, undefined)).toBe("JOURNEY");
    expect(dispatchRoute(prompt, { route: "JOURNEY", fingerprint: ownerMessageFingerprint(hello) })).toBe("JOURNEY");
    expect(dispatchRoute(prompt, recordFor("some other message"))).toBe("JOURNEY");
    // A CHAT record whose fingerprint is that of a build request or a confirmation never selects the paid model.
    expect(dispatchRoute([system, user("Build me a dashboard")], { route: "CHAT", fingerprint: ownerMessageFingerprint("Build me a dashboard") })).toBe("JOURNEY");
    expect(dispatchRoute([system, user("build a habit tracker"), proposal, user(`confirm ${CODE}`)], { route: "CHAT", fingerprint: ownerMessageFingerprint(`confirm ${CODE}`) })).toBe("JOURNEY");
    expect(dispatchRoute(undefined, recordFor(hello))).toBe("JOURNEY");
    expect(dispatchRoute("hello", recordFor(hello))).toBe("JOURNEY");
  });
  it("a chat turn stays CHAT across its own tool continuations and trailing framework notes", () => {
    const memory = [{ role: "assistant", content: [{ type: "tool-call", toolCallId: "m1", toolName: "memory_search", input: "{}" }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "m1", toolName: "memory_search", output: { type: "json", value: [] } }] }];
    const text = "what do you remember about me?";
    expect(dispatchRoute([...priorBuild, user(text), ...memory], recordFor(text))).toBe("CHAT");
    expect(dispatchRoute([...priorBuild, user(text), ...memory, user("Continue: your previous response was empty.")], recordFor(text))).toBe("CHAT");
  });
  it("a journey call awaiting readback is JOURNEY whatever the record says, including after a trailing framework user note", () => {
    const confirmed = [system, user("build a habit tracker"), proposal, user(`confirm ${CODE}`)];
    const chat: QdevTurnRecord = recordFor("hello");
    for (const prompt of [[...confirmed, call], [...confirmed, call, toolResult], [...confirmed, call, toolResult, user("Continue: your previous response was empty.")],
      [...confirmed, call, toolResult, user("hello")], [system, user("hello"), call, toolResult]]) {
      expect(journeyContinuation(prompt)).toBe(true);
      expect(dispatchRoute(prompt, chat)).toBe("JOURNEY");
    }
    expect(journeyContinuation(priorBuild)).toBe(false);                       // its readback text was already given
    expect(journeyContinuation([system, user("hello")])).toBe(false);
  });
  it("a message with attachments is CHAT only against the non-text record", () => {
    const withFile = { role: "user", content: [{ type: "file", data: "x", mediaType: "image/png" }, { type: "text", text: "build a habit tracker" }] };
    expect(dispatchRoute([system, withFile], recordFor(undefined))).toBe("CHAT");
    expect(dispatchRoute([system, withFile], recordFor("build a habit tracker"))).toBe("JOURNEY");
  });
});

describe("chat turn model", () => {
  it("removes journey calls from history, keeps their text summary, and adds the build hint after the leading system messages", () => {
    const cleaned = chatTurnPrompt([...priorBuild, user("what model is this?")]);
    expect(JSON.stringify(cleaned)).not.toContain(JOURNEY_TOOL);
    expect(cleaned.map(m => m.role)).toEqual(["system", "system", "user", "assistant", "user", "assistant", "user"]);
    expect(String(cleaned[1].content)).toContain("cannot start");
    expect(cleaned.at(-2)).toBe(delivered);
  });
  it("removes approval parts tied to a removed journey call and leaves other tools' parts alone", () => {
    const approval = { role: "assistant", content: [{ type: "tool-call", toolCallId: "qdev-1", toolName: JOURNEY_TOOL, input: "{}" }, { type: "tool-approval-request", approvalId: "ap1", toolCallId: "qdev-1" },
      { type: "tool-call", toolCallId: "m1", toolName: "memory_search", input: "{}" }] };
    const response = { role: "tool", content: [{ type: "tool-approval-response", approvalId: "ap1", approved: true }, { type: "tool-result", toolCallId: "m1", toolName: "memory_search", output: { type: "json", value: [] } }] };
    const cleaned = chatTurnPrompt([system, user("x"), approval, response, user("hello")]);
    expect(JSON.stringify(cleaned)).not.toMatch(/qualification_journey|ap1|qdev-1/);
    expect(JSON.stringify(cleaned)).toContain("memory_search");
  });
  const fake = (content: unknown[], parts: unknown[] = []) => {
    const seen: any[] = [];
    return { seen, model: { specificationVersion: "v4", provider: "gateway", modelId: "openai/gpt-5.4-mini", supportedUrls: {},
      doGenerate: async (options: any) => { seen.push(options); return { content }; },
      doStream: async (options: any) => { seen.push(options); return { stream: new ReadableStream({ start(c) { for (const p of parts) c.enqueue(p); c.close(); } }) }; } } };
  };
  const options = { prompt: [...priorBuild, user("hello")], tools: [{ type: "function", name: JOURNEY_TOOL }, { type: "function", name: "memory_search" }] };
  const drain = async (stream: ReadableStream) => { const out: unknown[] = []; const reader = stream.getReader(); for (;;) { const r = await reader.read(); if (r.done) return out; out.push(r.value); } };

  it("never offers the journey tool to the chat model and passes ordinary replies through", async () => {
    const { seen, model } = fake([{ type: "text", text: "Hello!" }], [{ type: "text-delta", id: "1", delta: "Hello!" }]);
    const wrapped = qdevChatTurnModel(model);
    expect([wrapped.provider, wrapped.modelId, wrapped.specificationVersion]).toEqual(["gateway", "openai/gpt-5.4-mini", "v4"]);
    expect((await wrapped.doGenerate(options)).content).toEqual([{ type: "text", text: "Hello!" }]);
    expect(await drain((await wrapped.doStream(options)).stream)).toEqual([{ type: "text-delta", id: "1", delta: "Hello!" }]);
    for (const sent of seen) {
      expect(sent.tools).toEqual([{ type: "function", name: "memory_search" }]);
      expect(JSON.stringify(sent.prompt)).not.toContain(JOURNEY_TOOL);
    }
    expect(options.tools).toHaveLength(2);                                     // caller options are not mutated
  });
  it("a journey tool call emitted by the chat model fails the step (generate and stream) before anything can execute it", async () => {
    const emitted = { type: "tool-call", toolCallId: "x", toolName: JOURNEY_TOOL, input: "{}" };
    const wrapped = qdevChatTurnModel(fake([emitted], [{ type: "text-delta", id: "1", delta: "ok" }, emitted]).model);
    await expect(wrapped.doGenerate(options)).rejects.toThrow(QDEV_CHAT_JOURNEY_TOOL_DENIED);
    await expect(drain((await wrapped.doStream(options)).stream)).rejects.toThrow(QDEV_CHAT_JOURNEY_TOOL_DENIED);
    const started = qdevChatTurnModel(fake([], [{ type: "tool-input-start", id: "x", toolName: JOURNEY_TOOL }]).model);
    await expect(drain((await started.doStream(options)).stream)).rejects.toThrow(QDEV_CHAT_JOURNEY_TOOL_DENIED);
  });
  it("a forced tool choice naming the journey tool is refused before the provider is called", async () => {
    const { seen, model } = fake([]);
    await expect(qdevChatTurnModel(model).doGenerate({ ...options, toolChoice: { type: "tool", toolName: JOURNEY_TOOL } })).rejects.toThrow(QDEV_CHAT_JOURNEY_TOOL_DENIED);
    expect(seen).toHaveLength(0);
  });
});
