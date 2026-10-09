import { test } from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReferenceStore } from "../src/store.ts";
import { Crm } from "../src/crm.ts";
import {
  makePackage,
  principal,
  installed,
  verified,
  leadInput,
  OWNER,
} from "./fixtures.mjs";
const run = (workerData) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./concurrent-worker.mjs", import.meta.url),
      { workerData },
    );
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code) reject(Error("worker exit " + code));
    });
  });
test("separate SQLite connections converge duplicate creation/install/actions and reject lost updates", async () => {
  const directory = mkdtempSync(join(tmpdir(), "myapps-concurrency-")),
    path = join(directory, "reference.sqlite"),
    store = new ReferenceStore(path),
    pkg = makePackage();
  try {
    const creation = await Promise.all(
      Array.from({ length: 4 }, () => run({ path, kind: "register" })),
    );
    assert.equal(creation.filter((r) => r.ok).length, 4);
    assert.equal(store.session(principal()).list().length, 1);
    const row = verified(store),
      preview = store.createPreview(OWNER, pkg.appId, 1),
      approval = store
        .session(principal())
        .requestInstall(pkg.appId, preview.id);
    const installs = await Promise.all(
      Array.from({ length: 4 }, () =>
        run({
          path,
          kind: "install",
          id: pkg.appId,
          args: { approvalId: approval.id },
        }),
      ),
    );
    assert.equal(installs.filter((r) => r.ok && !r.result.duplicate).length, 1);
    const actions = await Promise.all(
      Array.from({ length: 4 }, () =>
        run({
          path,
          kind: "action",
          id: pkg.appId,
          hash: row.digest,
          args: { operation: "createLead", input: leadInput, key: "same" },
        }),
      ),
    );
    assert.equal(actions.filter((r) => r.ok).length, 4);
    const crm = new Crm(store, principal()),
      leads = crm.query(pkg.appId, 1, row.digest, "listLeads", {});
    assert.equal(leads.length, 1);
    const writes = await Promise.all(
      ["Proposal", "Won"].map((stage) =>
        run({
          path,
          kind: "action",
          id: pkg.appId,
          hash: row.digest,
          args: {
            operation: "updateStage",
            input: { leadId: leads[0].id, expectedRevision: 1, stage },
            key: stage,
          },
        }),
      ),
    );
    assert.equal(writes.filter((r) => r.ok).length, 1);
    assert.equal(writes.find((r) => !r.ok).error, "LEAD_REVISION_CONFLICT");
  } finally {
    store.close();
    rmSync(directory, { recursive: true });
  }
});
test("update versus disable/revoke remains serializable; two installs cannot overwrite each other", async () => {
  for (const race of ["disable", "revoke", "install"]) {
    const directory = mkdtempSync(join(tmpdir(), "myapps-install-race-")),
      path = join(directory, "reference.sqlite"),
      store = new ReferenceStore(path),
      pkg = makePackage();
    try {
      const row = installed(store),
        next = makePackage(OWNER, 2, { version: 1, digest: row.digest });
      verified(store, next);
      const session = store.session(principal()),
        preview = store.createPreview(OWNER, pkg.appId, 2),
        approval = session.requestInstall(pkg.appId, preview.id);
      const results = await Promise.all([
        run({
          path,
          kind: "install",
          id: pkg.appId,
          args: { approvalId: approval.id },
        }),
        run({
          path,
          kind: race,
          id: pkg.appId,
          args: { approvalId: approval.id, revision: 1, version: 2 },
        }),
      ]);
      const current = session.get(pkg.appId);
      if (race === "revoke")
        assert.equal(session.version(pkg.appId, 2).state, "REVOKED");
      if (race === "disable" && results[1].ok)
        assert.equal(current.enabled, false);
      if (race === "install")
        assert.equal(
          results.filter((r) => r.ok && !r.result.duplicate).length,
          1,
        );
      assert.ok(
        current.installedVersion === 1 || current.installedVersion === 2,
      );
    } finally {
      store.close();
      rmSync(directory, { recursive: true });
    }
  }
});
test("different successor versions racing cannot skip an unapproved base", async () => {
  const directory = mkdtempSync(join(tmpdir(), "myapps-version-race-")),
    path = join(directory, "state.sqlite"),
    store = new ReferenceStore(path),
    pkg = makePackage();
  try {
    const one = installed(store),
      two = makePackage(OWNER, 2, { version: 1, digest: one.digest });
    const second = verified(store, two);
    const three = makePackage(OWNER, 3, { version: 2, digest: second.digest });
    verified(store, three);
    const session = store.session(principal());
    const approvals = [2, 3].map((version) =>
      session.requestInstall(
        pkg.appId,
        store.createPreview(OWNER, pkg.appId, version).id,
      ),
    );
    const results = await Promise.all(
      approvals.map((a) =>
        run({
          path,
          kind: "install",
          id: pkg.appId,
          args: { approvalId: a.id },
        }),
      ),
    );
    assert.equal(results[0].ok, true);
    assert.equal(results[1].ok, false);
    assert.equal(session.get(pkg.appId).installedVersion, 2);
  } finally {
    store.close();
    rmSync(directory, { recursive: true });
  }
});
