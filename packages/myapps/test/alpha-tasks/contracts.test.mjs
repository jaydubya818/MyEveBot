import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import {
  validateAlphaTasksPackage,
  validateTaskData,
  validateOperation,
} from "../../src/alpha-tasks/contracts.ts";
import { validatePackage } from "../../src/contracts.ts";
import { verifySourceClosure } from "../../src/alpha-tasks/source.ts";
test("separate strict profile cannot pass the unchanged CRM contract", () => {
  const { pkg } = fixture();
  assert.deepEqual(validateAlphaTasksPackage(pkg), pkg);
  assert.throws(() => validatePackage(pkg));
  for (const v of [
    { ...pkg, extra: true },
    { ...pkg, origin: { ...pkg.origin, tupleSha256: "f".repeat(64) } },
    { ...pkg, runtime: { ...pkg.runtime, network: "allow" } },
    { ...pkg, spec: { ...pkg.spec, ownerId: "foreign" } },
  ])
    assert.throws(() => validateAlphaTasksPackage(v));
});
test("full closure is bound to independently calculated Git tree and rejects substitution/links/traversal/duplicates", () => {
  const { closure } = fixture();
  assert.equal(verifySourceClosure(closure, closure.tree).tree, closure.tree);
  for (const files of [
    [...closure.files, closure.files[0]],
    [{ ...closure.files[0], path: "../escape" }],
    [{ ...closure.files[0], mode: "120000" }],
    closure.files.map((f, i) =>
      i ? f : { ...f, base64: Buffer.from("changed").toString("base64") },
    ),
  ])
    assert.throws(() =>
      verifySourceClosure({ ...closure, files }, closure.tree),
    );
});
test("data and operations retain exact priorities and reject arbitrary executable inputs", () => {
  assert.deepEqual(
    validateTaskData({
      next: 2,
      tasks: [{ id: 1, title: "Task", done: false, priority: "Low" }],
    }).tasks[0].priority,
    "Low",
  );
  for (const v of [
    { next: 1, tasks: [{ id: 1, title: "X", done: false }] },
    {
      next: 2,
      tasks: [{ id: 1, title: "X", done: false, priority: "Urgent" }],
    },
  ])
    assert.throws(() => validateTaskData(v));
  assert.throws(() => validateOperation("eval", { code: "process.exit()" }));
  assert.throws(() =>
    validateOperation("create", { title: "X", priority: "Urgent" }),
  );
  assert.throws(() =>
    validateOperation("update", { id: 1, patch: { ownerId: "foreign" } }),
  );
});
