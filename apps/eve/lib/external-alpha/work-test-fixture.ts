import { createRequire } from "node:module";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { loadMigrations, runMigrations } from "../../scripts/migration-runner.ts";
import { digest } from "../engineering/contract.ts";
import { WorkStore } from "../engineering/store.ts";
import type { Work } from "../engineering/types.ts";
import type { ExecutionDatabase } from "../execution-types.ts";
import { externalAlphaLimits, externalAlphaPolicySchema, type ExternalAlphaPolicy } from "./policy.ts";
import { canonicalJson, ExternalAlphaWorkAuthority, WorkAuthoritySigner, type WorkAuthorityDocument } from "./work-authority.ts";
import { canonicalAlphaTasksWork, sha256Hex } from "./work-tuple.ts";
import {
  fixtureCommands,
  fixtureConfigurationDigest,
  fixtureFactoryId,
  fixtureFactoryVersion,
  fixtureResultKeys,
  fixtureSourceDigest,
  fixtureVerifierPolicySha256,
} from "./result-test-fixture.ts";
import { externalAlphaWorkConfigSchema, type ExternalAlphaWorkConfig } from "./work-config.ts";
import { SharedAlphaAccounting, type AlphaAccountingDatabase } from "./shared-accounting.ts";
import { readFile } from "node:fs/promises";

/** Test support only (disposable localhost PostgreSQL). Never imported by runtime code. */
export const connection = process.env.MYEVE_EXTERNAL_ALPHA_TEST_DATABASE;
const pg = createRequire(import.meta.url)("pg");
export const files = ["src/app.ts", "src/tasks.ts", "test/tasks.test.ts"];

/** One disposable, randomly named database per scenario. Never the app DATABASE_URL. */
export class Env {
  admin: any;
  pool: any;
  resultKeys = fixtureResultKeys();
  name = "ea_work_" + randomUUID().replaceAll("-", "");
  owner = randomUUID();
  policy!: ExternalAlphaPolicy;
  db!: AlphaAccountingDatabase;
  svc!: ExternalAlphaWorkAuthority;
  signer!: WorkAuthoritySigner;
  store!: WorkStore;
  static async create(activate = true, policyOverrides: Partial<ExternalAlphaPolicy> = {}, installAccountingFixture = true) {
    if (!connection) throw Error("Dedicated local test database required");
    const e = new Env();
    const u = new URL(connection);
    if (!["127.0.0.1", "localhost"].includes(u.hostname)) throw Error("Local tests only");
    e.admin = new pg.Pool({ connectionString: connection });
    await e.admin.query("CREATE DATABASE " + e.name);
    u.pathname = "/" + e.name;
    e.pool = new pg.Pool({ connectionString: u.href, max: 12 });
    // Teardown force-drops the database; a late idle-client termination is expected, not a failure.
    e.pool.on("error", () => {});
    e.admin.on("error", () => {});
    await runMigrations(
      {
        query: async (q: string, p: unknown[]) => (await e.pool.query(q, p)).rows,
        transaction: async (ss: any[]) => {
          const c = await e.pool.connect();
          try {
            await c.query("BEGIN");
            for (const s of ss) await c.query(s.sql, s.params);
            await c.query("COMMIT");
          } catch (x) {
            await c.query("ROLLBACK");
            throw x;
          } finally {
            c.release();
          }
        },
      } as any,
      await loadMigrations(),
      () => {},
    );
    e.policy = externalAlphaPolicySchema.parse({
      version: 1,
      kind: "TWO_EXTERNAL_OWNERS_V1",
      cohortId: randomUUID(),
      slot: "1",
      ownerId: e.owner,
      projectId: "prj_fixtureproject1",
      clientId: "external-alpha-" + "a".repeat(32),
      repository: "fixture/myeve-alpha-workspace-01",
      baseSha: "1".repeat(40),
      treeSha: "2".repeat(40),
      workspacePolicy: "ISOLATED_WORKSPACE_V1",
      dayBoundary: "UTC_MIDNIGHT",
      model: "openai/gpt-5.4-mini",
      provider: "vercel-ai-gateway/openai",
      sourceDigest: fixtureSourceDigest,
      factoryVersion: fixtureFactoryVersion,
      limits: { ...externalAlphaLimits },
      publication: false,
      automaticRepair: false,
      fallback: false,
      ...policyOverrides,
    });
    await e.pool.query(
      "INSERT INTO external_alpha_policy(owner_id,policy_sha256,policy)VALUES($1,$2,$3)",
      [e.owner, digest(e.policy), e.policy],
    );
    const token = "e".repeat(64);
    if (installAccountingFixture) {
      await e.pool.query(await readFile(new URL("./shared-accounting.sql", import.meta.url), "utf8"));
      await e.pool.query(await readFile(new URL("./shared-accounting-recovery.sql", import.meta.url), "utf8"));
      await e.pool.query("INSERT INTO external_alpha_cohort(id)VALUES($1)", [e.policy.cohortId]);
      await e.pool.query("INSERT INTO external_alpha_cohort_member(cohort_id,slot,owner_id,policy_sha256,credential_sha256)VALUES($1,$2,$3,$4,encode(sha256(convert_to($5,'UTF8')),'hex'))", [e.policy.cohortId, e.policy.slot, e.owner, digest(e.policy), token]);
    }
    if (activate) await e.activate();
    e.db = { query: async (q, p) => (await e.pool.query(q, p)).rows };
    if (installAccountingFixture) e.db.externalAlphaAccounting = new SharedAlphaAccounting(e.db, token);
    e.signer = new WorkAuthoritySigner(
      generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }) as string,
    );
    e.svc = new ExternalAlphaWorkAuthority(e.db, e.policy, e.signer);
    e.store = new WorkStore({ scopeId: e.owner, actorId: e.owner, scopeKind: "personal" }, e.db as any);
    return e;
  }
  /** Reviewed Work configuration whose pins match this fixture policy and keys. */
  workConfig(receiptKeys: Array<{ keyId: string; publicKey: string }>): ExternalAlphaWorkConfig {
    return externalAlphaWorkConfigSchema.parse({
      allowedFiles: files,
      checkCommands: fixtureCommands,
      factory: {
        origin: "https://fixture-alpha-factory.vercel.app",
        trustedTeamId: "team_fixture",
        receiptKeys,
        resultVerification: {
          factoryId: fixtureFactoryId,
          sourceDigest: fixtureSourceDigest,
          configurationDigest: fixtureConfigurationDigest,
          verifierPolicySha256: fixtureVerifierPolicySha256,
          resultKeys: [this.resultKeys.key],
        },
      },
    });
  }
  activate() {
    return this.pool.query("UPDATE external_alpha_policy SET activated_at=clock_timestamp()").then(() => this.pool.query("UPDATE external_alpha_cohort SET activated_at=clock_timestamp()"));
  }
  async seedWork(over: Record<string, unknown> = {}, scope = this.owner): Promise<Work> {
    const w = canonicalAlphaTasksWork(this.policy.repository, scope);
    const id = randomUUID();
    const v = {
      title: w.title,
      objective: w.objective,
      repository: w.repository,
      control: "agent",
      lifecycle: "active",
      max_cost_usd: 1.3,
      max_duration_seconds: 180,
      criteria: w.criteria,
      ...over,
    } as any;
    await this.pool.query(
      `INSERT INTO engineering_work(id,scope_id,scope_kind,created_by,title,objective,repository,lifecycle,control,version,generation,criteria_version,max_cost_usd,max_duration_seconds,idempotency_key,request_hash)
       VALUES($1,$2,'personal',$2,$3,$4,$5,$6,$7,1,1,1,$8,$9,$10,'x')`,
      [id, scope, v.title, v.objective, v.repository, v.lifecycle, v.control, v.max_cost_usd, v.max_duration_seconds, randomUUID()],
    );
    await this.pool.query(
      "INSERT INTO engineering_work_criteria(scope_id,scope_kind,work_id,version,items,created_by)VALUES($1,'personal',$2,1,$3::jsonb,$1)",
      [scope, id, JSON.stringify(v.criteria)],
    );
    return new WorkStore({ scopeId: scope, actorId: scope, scopeKind: "personal" }, this.db as any).get(id);
  }
  /** Bypasses the TypeScript builder to prove the database independently denies. */
  async rawAdmit(doc: unknown, over: Record<string, unknown> = {}) {
    const canonical = canonicalJson(doc);
    return (
      await this.pool.query("SELECT external_alpha_work_admit($1::jsonb) AS r", [
        JSON.stringify({
          document: doc,
          canonical,
          documentSha256: sha256Hex(canonical),
          signature: "A".repeat(86),
          keyId: "b".repeat(64),
          allowanceId: randomUUID(),
          ownerId: this.owner,
          policySha256: digest(this.policy),
          ...over,
        }),
      ])
    ).rows[0].r;
  }
  async fn(name: string, p: Record<string, unknown>) {
    return (
      await this.pool.query(`SELECT external_alpha_${name}($1::jsonb) AS r`, [
        JSON.stringify({ ownerId: this.owner, policySha256: digest(this.policy), ...p }),
      ])
    ).rows[0].r;
  }
  count(table: string, where = "true") {
    return this.pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`).then((r: any) => r.rows[0].n as number);
  }
  async close() {
    await this.pool?.end();
    if (this.admin) {
      await this.admin.query("DROP DATABASE IF EXISTS " + this.name + " WITH (FORCE)");
      await this.admin.end();
    }
  }
}
export const mutate = (doc: WorkAuthorityDocument, f: (d: any) => void) => {
  const c = structuredClone(doc) as any;
  f(c);
  return c;
};
