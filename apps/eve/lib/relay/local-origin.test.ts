import { afterEach, expect, it, vi } from "vitest";
import { relayOrigin } from "./client.ts";

afterEach(() => vi.unstubAllEnvs());

it.each(["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"])("allows explicit development-only loopback origin %s", origin => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("MYEVE_RELAY_ENABLED", "true");
  vi.stubEnv("MYEVE_RELAY_ALLOW_LOCAL_HTTP", "true");
  vi.stubEnv("MYEVE_RELAY_ORIGIN", origin);
  expect(relayOrigin()).toBe(origin);
});

it.each([
  ["production", "true", "true", "http://localhost:3000"],
  ["test", "true", "true", "http://localhost:3000"],
  ["development", "false", "true", "http://localhost:3000"],
  ["development", "true", "false", "http://localhost:3000"],
  ["development", "true", "true", "http://example.com:3000"],
  ["development", "true", "true", "http://localhost.example.com:3000"],
  ["development", "true", "true", "http://localhost:3000/path"],
  ["development", "true", "true", "http://localhost:3000?query=yes"],
  ["development", "true", "true", "http://user:password@localhost:3000"],
])("rejects unsafe or non-opted-in local configuration %s/%s/%s/%s", (mode, local, enabled, origin) => {
  vi.stubEnv("NODE_ENV", mode);
  vi.stubEnv("MYEVE_RELAY_ENABLED", enabled);
  vi.stubEnv("MYEVE_RELAY_ALLOW_LOCAL_HTTP", local);
  vi.stubEnv("MYEVE_RELAY_ORIGIN", origin);
  expect(() => relayOrigin()).toThrow();
});
