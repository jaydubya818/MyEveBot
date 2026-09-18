import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);

test("work orders use unique identifiers and completed filenames agree with frontmatter", async () => {
  const todoDirectory = new URL("todos/", root);
  const files = (await readdir(todoDirectory)).filter((file) => file.endsWith(".md"));
  const seen = new Set();
  for (const file of files) {
    const source = await readFile(new URL(file, todoDirectory), "utf8");
    const id = source.match(/^issue_id: "(\d+)"$/m)?.[1];
    const status = source.match(/^status: (\w+)$/m)?.[1];
    assert.ok(id, `${file} must declare an issue_id`);
    assert.ok(!seen.has(id), `duplicate work-order issue_id ${id}`);
    seen.add(id);
    if (file.includes("-complete-")) assert.equal(status, "complete", `${file} must be complete`);
    if (file.includes("-ready-")) assert.equal(status, "ready", `${file} must be ready`);
  }
});

test("historical plans and README point to the canonical roadmap", async () => {
  const files = [
    "README.md",
    "docs/plans/2026-09-12-feat-agent-operations-hub-plan.md",
    "docs/plans/2026-09-12-feat-grok-bot-inspired-agent-experience-plan.md",
  ];
  for (const file of files) {
    const source = await readFile(new URL(file, root), "utf8");
    assert.match(source, /roadmap\.md/);
  }
  const roadmap = await readFile(new URL("docs/roadmap.md", root), "utf8");
  assert.match(roadmap, /## Shipped foundation/);
  assert.match(roadmap, /## P1 — Make MyEve genuinely useful/);
  assert.match(roadmap, /Guided first-use setup.+work order 013/);
  assert.match(roadmap, /persistent browser profiles.+work order 014/i);
  assert.match(roadmap, /### 1\. Communications consolidation — next/);
  assert.match(roadmap, /## P3 — Explicitly later/);
});
