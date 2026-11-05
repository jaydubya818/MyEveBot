import { expect, it } from "vitest";
import { observeServedDelivery } from "./delivery-observer.ts";

const config = (servedOrigin: string, ownerLocalLoopback?: boolean) => ({ enabled: true, environment: "e", servedOrigin, projectSha256: "a".repeat(64), sourceSha256: "b".repeat(64),
  priorRevision: async () => ({ kind: "ABSENT" }) as never, restorePointId: async () => "r", ...(ownerLocalLoopback === undefined ? {} : { ownerLocalLoopback }) });
// Pins that differ from the candidate: an accepted origin proceeds to (and stops at) the candidate check, before any fetch.
const retained = { inventory: {}, pins: { sourceCommit: "0".repeat(40), sourceTree: "0".repeat(40) }, candidate: { source: { sourceCommit: "0".repeat(40), sourceTree: "0".repeat(40) } } } as never;
const candidate = { commit: "1".repeat(40), tree: "2".repeat(40) };
const code = (c: ReturnType<typeof config>) => observeServedDelivery(c as never, candidate, retained).then(() => "OK", (e: { code?: string }) => e.code);

it("only the owner-local profile may observe the exact IPv4 loopback preview; every other origin stays https-only", async () => {
  expect(await code(config("http://127.0.0.1:8796"))).toBe("QDEV_DELIVERY_URL");
  expect(await code(config("http://127.0.0.1:8796", false))).toBe("QDEV_DELIVERY_URL");
  expect(await code(config("http://127.0.0.1:8796", true))).toBe("QDEV_DELIVERY_CANDIDATE");
  for (const origin of ["http://localhost:8796", "http://127.0.0.1", "http://127.0.0.1:8796/app", "http://10.0.0.1:8796", "http://user:p@127.0.0.1:8796", "ftp://127.0.0.1:8796"])
    expect(await code(config(origin, true))).toBe("QDEV_DELIVERY_URL");
  expect(await code(config("https://apps.example.com"))).toBe("QDEV_DELIVERY_CANDIDATE");
});
