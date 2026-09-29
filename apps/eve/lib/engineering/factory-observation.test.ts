import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  receiptDescription,
  requestDescription,
  requestId,
  type HostedConfig,
  type HostedReceipt,
} from "../myfactory-protocol.mjs";
import { observeFactoryIntake, type FactoryRequestBinding } from "./factory-observation.ts";
import type { Work } from "./types.ts";

const now = Date.parse("2026-09-26T16:00:00.000Z");
const idempotencyKey = "fact-1";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const config: HostedConfig = {
  clientId: "myeve", repository: "owner/repo", teamId: "team-1",
  token: "fixture-client-token", receiptPublicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
};
const input = {
  idempotencyKey, title: "Bounded issue", description: "Inspect one issue.",
  kind: "investigation" as const, acceptanceCriteria: ["Report findings"], allowedPaths: ["README.md"],
};
const requestIdValue = requestId(config.clientId, idempotencyKey);
const binding: FactoryRequestBinding = {
  requestId: requestIdValue,
  workId: "9ea93d54-8666-4aaf-8c86-e3d7d4f7971e",
  workVersion: 3,
  workGeneration: 5,
  routeRunId: "bc089b2e-73f2-49b8-b9d3-935739638b28",
  submittedAt: "2026-09-26T15:59:00.000Z",
};
const work = {
  id: binding.workId, version: binding.workVersion, generation: binding.workGeneration,
  lifecycle: "active" as Work["lifecycle"],
};
const run = {
  id: binding.routeRunId, workId: binding.workId, route: "MYFACTORY", workVersion: binding.workVersion,
  workGeneration: binding.workGeneration, status: "QUEUED",
};
const receipt: HostedReceipt = {
  version: 1, issueId: requestIdValue, workOrderId: "wo-17", state: "queued",
  updatedAt: "2026-09-26T15:59:30.000Z", workOrderUrl: "http://127.0.0.1:8788/work/wo-17",
};

function hostedIssue(signedReceipt: HostedReceipt | null = null, key = privateKey) {
  const base = requestDescription(config, input, "2026-10-03T16:00:00.000Z");
  return {
    id: requestIdValue, identifier: "FAC-17", url: "https://linear.app/example/issue/FAC-17",
    title: input.title, team: { id: config.teamId },
    description: signedReceipt ? receiptDescription(base, signedReceipt, key) : base,
  };
}

function graphql(issue: ReturnType<typeof hostedIssue> | null) {
  return vi.fn(async () => ({ issues: { nodes: issue ? [issue] : [] } }));
}

describe("Work-bound MyFactory intake observation", () => {
  it("distinguishes a verified hosted request awaiting local intake from a signed queued receipt", async () => {
    const awaiting = await observeFactoryIntake(work, run, binding, config, graphql(hostedIssue()), now);
    expect(awaiting).toMatchObject({ status: "AWAITING", requestId: requestIdValue, workOrderId: null });

    const admitted = await observeFactoryIntake(work, run, binding, config, graphql(hostedIssue(receipt)), now);
    expect(admitted).toMatchObject({ status: "ADMITTED", workOrderId: "wo-17", receiptUpdatedAt: receipt.updatedAt });
    expect(JSON.stringify(admitted)).not.toMatch(/candidate|checks|usage|published|complete/i);
  });

  it("does not fetch or reuse a receipt after Work version, generation, route or run changes", async () => {
    const read = graphql(hostedIssue(receipt));
    for (const changed of [
      [ { ...work, version: work.version + 1 }, run ],
      [ { ...work, generation: work.generation + 1 }, run ],
      [ work, { ...run, route: "DIRECT" } ],
      [ work, { ...run, workId: "other-work" } ],
      [ work, { ...run, id: "bad-run" } ],
      [ work, { ...run, status: "CANCELLED" } ],
    ] as const) {
      const result = await observeFactoryIntake(changed[0], changed[1], binding, config, read, now);
      expect(result.status).toBe("STALE");
      expect(result.workOrderId).toBeNull();
    }
    expect(read).not.toHaveBeenCalled();
  });

  it("fails closed on invalid signature, wrong request identity and read errors", async () => {
    const otherKey = generateKeyPairSync("ed25519").privateKey;
    const tampered = await observeFactoryIntake(work, run, binding, config, graphql(hostedIssue(receipt, otherKey)), now);
    expect(tampered.status).toBe("UNKNOWN");
    const wrongId = await observeFactoryIntake(work, run, binding, config,
      graphql({ ...hostedIssue(receipt), id: "4d362b87-6acb-4b38-91a3-460eec4b44df" }), now);
    expect(wrongId.status).toBe("UNKNOWN");
    const failed = await observeFactoryIntake(work, run, binding, config, async () => { throw new Error("unavailable"); }, now);
    expect(failed.status).toBe("UNKNOWN");
    expect(failed.workOrderId).toBeNull();
  });

  it("checks signed state and timestamps without inferring completion", async () => {
    const unknownState = await observeFactoryIntake(work, run, binding, config,
      graphql(hostedIssue({ ...receipt, state: "completed" })), now);
    expect(unknownState.status).toBe("UNKNOWN");
    const old = await observeFactoryIntake(work, run, binding, config,
      graphql(hostedIssue({ ...receipt, updatedAt: "2026-09-25T15:59:29.000Z" })), now);
    expect(old.status).toBe("UNKNOWN"); // older than this request's submission
    const staleBinding = { ...binding, submittedAt: "2026-09-24T15:00:00.000Z" };
    const stale = await observeFactoryIntake(work, run, staleBinding, config,
      graphql(hostedIssue({ ...receipt, updatedAt: "2026-09-25T15:59:00.000Z" })), now);
    expect(stale.status).toBe("STALE");
    const future = await observeFactoryIntake(work, run, binding, config,
      graphql(hostedIssue({ ...receipt, updatedAt: "2026-09-26T16:05:00.000Z" })), now);
    expect(future.status).toBe("UNKNOWN");
  });

  it("rejects malformed request bindings before any provider read", async () => {
    const read = graphql(hostedIssue(receipt));
    await expect(observeFactoryIntake(work, run, { ...binding, requestId: "not-a-request-id" },
      config, read, now)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
});
