// Disposable PostgreSQL qualification through the unmodified normal migration runner.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { randomBytes, createHash } from "node:crypto";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  mkdirSync,
  symlinkSync,
} from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
const root = process.cwd();
const canonicalBase = "4d3f1eb685422fc77296cef245e84c5b09da6e91";
const require = createRequire(resolve("../relay-federation/package.json"));
const { Pool } = require("pg");
const temp = mkdtempSync(join(tmpdir(), "myeve-rebase-migrations-"));
const canonical = join(temp, "canonical-base");
mkdirSync(canonical);
execFileSync("tar", ["-x", "-C", canonical], {
  input: execFileSync(
    "git",
    [
      "archive",
      canonicalBase,
      "apps/eve/migrations",
      "apps/eve/scripts/migrate-database.ts",
      "apps/eve/lib/database-schema.ts",
      "apps/eve/package.json",
      "package.json",
    ],
    { cwd: root },
  ),
});
symlinkSync(join(root, "node_modules"), join(canonical, "node_modules"));
const name = `myeve-rebase-migrations-${randomBytes(4).toString("hex")}`;
const password = randomBytes(24).toString("hex"),
  user = process.env.USER;
const output = resolve(
  process.env.MYEVE_QUALIFICATION_OUTPUT ?? "docs/federation/evidence/rebased",
);
mkdirSync(output, { recursive: true });
const report = {
  canonicalBase,
  checks: [],
};
const docker = (...args) =>
  execFileSync("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
const pools = new Map();
let server,
  started = false;
const connection = (database) =>
  `postgresql://${user}:${password}@127.0.0.1:55441/${database}`;
const run = (args, cwd, env = {}) =>
  new Promise((done, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stdout.on("data", (c) => (log += c));
    child.stderr.on("data", (c) => (log += c));
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? done(log) : reject(Error(log))));
  });
try {
  writeFileSync(
    join(temp, "db.env"),
    `POSTGRES_USER=${user}\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=postgres\n`,
    { mode: 0o600 },
  );
  docker(
    "run",
    "-d",
    "--name",
    name,
    "--env-file",
    join(temp, "db.env"),
    "-p",
    "127.0.0.1:55441:5432",
    "postgres:17-alpine",
  );
  started = true;
  for (let i = 0; i < 80; i++) {
    try {
      docker("exec", name, "pg_isready", "-U", user);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  const admin = new Pool({ connectionString: connection("postgres") });
  pools.set(connection("postgres"), admin);
  for (const db of ["fresh", "upgrade"]) {
    await admin.query(`CREATE DATABASE ${db}`);
    pools.set(connection(db), new Pool({ connectionString: connection(db) }));
  }
  server = createServer(async (req, res) => {
    let client;
    try {
      const pool = pools.get(req.headers["neon-connection-string"]);
      if (!pool) throw Error("Unrecognized disposable database");
      client = await pool.connect();
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks));
      const batch = !!body.queries;
      if (batch) await client.query("BEGIN");
      const results = [];
      for (const item of body.queries ?? [body]) {
        const result = await client.query({
          text: item.query,
          values: item.params,
          rowMode: "array",
          types: { getTypeParser: () => (v) => v },
        });
        const r = Array.isArray(result) ? result.at(-1) : result;
        results.push({
          rows: r.rows,
          fields: r.fields.map((f) => ({
            name: f.name,
            dataTypeID: f.dataTypeID,
          })),
          rowCount: r.rowCount,
          command: r.command,
          rowAsArray: true,
        });
      }
      if (batch) await client.query("COMMIT");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(batch ? { results } : results[0]));
    } catch (e) {
      await client?.query("ROLLBACK");
      res
        .writeHead(400, { "content-type": "application/json" })
        .end(JSON.stringify({ message: e.message, code: e.code }));
    } finally {
      client?.release();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const preload = join(temp, "neon-preload.mjs");
  writeFileSync(
    preload,
    `const original=globalThis.fetch;globalThis.fetch=(input,init)=>{const headers=new Headers(init?.headers);if(headers.get('neon-connection-string')===process.env.DATABASE_URL)return original('http://127.0.0.1:${port}/sql',init);return original(input,init);};`,
  );
  const migrate = (cwd, db) =>
    run(["--import", preload, "apps/eve/scripts/migrate-database.ts"], cwd, {
      DATABASE_URL: connection(db),
    });
  const fresh = await migrate(root, "fresh");
  assert.equal((fresh.match(/^Applied /gm) || []).length, 27);
  report.checks.push("Fresh: normal runner applied 27 migrations");
  const before = await migrate(canonical, "upgrade");
  assert.equal((before.match(/^Applied /gm) || []).length, 26);
  const db = pools.get(connection("upgrade"));
  await db.query(
    "INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,max_steps,max_runtime_seconds,max_estimated_cost_usd) VALUES('upgrade-agent','upgrade-owner','primary','Agent','Research','Private instruction',true,'active',30,600,1)",
  );
  await db.query(
    "INSERT INTO task_runs(id,owner_id,kind,title,agent_id,status,max_duration_seconds,max_specialists,max_model_steps,max_retries_per_specialist,max_estimated_cost_usd) VALUES('upgrade-run','upgrade-owner','delegated_work','Private run','upgrade-agent','running',600,0,30,0,1)",
  );
  await db.query(
    `INSERT INTO action_requests(id,owner_id,run_id,action_key,executor,trigger,capability_id,action_class,target,parameter_hash,decision,authority_source,status,provider_receipt,attempt_count) VALUES('action_upgrade','upgrade-owner','upgrade-run','one','{}','{}','files.read','read','{}','original-hash','ALLOW','local','result_unknown','{"receipt":"preserved"}',1)`,
  );
  const snapshot = async () =>
    JSON.stringify(
      await Promise.all(
        ["agents", "task_runs", "action_requests"].map(
          async (t) => (await db.query(`SELECT * FROM ${t} ORDER BY id`)).rows,
        ),
      ),
    );
  const original = await snapshot();
  const upgrade = await migrate(root, "upgrade");
  assert.equal((upgrade.match(/^Applied /gm) || []).length, 1);
  assert.equal(await snapshot(), original);
  report.checks.push(
    "Populated canonical 0026 -> federation 0027: exactly one additive migration; Agent/Run/action data byte-equivalent",
  );
  for (const database of ["fresh", "upgrade"]) {
    const again = await migrate(root, database);
    assert.equal((again.match(/^Already applied /gm) || []).length, 27);
    assert.equal((again.match(/^Applied /gm) || []).length, 0);
  }
  report.checks.push(
    "Normal migration runner rerun: 27 checksums accepted, zero reapplied on both databases",
  );
  const schema = async (pool) =>
    (
      await pool.query(
        "SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
      )
    ).rows;
  assert.deepEqual(
    await schema(db),
    await schema(pools.get(connection("fresh"))),
  );
  report.checks.push(
    "Fresh and upgraded schema columns/defaults/nullability match",
  );
  report.migrations = (
    await db.query(
      "SELECT name,checksum FROM sofie_schema_migrations ORDER BY name",
    )
  ).rows;
  report.federationConstraints = (
    await db.query(
      "SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN (SELECT oid FROM pg_class WHERE relname LIKE 'myeve_relay_%') ORDER BY conname",
    )
  ).rows;
  report.federationIndexes = (
    await db.query(
      "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename LIKE 'myeve_relay_%' ORDER BY indexname",
    )
  ).rows;
  report.preservedDataHash = createHash("sha256")
    .update(original)
    .digest("hex");
  for (const file of [
    "execution-reliability.integration.mjs",
    "action-upgrade.integration.mjs",
  ]) {
    const log = await run(["--import", "tsx", `apps/eve/test/${file}`], root, {
      PGPASSWORD: password,
    });
    writeFileSync(join(output, file + ".txt"), log);
    report.checks.push(`${file}: passed against isolated PostgreSQL`);
  }
  report.status = "PASSED";
} catch (error) {
  report.status = "FAILED";
  report.error = error.message;
  process.exitCode = 1;
  console.error(error.message);
} finally {
  await Promise.all([...pools.values()].map((p) => p.end()));
  if (server) await new Promise((r) => server.close(r));
  if (started) docker("rm", "-f", "-v", name);
  rmSync(temp, { recursive: true, force: true });
  report.cleanup = { containerRemoved: true, credentialsDestroyed: true };
  writeFileSync(
    join(output, "migrations.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      status: report.status,
      checks: report.checks,
      cleanup: report.cleanup,
    }),
  );
}
