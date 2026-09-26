import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createExperimentalHarnessBoundary, type ExperimentalHarnessInput } from "./experimental-harness-boundary.ts";

function fixture(now = Date.now()): ExperimentalHarnessInput {
  const workId = randomUUID();
  const scope = { kind: "personal" as const, id: "owner-1" };
  return {
    work: {
      contractVersion: 2,
      workId,
      workVersion: 1,
      criteriaVersion: 1,
      scope,
      humanOwnerId: "owner-1",
      coordinatingAgentId: "sofie-1",
      objective: "Fix quantity parsing",
      criteria: [{ id: randomUUID(), statement: "Reject fractions", evidence: "deterministic" }],
      resourceRefs: ["repo:fixture"],
      allowedOperations: ["deep-agent.start", "file.write"],
      budgetUsd: 1,
      deadline: new Date(now + 60 * 60 * 1000).toISOString(),
      policyVersion: 1,
      composition: { role: { id: "software-engineer", version: 1 }, capabilityPacks: [], mode: { id: "normal", version: 1 } },
      definitionOfDone: ["Protected check passes"],
      allowedRoutes: ["DEEP_AGENT"],
      routingProfile: {
        profileVersion: 1,
        workShape: "localized bug",
        decomposition: "small",
        interaction: "low",
        parallelism: "none",
        verification: "deterministic",
        duration: "bounded",
        ambiguity: "some",
        externalExpertise: "none",
        humanJudgment: "none",
        risk: "low",
      },
      routePolicy: { id: "policy", version: 1 },
    },
    context: {
      contractVersion: 2,
      workId,
      workVersion: 1,
      scope,
      agentId: "sofie-1",
      assembledAt: new Date(now).toISOString(),
      maxTokens: 1000,
      estimatedTokens: 100,
      items: [],
    },
    generation: 1,
    files: { "src/quantity.mjs": "export const quantity = () => 0;", "test/quantity.test.mjs": "test('quantity', () => {});" },
    readablePaths: ["src/quantity.mjs", "test/quantity.test.mjs"],
    writablePaths: ["src/quantity.mjs"],
  };
}

const allow = { assertCurrent: async () => true };

describe("experimental harness boundary", () => {
  it("exposes only selected virtual files and no raw shell, MCP, or host controller to the model", async () => {
    const { tools, host } = createExperimentalHarnessBoundary(fixture(), allow);
    expect(Object.keys(tools).sort()).toEqual(["readFile", "writeFile"]);
    expect(await tools.readFile("src/quantity.mjs")).toContain("quantity");
    for (const path of ["/etc/passwd", "../secrets", "src/../test/quantity.test.mjs", "src\\quantity.mjs", "missing.txt"])
      await expect(tools.readFile(path)).rejects.toThrow();
    expect("execute" in tools).toBe(false);
    expect("checkpoint" in tools).toBe(false);
    expect(host.usage).toEqual({ coverage: "UNKNOWN", providerCostUsd: null });
  });

  it("denies writes outside the selected set and checks current authority before each edit", async () => {
    const seen: string[] = [];
    const guard = { assertCurrent: async (request: { path: string; generation: number; operation: string }) => {
      seen.push(`${request.operation}:${request.path}:${request.generation}`);
      return seen.length === 1;
    } };
    const { tools, host } = createExperimentalHarnessBoundary(fixture(), guard);
    await expect(tools.writeFile({ path: "test/quantity.test.mjs", content: "changed", operationId: randomUUID(), expectedRevision: 0 })).rejects.toThrow("write set");
    expect(seen).toEqual([]);
    const first = await tools.writeFile({ path: "src/quantity.mjs", content: "first", operationId: randomUUID(), expectedRevision: 0 });
    expect(first.revision).toBe(1);
    await expect(tools.writeFile({ path: "src/quantity.mjs", content: "second", operationId: randomUUID(), expectedRevision: 1 })).rejects.toThrow("authority");
    expect(seen).toEqual(["file.write:src/quantity.mjs:1", "file.write:src/quantity.mjs:1"]);
    expect(host.candidate().changedPaths).toEqual(["src/quantity.mjs"]);
    await expect(tools.readFile("src/quantity.mjs")).rejects.toThrow("authority");
  });

  it("rechecks authority before releasing selected file content", async () => {
    const { tools } = createExperimentalHarnessBoundary(fixture(), { assertCurrent: async () => false });
    await expect(tools.readFile("src/quantity.mjs")).rejects.toThrow("authority");
  });

  it("fences an in-flight write when stop is requested", async () => {
    let resolveGuard!: (allowed: boolean) => void;
    const pendingGuard = { assertCurrent: () => new Promise<boolean>(resolve => { resolveGuard = resolve; }) };
    const { tools, host } = createExperimentalHarnessBoundary(fixture(), pendingGuard);
    const pending = tools.writeFile({ path: "src/quantity.mjs", content: "too late", operationId: randomUUID(), expectedRevision: 0 });
    const stopped = host.requestStop();
    resolveGuard(true);
    await expect(pending).rejects.toThrow("authority");
    expect(stopped.stopped).toBe(true);
    expect(host.candidate().revision).toBe(0);
    await expect(tools.readFile("src/quantity.mjs")).rejects.toThrow("stopped");
  });

  it("prevents concurrent lost updates and reuses only identical operation receipts", async () => {
    const { tools, host } = createExperimentalHarnessBoundary(fixture(), allow);
    const operationId = randomUUID();
    const first = await tools.writeFile({ path: "src/quantity.mjs", content: "one", operationId, expectedRevision: 0 });
    expect(await tools.writeFile({ path: "src/quantity.mjs", content: "one", operationId, expectedRevision: 0 })).toEqual(first);
    await expect(tools.writeFile({ path: "src/quantity.mjs", content: "different", operationId, expectedRevision: 1 })).rejects.toThrow("reused");
    await expect(tools.writeFile({ path: "src/quantity.mjs", content: "two", operationId: randomUUID(), expectedRevision: 0 })).rejects.toThrow("revision");
    expect(host.candidate().revision).toBe(1);
  });

  it("round-trips a host-held checkpoint and keeps stopped runs stopped", async () => {
    const input = fixture();
    const { tools, host } = createExperimentalHarnessBoundary(input, allow);
    await tools.writeFile({ path: "src/quantity.mjs", content: "repaired", operationId: randomUUID(), expectedRevision: 0 });
    const snapshot = host.checkpoint();
    const restored = createExperimentalHarnessBoundary(input, allow, snapshot);
    expect(await restored.tools.readFile("src/quantity.mjs")).toBe("repaired");
    expect(restored.host.candidate()).toEqual(host.candidate());
    const stopped = restored.host.requestStop();
    const stoppedAfterRestart = createExperimentalHarnessBoundary(input, allow, stopped);
    await expect(stoppedAfterRestart.tools.writeFile({ path: "src/quantity.mjs", content: "again", operationId: randomUUID(), expectedRevision: 1 })).rejects.toThrow("stopped");
  });

  it("restores a newly created approved file without permitting missing source files", async () => {
    const input = fixture();
    input.readablePaths = [...input.readablePaths, "src/new.mjs"];
    input.writablePaths = [...input.writablePaths, "src/new.mjs"];
    const { tools, host } = createExperimentalHarnessBoundary(input, allow);
    await tools.writeFile({ path: "src/new.mjs", content: "new file", operationId: randomUUID(), expectedRevision: 0 });
    const restored = createExperimentalHarnessBoundary(input, allow, host.checkpoint());
    expect(await restored.tools.readFile("src/new.mjs")).toBe("new file");
    expect(restored.host.candidate()).toEqual(host.candidate());
  });

  it("rejects corrupted, cross-Work, over-budget, and out-of-scope inputs", () => {
    const input = fixture();
    const { host } = createExperimentalHarnessBoundary(input, allow);
    const checkpoint = host.checkpoint();
    expect(() => createExperimentalHarnessBoundary(input, allow, { ...checkpoint, files: { ...checkpoint.files, "src/quantity.mjs": "forged" } })).toThrow("Checkpoint");
    expect(() => createExperimentalHarnessBoundary({ ...input, work: { ...input.work, workId: randomUUID() } }, allow, checkpoint)).toThrow();
    expect(() => createExperimentalHarnessBoundary({ ...input, work: { ...input.work, objective: "Changed without a version bump" } }, allow, checkpoint)).toThrow("Checkpoint");
    expect(() => createExperimentalHarnessBoundary({ ...input, context: { ...input.context, estimatedTokens: 1001 } }, allow)).toThrow("budget");
    expect(() => createExperimentalHarnessBoundary({ ...input, context: { ...input.context, maxTokens: 16_001 } }, allow)).toThrow("token limit");
    expect(() => createExperimentalHarnessBoundary({ ...input, context: { ...input.context, scope: { kind: "personal", id: "other" } } }, allow)).toThrow("scope");
    expect(() => createExperimentalHarnessBoundary({ ...input, files: { ...input.files, "../secret": "value" } }, allow)).toThrow();
    expect(() => createExperimentalHarnessBoundary({ ...input, writablePaths: ["../secret"] }, allow)).toThrow();
  });

  it("bounds individual file and entire workspace size", async () => {
    const input = fixture();
    expect(() => createExperimentalHarnessBoundary({ ...input, files: { "src/quantity.mjs": "x".repeat(65 * 1024) } }, allow)).toThrow("byte limit");
    expect(() => createExperimentalHarnessBoundary({ ...input, files: { "src/quantity.mjs": "x".repeat(40 * 1024), "test/quantity.test.mjs": "y".repeat(40 * 1024) } }, allow)).toThrow("workspace exceeds");
    const { tools } = createExperimentalHarnessBoundary(input, allow);
    await expect(tools.writeFile({ path: "src/quantity.mjs", content: "x".repeat(65 * 1024), operationId: randomUUID(), expectedRevision: 0 })).rejects.toThrow("byte limit");
  });
});
