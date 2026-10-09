import {blockExternalWrite} from "./external-write-policy.ts";
import { randomUUID } from "node:crypto";

import { defaultSessionName } from "@agent-browser/sandbox";
import { Sandbox } from "@vercel/sandbox";

import type { ComputerSessionView } from "./computer-types.ts";

export interface LiveSessionCapabilities {
  liveView: boolean;
  humanTakeover: boolean;
  pause: boolean;
  resume: boolean;
  ownerInput: boolean;
  screenCapture: boolean;
  browserObservation: boolean;
  persistentProfile: boolean;
}

export interface LiveSessionObservation {
  computerSessionId: string;
  browserSessionId: string | null;
  providerSessionId: string | null;
  currentUrl: string | null;
  browserStatus: string | null;
  sessionStatus: string;
  observedAt: string;
}

export interface LiveViewFrame {
  bytes: Uint8Array;
  contentType: "image/png";
  currentUrl: string | null;
  observedAt: string;
}

export type OwnerInput =
  | { type: "pointerMove"; x: number; y: number }
  | { type: "click" | "doubleClick"; x: number; y: number; button?: "left" | "right" | "middle" }
  | { type: "scroll"; x: number; y: number; deltaX: number; deltaY: number }
  | { type: "text"; text: string }
  | { type: "key"; key: string; code: string; modifiers?: number };

export interface LiveSessionHealth {
  available: boolean;
  sessionExists: boolean;
  browserConnected: boolean;
  checkedAt: string;
}

export interface LiveSessionProvider {
  id: string;
  getCapabilities(session: ComputerSessionView): LiveSessionCapabilities;
  getLiveView(session: ComputerSessionView): Promise<LiveViewFrame>;
  acquireOwnerControl(session: ComputerSessionView, controlVersion: number): Promise<void>;
  sendOwnerInput(session: ComputerSessionView, controlVersion: number, input: OwnerInput): Promise<void>;
  releaseOwnerControl(session: ComputerSessionView, controlVersion: number): Promise<void>;
  observe(session: ComputerSessionView): Promise<LiveSessionObservation>;
  closeLiveView(session: ComputerSessionView): Promise<void>;
  getHealth(session: ComputerSessionView): Promise<LiveSessionHealth>;
  stopSession(session: ComputerSessionView): Promise<void>;
}

export class LiveSessionLostError extends Error {
  constructor(message = "The live Computer provider session no longer exists.") {
    super(message);
    this.name = "LiveSessionLostError";
  }
}

const UNSUPPORTED: LiveSessionCapabilities = {
  liveView: false, humanTakeover: false, pause: true, resume: true,
  ownerInput: false, screenCapture: false, browserObservation: false, persistentProfile: false,
};

const VERCEL_BROWSER: LiveSessionCapabilities = {
  liveView: true, humanTakeover: true, pause: true, resume: true,
  ownerInput: true, screenCapture: true, browserObservation: true, persistentProfile: false,
};

const ACTIVE = new Set(["ready", "running", "paused"]);
const OWNER_INPUT_HELPER = String.raw`
import { readFile } from "node:fs/promises";
const [path, port] = process.argv.slice(1);
const events = JSON.parse(await readFile(path, "utf8"));
await new Promise((resolve, reject) => {
  const socket = new WebSocket("ws://127.0.0.1:" + port);
  const timer = setTimeout(() => { socket.close(); reject(new Error("owner input transport timed out")); }, 5000);
  socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("owner input transport unavailable")); }, { once: true });
  socket.addEventListener("open", () => {
    for (const event of events) socket.send(JSON.stringify(event));
    setTimeout(() => { clearTimeout(timer); socket.close(); resolve(); }, 80);
  }, { once: true });
});
`;

type JsonObject = Record<string, unknown>;

function exactBindingAvailable(session: ComputerSessionView): boolean {
  return Boolean(session.sandboxId && session.runId && session.browser?.id && ACTIVE.has(session.status)
    && new Date(session.expiresAt).getTime() > Date.now());
}

function assertExactBinding(session: ComputerSessionView): asserts session is ComputerSessionView & {
  sandboxId: string;
  runId: string;
  browser: NonNullable<ComputerSessionView["browser"]>;
} {
  if (!exactBindingAvailable(session)) {
    throw new Error("Human Takeover requires an active Run, ComputerSession, BrowserSession, and provider session binding.");
  }
}

function sandboxCredentials(): Record<string, string> {
  if (process.env.VERCEL_TOKEN && process.env.VERCEL_TEAM_ID && process.env.VERCEL_PROJECT_ID) {
    return { token: process.env.VERCEL_TOKEN, teamId: process.env.VERCEL_TEAM_ID, projectId: process.env.VERCEL_PROJECT_ID };
  }
  return {};
}

async function exactSandbox(session: ComputerSessionView) {
  assertExactBinding(session);
  try {
    const sandbox = await Sandbox.get({ name: session.sandboxId, resume: false, ...sandboxCredentials() });
    if (["failed", "stopped"].includes(sandbox.status)) throw new LiveSessionLostError();
    return sandbox;
  } catch (error) {
    if (error instanceof LiveSessionLostError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (/not.?found|does not exist|404/i.test(message)) throw new LiveSessionLostError();
    throw new Error("The live Computer provider is temporarily unavailable.", { cause: error });
  }
}

function browserSessionName(session: ComputerSessionView & { sandboxId: string }): string {
  return defaultSessionName("eve", session.sandboxId);
}

async function agentBrowser(session: ComputerSessionView, args: string[]): Promise<JsonObject> {
  assertExactBinding(session);
  const sandbox = await exactSandbox(session);
  const command = await sandbox.runCommand("agent-browser", ["--session", browserSessionName(session), ...args, "--json"], { timeoutMs: 10_000 });
  const stdout = await command.stdout();
  if (command.exitCode !== 0) throw new Error("The live browser transport rejected the request.");
  try {
    const parsed = JSON.parse(stdout) as JsonObject;
    if (parsed.success === false) throw new Error("The live browser transport rejected the request.");
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("The live browser transport returned an invalid response.");
    throw error;
  }
}

function resultData(value: JsonObject): JsonObject {
  const data = value.data;
  return data && typeof data === "object" && !Array.isArray(data) ? data as JsonObject : value;
}

async function currentUrl(session: ComputerSessionView): Promise<string | null> {
  const data = resultData(await agentBrowser(session, ["get", "url"]));
  for (const key of ["url", "value", "result"]) if (typeof data[key] === "string") return data[key] as string;
  return session.browser?.currentUrl ?? null;
}

function inputEvents(input: OwnerInput): JsonObject[] {
  if (input.type === "pointerMove") return [{ type: "input_mouse", eventType: "mouseMoved", x: input.x, y: input.y }];
  if (input.type === "scroll") return [{ type: "input_mouse", eventType: "mouseWheel", x: input.x, y: input.y, deltaX: input.deltaX, deltaY: input.deltaY }];
  if (input.type === "text") return Array.from(input.text).map((text) => ({ type: "input_keyboard", eventType: "char", text }));
  if (input.type === "key") {
    const common = { type: "input_keyboard", key: input.key, code: input.code, modifiers: input.modifiers ?? 0 };
    return [{ ...common, eventType: "keyDown" }, { ...common, eventType: "keyUp" }];
  }
  const button = input.button ?? "left";
  const clickCount = input.type === "doubleClick" ? 2 : 1;
  return [
    { type: "input_mouse", eventType: "mousePressed", x: input.x, y: input.y, button, clickCount },
    { type: "input_mouse", eventType: "mouseReleased", x: input.x, y: input.y, button, clickCount },
  ];
}

async function streamPort(session: ComputerSessionView): Promise<number> {
  const status = resultData(await agentBrowser(session, ["stream", "status"]));
  const port = Number(status.port);
  if (status.enabled !== true || status.connected !== true || !Number.isInteger(port) || port < 1) {
    throw new Error("The owner-input transport is not connected.");
  }
  return port;
}

async function enableOwnerStream(session: ComputerSessionView): Promise<number> {
  const current = resultData(await agentBrowser(session, ["stream", "status"]));
  if (current.enabled !== true || current.connected !== true) {
    await agentBrowser(session, ["stream", "enable"]);
  }
  return streamPort(session);
}

const vercelBrowserProvider: LiveSessionProvider = {
  id: "vercel-agent-browser",
  getCapabilities(session) { return exactBindingAvailable(session) ? VERCEL_BROWSER : UNSUPPORTED; },
  async getLiveView(session) {
    const sandbox = await exactSandbox(session);
    const path = `/tmp/myeve-live-${randomUUID()}.png`;
    try {
      await agentBrowser(session, ["screenshot", path]);
      const bytes = await sandbox.fs.readFile(path);
      return { bytes, contentType: "image/png", currentUrl: await currentUrl(session), observedAt: new Date().toISOString() };
    } finally {
      await sandbox.fs.rm(path, { force: true }).catch(() => undefined);
    }
  },
  async acquireOwnerControl(session) { await enableOwnerStream(session); },
  async sendOwnerInput(session, _controlVersion, input) {
    blockExternalWrite("computer.owner_input");
    const sandbox = await exactSandbox(session);
    const path = `/tmp/myeve-owner-input-${randomUUID()}.json`;
    try {
      await sandbox.fs.writeFile(path, JSON.stringify(inputEvents(input)));
      const command = await sandbox.runCommand("node", ["--input-type=module", "-e", OWNER_INPUT_HELPER, path, String(await streamPort(session))], { timeoutMs: 7_000 });
      if (command.exitCode !== 0) throw new Error("Owner input could not be delivered.");
    } finally {
      await sandbox.fs.rm(path, { force: true }).catch(() => undefined);
    }
  },
  async releaseOwnerControl(session) { await agentBrowser(session, ["stream", "disable"]); },
  async observe(session) {
    assertExactBinding(session);
    return {
      computerSessionId: session.id, browserSessionId: session.browser.id, providerSessionId: session.sandboxId,
      currentUrl: await currentUrl(session), browserStatus: session.browser.status,
      sessionStatus: session.status, observedAt: new Date().toISOString(),
    };
  },
  async closeLiveView() {},
  async getHealth(session) {
    const checkedAt = new Date().toISOString();
    if (!exactBindingAvailable(session)) return { available: false, sessionExists: false, browserConnected: false, checkedAt };
    try {
      const status = resultData(await agentBrowser(session, ["stream", "status"]));
      return { available: true, sessionExists: true, browserConnected: status.connected === true, checkedAt };
    } catch (error) {
      if (error instanceof LiveSessionLostError) return { available: false, sessionExists: false, browserConnected: false, checkedAt };
      return { available: false, sessionExists: true, browserConnected: false, checkedAt };
    }
  },
  async stopSession(session) {
    blockExternalWrite("computer.provider_stop");
    const sandbox = await exactSandbox(session);
    await agentBrowser(session, ["close"]).catch(() => undefined);
    await sandbox.stop();
  },
};

let providerOverride: LiveSessionProvider | null = null;

export function liveSessionProviderFor(_environmentType: ComputerSessionView["environmentType"]): LiveSessionProvider {
  return providerOverride ?? vercelBrowserProvider;
}

export function liveSessionCapabilitiesFor(session: ComputerSessionView): LiveSessionCapabilities {
  return liveSessionProviderFor(session.environmentType).getCapabilities(session);
}

export function setLiveSessionProviderForTests(provider: LiveSessionProvider | null): void {
  providerOverride = provider;
}
