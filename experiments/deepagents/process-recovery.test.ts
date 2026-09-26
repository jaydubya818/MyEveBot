import { test } from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { once } from "node:events";

// This tests an actual SIGKILL and fresh Node process with the real SDK and scripted model.
test("SIGKILL after durable edit resumes pending graph tool once without losing the candidate", { timeout: 15000 }, async () => {
  const directory = await mkdtemp("/private/tmp/myeve-er2-process-");
  let child: ReturnType<typeof fork> | undefined;
  try {
    const now = Date.now(), workId = randomUUID(), scope = { kind: "personal", id: "owner" };
    const input = {
      work: { contractVersion: 2, workId, workVersion: 1, criteriaVersion: 1, scope, humanOwnerId: "owner",
        coordinatingAgentId: "sofie", objective: "Repair the synthetic parser", criteria: [{ id: randomUUID(), statement: "Reject fractions", evidence: "deterministic" }],
        resourceRefs: ["fixture:quantity"], allowedOperations: ["deep-agent.start", "file.read", "file.write"], budgetUsd: 2,
        deadline: new Date(now + 120000).toISOString(), policyVersion: 1,
        composition: { role: { id: "software-engineer", version: 1 }, capabilityPacks: [], mode: { id: "normal", version: 1 } },
        definitionOfDone: ["Protected checks pass"], allowedRoutes: ["DEEP_AGENT"],
        routingProfile: { profileVersion: 1, workShape: "localized bug", decomposition: "single", interaction: "low", parallelism: "none", verification: "deterministic", duration: "short", ambiguity: "some", externalExpertise: "none", humanJudgment: "none", risk: "low" },
        routePolicy: { id: "experiment", version: 1 } },
      context: { contractVersion: 2, workId, workVersion: 1, scope, agentId: "sofie", assembledAt: new Date(now).toISOString(), maxTokens: 1000, estimatedTokens: 20, items: [] },
      generation: 1, files: { "quantity.mjs": "broken" }, readablePaths: ["quantity.mjs"], writablePaths: ["quantity.mjs"],
    };
    await writeFile(join(directory, "input.json"), JSON.stringify(input));
    await writeFile(join(directory, "run-id"), randomUUID());
    child = fork(new URL("./process-fixture.ts", import.meta.url), [directory, "start"], { execArgv: ["--import", "tsx"], stdio: ["ignore", "pipe", "pipe", "ipc"] });
    const [message] = await Promise.race([
      once(child, "message"),
      once(child, "exit").then(([code]) => { throw new Error(`Fixture exited before retention: ${code}`); }),
    ]);
    assert.equal(message, "candidate-retained");
    const exited = once(child, "exit"); child.kill("SIGKILL"); await exited;
    const before = JSON.parse(await readFile(join(directory, "boundary.json"), "utf8"));
    assert.equal(before.revision, 1);
    child = fork(new URL("./process-fixture.ts", import.meta.url), [directory, "resume"], { execArgv: ["--import", "tsx"], stdio: ["ignore", "pipe", "pipe", "ipc"] });
    let stderr = ""; child.stderr!.on("data", chunk => { stderr += chunk; });
    const [code] = await once(child, "exit"); assert.equal(code, 0, stderr);
    const after = JSON.parse(await readFile(join(directory, "result.json"), "utf8"));
    assert.equal(after.observation.value.state, "COMPLETED");
    assert.equal(after.checkpoint.revision, 1);
    assert.deepEqual(after.checkpoint.files, before.files);
    assert.deepEqual(after.checkpoint.receipts, before.receipts);
    assert.equal(await readFile(join(directory, "effects.txt"), "utf8"), "file.write\n");
  } finally { child?.kill("SIGKILL"); await rm(directory, { recursive: true, force: true }); }
});
