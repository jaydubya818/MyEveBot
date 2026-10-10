import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../agents.ts", () => ({ getAgent: vi.fn(async () => ({ id: "local-1", status: "active", name: "Agent", isPrimary: true })) }));

import { connectOwner, rotateOrRevoke } from "../relay/owner.ts";
import { ownerCommand } from "../relay/owner-api.ts";
import { messageReplySettings, saveMessageReplySettings } from "../relay/message-reply-settings.ts";
import {
  ExternalAlphaRelayDenied,
  ExternalAlphaRelayRotationConfirmation,
  assertExternalAlphaRelayOperation,
  assertExternalAlphaRotationConfirmed,
  externalAlphaRelayOperations,
  relayRotationConfirmation,
} from "./relay-link.ts";

const alpha = { EVE_PROJECT_NAME: "myeve-alpha-tester-1" } as unknown as NodeJS.ProcessEnv;
const ALL_OPERATIONS = [
  "connect", "preview", "confirm", "publication-status", "grant", "grant-duration", "message-replies", "revoke-grant", "rotate",
  "revoke-credential", "retire", "poll", "send", "get", "decide", "receipts", "policy", "peer", "artifact-share", "artifact-revoke",
];
/** A store that fails the test if any denied operation reaches it. */
const untouched = new Proxy({}, { get: (_t, key) => { throw new Error("store touched: " + String(key)); } }) as never;

describe("Relay under an external-alpha installation is a view and a link only", () => {
  it("allows exactly connect, rotate, revoke-credential and retire", () => {
    expect([...externalAlphaRelayOperations].sort()).toEqual(["connect", "retire", "revoke-credential", "rotate"]);
    for (const op of ALL_OPERATIONS) {
      if (externalAlphaRelayOperations.has(op)) expect(() => assertExternalAlphaRelayOperation(op, alpha)).not.toThrow();
      else expect(() => assertExternalAlphaRelayOperation(op, alpha), op).toThrow(ExternalAlphaRelayDenied);
    }
  });
  it("leaves every other deployment unchanged", () => {
    for (const op of ALL_OPERATIONS) expect(() => assertExternalAlphaRelayOperation(op, {} as NodeJS.ProcessEnv)).not.toThrow();
  });

  describe("owner commands (process environment)", () => {
    beforeEach(() => vi.stubEnv("EVE_PROJECT_NAME", "myeve-alpha-tester-1"));
    afterEach(() => vi.unstubAllEnvs());
    it.each(ALL_OPERATIONS.filter((op) => !externalAlphaRelayOperations.has(op)))(
      "refuses %s before any handler or store access (peer auto-reply, Relay Work, business ask, grants, sends)",
      async (operation) => {
        await expect(ownerCommand(untouched, { operation, id: "x", input: {} })).rejects.toBeInstanceOf(ExternalAlphaRelayDenied);
      },
    );
    it("auto-reply stays disabled even if a stored setting enables it, and cannot be enabled", async () => {
      const store = { ownerId: "o1", database: { query: vi.fn(async () => [{ value: JSON.stringify({ enabled: true, publicProfile: "share this" }) }]) } };
      expect(await messageReplySettings(store as never)).toEqual({ enabled: false, publicProfile: "" });
      await expect(saveMessageReplySettings(store as never, { enabled: true, publicProfile: "x" })).rejects.toThrow(/RELAY_OPERATION_DENIED/);
      expect(store.database.query).not.toHaveBeenCalled();
    });
  });
  it("auto-reply settings are untouched outside an installation", async () => {
    const store = { ownerId: "o1", database: { query: vi.fn(async () => [{ value: JSON.stringify({ enabled: true, publicProfile: "share this" }) }]) } };
    expect(await messageReplySettings(store as never)).toEqual({ enabled: true, publicProfile: "share this" });
  });
});

describe("linking never silently rotates the Agent credential", () => {
  const network = vi.fn(async () => {
    throw new Error("network must not be reached");
  });
  beforeEach(() => {
    vi.stubEnv("EVE_PROJECT_NAME", "myeve-alpha-tester-1");
    vi.stubGlobal("fetch", network);
    network.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const link = { email: "owner@example.invalid", password: "pw", localAgentId: "local-1" };
  const store = (existing: unknown[]) => {
    let tail = Promise.resolve();
    return ({ ownerId: "o1", database: { query: vi.fn(async () => existing) },
      withOwnerConnectLock: async (run: () => Promise<unknown>) => {
        const previous = tail;
        let release!: () => void;
        tail = new Promise<void>(resolve => { release = resolve; });
        await previous;
        try { return await run(); } finally { release(); }
      },
    }) as never;
  };
  const existing = [{ relay_agent_id: "agent-one", relay_owner_id: "owner-one", local_agent_id: "local-1" }];

  it("pure guard: discloses the rotation and binds the confirmation to the exact Agent", () => {
    const agent = "agent-one";
    let thrown: unknown;
    try {
      assertExternalAlphaRotationConfirmed(agent, undefined, alpha);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ExternalAlphaRelayRotationConfirmation);
    const e = thrown as ExternalAlphaRelayRotationConfirmation;
    expect(e.code).toBe("RELAY_ROTATION_CONFIRMATION_REQUIRED");
    expect(e.disclosure).toMatch(/new credential/);
    expect(e.disclosure).toMatch(/invalidates the old one/);
    expect(e.confirmation).toBe(relayRotationConfirmation(agent));
    expect(() => assertExternalAlphaRotationConfirmed(agent, relayRotationConfirmation(agent), alpha)).not.toThrow();
    // Wrong, empty, other-Agent and non-string confirmations are all refused.
    for (const bad of ["", "yes", "true", true, 1, null, relayRotationConfirmation("agent-two"), relayRotationConfirmation(agent) + " "])
      expect(() => assertExternalAlphaRotationConfirmed(agent, bad, alpha), String(bad)).toThrow(ExternalAlphaRelayRotationConfirmation);
    // A first link has no existing identity, so nothing is rotated.
    expect(() => assertExternalAlphaRotationConfirmed(undefined, undefined, alpha)).not.toThrow();
    // Not an installation: unchanged behaviour.
    expect(() => assertExternalAlphaRotationConfirmed(agent, undefined, {} as NodeJS.ProcessEnv)).not.toThrow();
  });
  it("re-linking an existing Relay Agent needs the confirmation before any network call", async () => {
    await expect(connectOwner(store(existing), link)).rejects.toBeInstanceOf(ExternalAlphaRelayRotationConfirmation);
    await expect(connectOwner(store(existing), { ...link, confirmCredentialRotation: "ROTATE_AGENT_CREDENTIAL:other" })).rejects.toBeInstanceOf(
      ExternalAlphaRelayRotationConfirmation,
    );
    // Choosing an Agent to link also rotates it.
    await expect(connectOwner(store([]), { ...link, relayAgentId: "agent-two" })).rejects.toBeInstanceOf(ExternalAlphaRelayRotationConfirmation);
    expect(network).not.toHaveBeenCalled();
  });
  it("with the exact confirmation the guard passes (the next, unrelated check then applies)", async () => {
    await expect(
      connectOwner(store(existing), { ...link, confirmCredentialRotation: relayRotationConfirmation("agent-one") }),
    ).rejects.toThrow(/pinned Relay signing key/);
    expect(network).not.toHaveBeenCalled();
  });
  it("a first link (no existing Agent) rotates nothing and needs no confirmation", async () => {
    await expect(connectOwner(store([]), link)).rejects.toThrow(/pinned Relay signing key/);
  });
  it("explicit rotation is confirmed too, before the Relay client is built", async () => {
    const connection = { connection: vi.fn(async () => ({ agentId: "agent-one" })) };
    await expect(rotateOrRevoke(connection as never)).rejects.toBeInstanceOf(ExternalAlphaRelayRotationConfirmation);
    await expect(ownerCommand(connection as never, { operation: "rotate" })).rejects.toBeInstanceOf(ExternalAlphaRelayRotationConfirmation);
    expect(network).not.toHaveBeenCalled();
  });
  it("outside an installation the existing behaviour is unchanged (no confirmation requested)", async () => {
    vi.unstubAllEnvs();
    await expect(connectOwner(store(existing), link)).rejects.toThrow(/pinned Relay signing key/);
  });
});
