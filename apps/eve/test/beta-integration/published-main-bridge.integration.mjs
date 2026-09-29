import assert from "node:assert/strict";
import { Client } from "pg";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  loadMigrations,
  runMigrations,
} from "../../scripts/migration-runner.ts";
import { betaTestPort } from "./test-postgres.mjs";
const ref = "d64f2f96003818b2f51341b54a2edd6f426a0dae",
  directory = await mkdtemp(join(tmpdir(), "beta-published-main-"));
const paths = execFileSync(
  "git",
  ["ls-tree", "-r", "--name-only", ref, "apps/eve/migrations"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n");
for (const path of paths)
  await writeFile(
    join(directory, path.split("/").at(-1)),
    execFileSync("git", ["show", ref + ":" + path]),
  );
const old = await loadMigrations(pathToFileURL(directory + "/")),
  current = await loadMigrations();
const admin = new Client(
  `postgresql://postgres@127.0.0.1:${betaTestPort}/postgres`,
);
await admin.connect();
const checks = [];
const pass = (x) => {
  checks.push(x);
  console.log("PASS " + x);
};
async function scenario(run) {
  const name = "beta_main_bridge_" + randomBytes(5).toString("hex");
  await admin.query("CREATE DATABASE " + name);
  const c = new Client(
    `postgresql://postgres@127.0.0.1:${betaTestPort}/${name}`,
  );
  await c.connect();
  const db = {
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
  try {
    await run(c, db);
  } finally {
    await c.end();
    await admin.query("DROP DATABASE " + name);
  }
}
const ledger = async (c) =>
  (
    await c.query(
      "SELECT name,checksum,to_char(applied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS applied_at FROM sofie_schema_migrations ORDER BY name",
    )
  ).rows;
try {
  await scenario(async (c, db) => {
    await runMigrations(db, current, () => {});
    const before = await ledger(c);
    await runMigrations(db, current, () => {});
    assert.deepEqual(await ledger(c), before);
    assert.equal(before.length, (await loadMigrations()).length);
    pass("Fresh complete canonical chain and replay");
  });
  await scenario(async (c, db) => {
    await runMigrations(db, old, () => {});
    await c.query(
      "INSERT INTO app_settings(name,value) VALUES('preserved','private-alpha')",
    );
    await c.query(
      "INSERT INTO memory_records(id,owner_id,scope_type,scope_id,content,provider) VALUES('preserved-memory','owner','owner','owner','Keep this memory','local')",
    );
    const before = await ledger(c),
      memory = (await c.query("SELECT * FROM memory_records")).rows;
    const failing = current.map((m) =>
      m.name.startsWith("0067_")
        ? {
            ...m,
            statements: [
              ...m.statements,
              "SELECT injected_published_bridge_failure()",
            ],
          }
        : m,
    );
    await assert.rejects(
      runMigrations(db, failing, () => {}),
      /injected_published_bridge_failure/,
    );
    assert.deepEqual(await ledger(c), before);
    assert.equal(
      (await c.query("SELECT to_regclass('engineering_work') AS value")).rows[0]
        .value,
      null,
    );
    assert.equal(
      (
        await c.query(
          "SELECT to_regclass('sofie_published_main_bridge') AS value",
        )
      ).rows[0].value,
      null,
    );
    pass("Failure late in bridge rolls back all new DDL and ledger entries");
    await runMigrations(db, current, () => {});
    const after = await ledger(c);
    for (const row of before)
      assert.deepEqual(
        after.find((x) => x.name === row.name),
        row,
      );
    assert(
      !after.some((x) =>
        [
          "0040_app_settings.sql",
          "0062_relay_message_delegations.sql",
        ].includes(x.name),
      ),
    );
    assert.deepEqual(
      (await c.query("SELECT * FROM memory_records")).rows,
      memory,
    );
    assert.equal(
      (await c.query("SELECT value FROM app_settings WHERE name='preserved'"))
        .rows[0].value,
      "private-alpha",
    );
    await c.query("SET TIME ZONE 'Pacific/Auckland'");
    const receipt = (await c.query("SELECT * FROM sofie_published_main_bridge"))
      .rows[0];
    assert.deepEqual(JSON.parse(JSON.stringify(before)), receipt.source_ledger);
    assert.equal(Object.keys(receipt.satisfied_migrations).length, 2);
    await runMigrations(db, current, () => {});
    assert.deepEqual(await ledger(c), after);
    pass(
      "Populated published main bridges atomically, preserving every original row/checksum/timestamp and Memory/settings; equivalents are not claimed as executed",
    );
    await c.query(
      "UPDATE sofie_published_main_bridge SET satisfied_migrations='{}'::jsonb",
    );
    await assert.rejects(
      runMigrations(db, current, () => {}),
      /bridge evidence/,
    );
    assert.deepEqual(await ledger(c), after);
    pass("Tampered bridge receipt is rejected without mutation");
  });
  await scenario(async (c, db) => {
    await runMigrations(db, old, () => {});
    const other = new Client(c.connectionParameters);
    await other.connect();
    const concurrent = {
      query: async (s, p) => (await other.query(s, p)).rows,
      transaction: async (ss) => {
        await other.query("BEGIN");
        try {
          for (const s of ss) await other.query(s.sql, s.params);
          await other.query("COMMIT");
        } catch (e) {
          await other.query("ROLLBACK");
          throw e;
        }
      },
    };
    try {
      const results = await Promise.allSettled([
        runMigrations(db, current, () => {}),
        runMigrations(concurrent, current, () => {}),
      ]);
      assert(results.some((x) => x.status === "fulfilled"));
      assert.equal(
        (
          await c.query(
            "SELECT count(*)::int n FROM sofie_published_main_bridge",
          )
        ).rows[0].n,
        1,
      );
      await runMigrations(db, current, () => {});
      pass(
        "Concurrent migration attempts leave one bridge receipt and a replayable complete lineage",
      );
    } finally {
      await other.end();
    }
  });
  for (const kind of ["checksum", "partial", "schema", "mixed"])
    await scenario(async (c, db) => {
      await runMigrations(db, old, () => {});
      if (kind === "checksum")
        await c.query(
          "UPDATE sofie_schema_migrations SET checksum='unknown' WHERE name='0039_app_settings.sql'",
        );
      if (kind === "partial")
        await c.query(
          "DELETE FROM sofie_schema_migrations WHERE name='0040_relay_message_delegations.sql'",
        );
      if (kind === "schema")
        await c.query(
          "ALTER TABLE app_settings ALTER COLUMN value DROP NOT NULL",
        );
      if (kind === "mixed")
        await c.query(
          "INSERT INTO sofie_schema_migrations(name,checksum) VALUES('0039_engineering_work.sql',$1)",
          [
            current.find((x) => x.name === "0039_engineering_work.sql")
              .checksum,
          ],
        );
      const before = await ledger(c);
      await assert.rejects(
        runMigrations(db, current, () => {}),
        /published-main/i,
      );
      assert.deepEqual(await ledger(c), before);
      pass(kind + " source state fails closed before migration");
    });
  await writeFile(
    new URL(
      "../../../../docs/verification/beta-integration/final-q37/published-main-bridge.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        status: "PASS",
        publishedSource: ref,
        latest: current.at(-1).name,
        checks,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await admin.end();
  await rm(directory, { recursive: true });
}
