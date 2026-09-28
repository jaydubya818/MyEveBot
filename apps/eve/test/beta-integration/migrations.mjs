import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { writeFile } from "node:fs/promises";
import {
  loadMigrations,
  runMigrations,
} from "../../scripts/migration-runner.ts";
const base = { host: "127.0.0.1", port: 55489, user: "postgres" };
const admin = new Client({ ...base, database: "postgres" });
await admin.connect();
const migrations = await loadMigrations();
const names = [];
const checks = [];
function driver(c) {
  return {
    query: async (s, p) => (await c.query(s, p)).rows,
    transaction: async (ss) => {
      await c.query("BEGIN");
      try {
        for (const s of ss) await c.query(s.sql, s.params);
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      }
    },
  };
}
try {
  for (const upgrade of [false, true]) {
    const name = "myeve_beta_migration_" + randomBytes(6).toString("hex");
    names.push(name);
    await admin.query("CREATE DATABASE " + name);
    const c = new Client({ ...base, database: name });
    await c.connect();
    try {
      if (upgrade)
        await runMigrations(
          driver(c),
          migrations.filter((m) => m.name < "0058"),
          () => {},
        );
      const prefix = (
        await c.query("SELECT to_regclass('sofie_schema_migrations') AS r")
      ).rows[0].r
        ? (await c.query("SELECT * FROM sofie_schema_migrations ORDER BY name"))
            .rows
        : [];
      await runMigrations(driver(c), migrations, () => {});
      const all = (
        await c.query("SELECT * FROM sofie_schema_migrations ORDER BY name")
      ).rows;
      assert.equal(all.length, migrations.length);
      if (upgrade) assert.deepEqual(all.slice(0, prefix.length), prefix);
      await runMigrations(driver(c), migrations, () => {});
      assert.deepEqual(
        (await c.query("SELECT * FROM sofie_schema_migrations ORDER BY name"))
          .rows,
        all,
      );
      checks.push(
        upgrade
          ? "Canonical 0057 upgrade preserves every prefix checksum and applied_at; no-op replay"
          : "Fresh reconciled chain and no-op replay",
      );
    } finally {
      await c.end();
    }
  }
  const old = new Client({ ...base, database: "myeve_beta_qualification" });
  await old.connect();
  try {
    const before = (
      await old.query("SELECT * FROM sofie_schema_migrations ORDER BY name")
    ).rows;
    await assert.rejects(
      runMigrations(driver(old), migrations, () => {}),
      /lineage|checksum|migration/,
    );
    assert.deepEqual(
      (await old.query("SELECT * FROM sofie_schema_migrations ORDER BY name"))
        .rows,
      before,
    );
    checks.push(
      "Preserved Phase 1 database rejects incompatible lineage before mutation; ledger unchanged",
    );
  } finally {
    await old.end();
  }
  await writeFile(
    new URL(
      `../../../../docs/verification/beta-integration/${process.env.MYEVE_BETA_EVIDENCE_PHASE ?? "phase2"}/migration-tests.json`,
      import.meta.url,
    ),
    JSON.stringify(
      {
        status: "PASS",
        count: migrations.length,
        head: migrations.at(-1).name,
        checks,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(checks);
} finally {
  for (const n of names) await admin.query("DROP DATABASE " + n);
  await admin.end();
}
