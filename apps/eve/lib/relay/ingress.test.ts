import { afterEach, describe, expect, it, vi } from "vitest";
import { ingressHeaders } from "./ingress.ts";
import { connectRelayOwner, RelayClient } from "./client.ts";

const secret = "synthetic-test-only-ingress-value";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("origin-bound server ingress", () => {
  it("does not require or add a bypass without configuration", () => {
    vi.stubEnv("MYEVE_RELAY_INGRESS_SECRETS", "");
    expect(ingressHeaders("https://relay.test")).toEqual({});
  });
  it("sends only the exact pinned origin's credential", () => {
    vi.stubEnv("MYEVE_RELAY_INGRESS_SECRETS", JSON.stringify({ "https://relay.test": secret }));
    expect(ingressHeaders("https://relay.test")).toEqual({ "x-vercel-protection-bypass": secret });
    for (const origin of ["https://relay.test.evil", "https://other.test", "http://relay.test", "https://relay.test:8443"]) expect(ingressHeaders(origin)).toEqual({});
  });
  it.each(["not-json", "[]", "null", '{"http://relay.test":"invalid"}', '{"https://relay.test/path":"invalid"}', '{"https://relay.test":"short"}', JSON.stringify({ "https://relay.test": `${secret}\r\nleak` })])("fails closed on malformed secret configuration", (configuration) => {
    vi.stubEnv("MYEVE_RELAY_INGRESS_SECRETS", configuration);
    expect(() => ingressHeaders("https://relay.test")).toThrow("Federation ingress configuration is invalid.");
  });
  it("adds ingress admission without replacing Agent authorization or permitting redirects", async () => {
    vi.stubEnv("MYEVE_RELAY_ENABLED", "true"); vi.stubEnv("MYEVE_RELAY_ORIGIN", "https://relay.test");
    vi.stubEnv("MYEVE_RELAY_INGRESS_SECRETS", JSON.stringify({ "https://relay.test": secret }));
    const fetch = vi.fn(async () => Response.json({ deliveries: [] })); vi.stubGlobal("fetch", fetch);
    await new RelayClient("synthetic-agent-token").command({ operation: "poll" });
    expect(fetch).toHaveBeenCalledWith("https://relay.test/api/v2/federation", expect.objectContaining({ redirect: "error", headers: expect.objectContaining({ authorization: "Bearer synthetic-agent-token", "x-vercel-protection-bypass": secret }) }));
  });
  it("admits owner login while preserving exact origin and redirect denial", async () => {
    vi.stubEnv("MYEVE_RELAY_ENABLED", "true"); vi.stubEnv("MYEVE_RELAY_ORIGIN", "https://relay.test");
    vi.stubEnv("MYEVE_RELAY_INGRESS_SECRETS", JSON.stringify({ "https://relay.test": secret }));
    const fetch = vi.fn(async () => Response.json({ user: { accountId: "synthetic-owner", id: "synthetic-user" } }, { headers: { "set-cookie": "session=synthetic-only; HttpOnly" } })); vi.stubGlobal("fetch", fetch);
    await connectRelayOwner("synthetic@example.invalid", "synthetic-password");
    expect(fetch).toHaveBeenCalledWith("https://relay.test/api/auth/login", expect.objectContaining({ redirect: "error", headers: expect.objectContaining({ origin: "https://relay.test", "x-vercel-protection-bypass": secret }) }));
  });
  it("keeps federation disabled even with ingress credentials", () => {
    vi.stubEnv("MYEVE_RELAY_ENABLED", "false");
    vi.stubEnv("MYEVE_RELAY_INGRESS_SECRETS", JSON.stringify({ "https://relay.test": secret }));
    expect(() => new RelayClient("synthetic")).toThrow("disabled");
  });
});

// The artifact call site must validate its locally pinned peer before ingress admission.
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { receiveArtifact } from "./artifacts.ts";
import type { FederationStore } from "./store.ts";
import type { Envelope } from "./transport.ts";

it.each([true, false])("artifact ingress keeps source trust mandatory (trusted=%s)", async (trusted) => {
  const source = generateKeyPairSync("ed25519"); const recipient = generateKeyPairSync("ed25519");
  const caller = "relay://source/agent"; const address = "relay://target/agent";
  const header = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({ iss: caller, aud: address, sub: "artifact", exp: Math.floor(Date.now() / 1000) + 120 })).toString("base64url");
  const material = `${header}.${claims}`;
  const token = `${material}.${sign(null, Buffer.from(material), source.privateKey).toString("base64url")}`;
  vi.stubEnv("MYEVE_RELAY_ARTIFACT_PRIVATE_KEY", recipient.privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  vi.stubEnv("MYEVE_RELAY_ENCRYPTION_KEY", "a".repeat(64));
  vi.stubEnv("MYEVE_RELAY_INGRESS_SECRETS", JSON.stringify({ "https://source.test": secret }));
  const fetch = vi.fn(async () => new Response("x")); vi.stubGlobal("fetch", fetch);
  const database = { query: vi.fn(async () => [{ artifact_origin: trusted ? "https://source.test" : "https://different.test", artifact_public_key: source.publicKey.export({ type: "spki", format: "pem" }).toString() }]) };
  const store = { ownerId: "target", connection: async () => ({ address }), database } as unknown as FederationStore;
  const expiresAt = new Date(Date.now() + 120000).toISOString();
  const envelope = { target: { address }, caller: { ownerId: "source", agentId: "agent" }, resource: "artifact", capability: "artifact.share", idempotencyKey: "artifact-test", expiresAt, payload: { reference: "artifact", name: "synthetic", type: "text/plain", size: 1, checksum: `sha256:${createHash("sha256").update("x").digest("hex")}`, visibility: "SHARED", expiresAt, retrieval: { url: `https://source.test/artifact?token=${token}`, audience: address, expiresAt } } } as Envelope;
  if (trusted) {
    await expect(receiveArtifact(store, envelope)).resolves.toEqual({ acknowledged: true });
    expect(fetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: "error", headers: expect.objectContaining({ "x-vercel-protection-bypass": secret, authorization: expect.stringMatching(/^Bearer /) }) }));
  } else {
    await expect(receiveArtifact(store, envelope)).rejects.toThrow("not locally trusted");
    expect(fetch).not.toHaveBeenCalled();
  }
});
