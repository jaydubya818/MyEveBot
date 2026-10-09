import { afterEach, expect, it, vi } from "vitest";
import { FederationStore } from "./store.ts";
import { encryptSecret } from "./transport.ts";

afterEach(() => vi.unstubAllEnvs());

it.each([
  ["persisted-key", "provider-version", "provider-version"],
  ["different-key", "provider-version", "persisted-key"],
  ["persisted-key", undefined, "persisted-key"],
])("binds the configured version only to its persisted key ID (%s, %s)", async (keyId, version, expected) => {
  vi.stubEnv("MYEVE_RELAY_ENCRYPTION_KEY", "a".repeat(64));
  vi.stubEnv("MYEVE_RELAY_KEY_ID", keyId);
  vi.stubEnv("MYEVE_RELAY_KEY_VERSION", version);
  const store = new FederationStore("owner", {
    query: async () => [{
      signing_key_id: "persisted-key",
      signing_public_key: "public-only fixture",
      agent_credential_encrypted: encryptSecret("owner", "synthetic-agent"),
      owner_session_encrypted: encryptSecret("owner", "synthetic-session"),
    }],
  });
  expect((await store.connection()).keyVersion).toBe(expected);
});
