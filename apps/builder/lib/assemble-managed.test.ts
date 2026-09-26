import assert from "node:assert/strict";
import { it } from "node:test";
import { assembleDeployment } from "./assemble";

it("initializes only a managed Eve's dedicated database before serving it", async () => {
  const input = {
    projectName: `myeve-beta-${"a".repeat(24)}`,
    features: ["knowledge", "goals", "proactive"] as const,
    instructions: "A disposable qualification Eve.",
    schedules: [],
  };
  const managed = await assembleDeployment({ ...input, managed: true });
  const personal = await assembleDeployment(input);
  const packageFor = (files: typeof managed) => JSON.parse(Buffer.from(
    files.find((entry) => entry.file === "package.json")!.data, "base64",
  ).toString("utf8")) as { scripts: { build: string } };
  assert.match(packageFor(managed).scripts.build, /^npm run db:migrate && /);
  assert.doesNotMatch(packageFor(personal).scripts.build, /db:migrate/);
  assert.ok(managed.some((entry) => entry.file === "migrations/0008_persistent_agents.sql"));
});
