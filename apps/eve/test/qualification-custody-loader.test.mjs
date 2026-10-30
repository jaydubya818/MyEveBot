import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { loadCustody, productionRuntimePorts } from "../lib/qualification/custody-loader.ts";
import { hostBundleSchema } from "../lib/qualification/host-source.ts";

const sha = text => createHash("sha256").update(text).digest("hex");
const MODULE = "/opt/qdev/custody.mjs";
const SOURCE = 'export function custody(context) { return { marker: context.bundle.ownerId }; }';
const context = custody => ({ bundle: { ownerId: "owner-1", custody }, relay: {}, credential: () => undefined });

test("no pinned module, or a malformed pin, loads nothing and reads nothing", async () => {
  let reads = 0;
  const read = async () => { reads++; return Buffer.from(SOURCE); };
  for (const pin of [undefined, { module: MODULE, sha256: "short" }, { module: "custody.mjs", sha256: sha(SOURCE) }, { module: "/opt/qdev/../custody.mjs", sha256: sha(SOURCE) },
    { module: "/opt/qdev/custody.ts", sha256: sha(SOURCE) }, { module: "/opt/qdev/custody.mjs?x=1", sha256: sha(SOURCE) }, { module: "/opt/qdev//custody.mjs", sha256: sha(SOURCE) }])
    assert.equal(await loadCustody(context(pin), { read }), null, JSON.stringify(pin));
  assert.equal(reads, 0);
});

test("bytes that do not match the pinned digest are never imported", async () => {
  let loads = 0;
  const out = await loadCustody(context({ module: MODULE, sha256: sha("other") }), { read: async () => Buffer.from(SOURCE), load: async () => { loads++; return {}; } });
  assert.equal(out, null);
  assert.equal(loads, 0);
});

test("the verified bytes are what run, and the module's custody receives the host context", async () => {
  const out = await loadCustody(context({ module: MODULE, sha256: sha(SOURCE) }), { read: async () => Buffer.from(SOURCE) });
  assert.deepEqual(out, { marker: "owner-1" });
  assert.equal(await loadCustody(context({ module: MODULE, sha256: sha("export const custody = 1;") }), { read: async () => Buffer.from("export const custody = 1;") }), null);
  await assert.rejects(loadCustody(context({ module: MODULE, sha256: sha('export function custody(){ throw new Error("x"); }') }), { read: async () => Buffer.from('export function custody(){ throw new Error("x"); }') }));
});

test("productionRuntimePorts never throws: unreadable, absent or refused custody all disable the ports", async () => {
  assert.equal(await productionRuntimePorts(context(undefined)), null);
  assert.equal(await productionRuntimePorts(context({ module: "/nonexistent/qdev/custody.mjs", sha256: "a".repeat(64) })), null);
});

test("the bundle schema accepts only a strict path+digest custody pin", () => {
  const base = hostBundleSchema.shape;
  assert.ok(base.custody.isOptional());
  assert.ok(base.custody.safeParse({ module: MODULE, sha256: sha(SOURCE) }).success);
  for (const bad of [{ module: MODULE }, { module: MODULE, sha256: "x" }, { module: MODULE, sha256: sha(SOURCE), env: "X" }])
    assert.equal(base.custody.safeParse(bad).success, false);
});
