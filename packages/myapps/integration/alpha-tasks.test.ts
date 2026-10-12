import { beforeAll, afterAll, test, expect } from "vitest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import {
  loadMigrations,
  runMigrations,
} from "../../../apps/eve/scripts/migration-runner.ts";
import {
  AlphaTasksApps,
  type AlphaTasksHost,
} from "../../../apps/eve/lib/myapps/alpha-tasks.ts";
import { UniversalInbox } from "../../../apps/eve/lib/universal-inbox/service.ts";
import { PostgresAttentionRepository } from "../../../apps/eve/lib/universal-inbox/postgres-repository.ts";
import { PersistentApps } from "../../../apps/eve/lib/myapps/runtime.ts";
import { alphaTasksCommands } from "../../../apps/eve/lib/myapps/alpha-tasks-api.ts";
import {
  IsolatedExecutionError,
  LocalAlphaTasksIsolation,
} from "../src/alpha-tasks/isolation.ts";
import {
  digest,
  alphaTasksAppId,
  validateAlphaTasksPackage,
} from "../src/alpha-tasks/contracts.ts";
// Public synthetic fixture only; never installed owner/custody records.
// @ts-ignore Node fixture helper uses independently computed Git object hashes.
import { fixture } from "../test/alpha-tasks/fixtures.mjs";
const connection = process.env.MYAPPS_POSTGRES_URL,
  enabled = Boolean(connection && process.env.MYAPPS_ALPHA_DOCKER_TEST === "1");
const name = "myapps_alpha_" + randomUUID().replaceAll("-", "");
const role = name + "_role";
let pool: pg.Pool, admin: pg.Pool, appPool: pg.Pool;
const f = fixture(),
  owner = f.pkg.origin.ownerId,
  human = {
    ownerId: owner,
    actorId: owner,
    kind: "human" as const,
    allowedOperations: ["apps.read", "apps.manage", "apps.install", "apps.run"],
  };
let policyRevision = 1,
  hostEnabled = true;
const runtime = new LocalAlphaTasksIsolation(f.runtime);
let host: AlphaTasksHost, apps: AlphaTasksApps;
beforeAll(async () => {
  if (!enabled) return;
  const url = new URL(connection!);
  if (!["127.0.0.1", "localhost"].includes(url.hostname))
    throw Error("LOCAL_FIXTURE_REQUIRED");
  admin = new pg.Pool({ connectionString: connection });
  await admin.query("CREATE DATABASE " + name);
  url.pathname = "/" + name;
  pool = new pg.Pool({ connectionString: url.href });
  await runMigrations(
    {
      query: async (s: string, p?: unknown[]) => (await pool.query(s, p)).rows,
      transaction: async (statements) => {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          for (const statement of statements)
            await c.query(statement.sql, statement.params);
          await c.query("COMMIT");
        } catch (error) {
          await c.query("ROLLBACK");
          throw error;
        } finally {
          c.release();
        }
      },
    },
    await loadMigrations(),
    () => {},
  );
  await admin.query(
    "CREATE ROLE " +
      role +
      " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS",
  );
  await pool.query("GRANT USAGE ON SCHEMA public TO " + role);
  const tables = (
    await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'myapps_%' OR tablename LIKE 'inbox_attention_%')",
    )
  ).rows;
  for (const { tablename } of tables)
    await pool.query(
      "GRANT SELECT,INSERT,UPDATE,DELETE ON " + tablename + " TO " + role,
    );
  await pool.query("GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO " + role);
  url.username = role;
  appPool = new pg.Pool({ connectionString: url.href });
  host = {
    runtimeId: "synthetic-runtime",
    target: "synthetic-offline",
    enabled: () => hostEnabled,
    assertProfile: (pkg) => {
      if (digest(pkg.runtime) !== digest(f.runtime))
        throw Error("APP_RUNTIME_UNQUALIFIED");
    },
    authorize: async (_c, p, origin) => {
      if (
        p.ownerId !== owner ||
        digest(origin) !== digest(f.pkg.origin) ||
        policyRevision < 0
      )
        throw Error("APP_CAPABILITY_DENIED");
      return { workVersion: 2, workGeneration: 2, policyRevision };
    },
    source: async () => f.closure,
    execute: async (_pkg, source, op, input, data, operationId) =>
      runtime.execute(source, op, input, data, operationId),
  };
  apps = new AlphaTasksApps(appPool as any, host);
}, 120000);
afterAll(async () => {
  await appPool?.end();
  await pool?.end();
  if (admin) {
    await admin.query("DROP DATABASE " + name + " WITH (FORCE)");
    await admin.query("DROP ROLE IF EXISTS " + role);
    await admin.end();
  }
});
async function approval(pkg: any) {
  const preview = await apps.preview(human, pkg.appId, pkg.version),
    item = await apps.requestInstall(human, pkg.appId, preview.previewId);
  const response = await new UniversalInbox(
    owner,
    new PostgresAttentionRepository(appPool as any),
  ).respond({
    itemId: item.id,
    actionId: item.action!.id,
    actionBinding: item.actionBinding!,
    expectedRevision: item.revision,
    idempotencyKey: randomUUID(),
    answer: "Install privately",
  });
  return response.id;
}
test.skipIf(!enabled)(
  "isolated candidate, canonical Needs You, duplicate-safe data, package update and rollback preserve same Mission/original Result",
  async () => {
    const pkg = validateAlphaTasksPackage(f.pkg);
    await apps.prepare(human, pkg);
    await expect(
      apps.install({ ...human, kind: "agent" }, pkg.appId, "missing"),
    ).rejects.toThrow();
    const responseId = await approval(pkg);
    const inbox = new UniversalInbox(
      owner,
      new PostgresAttentionRepository(appPool as any),
    );
    expect(
      await inbox.deliver({
        accept: async (response) => {
          const receipt = await apps.consumeOwnerResponse(human, response);
          if (!receipt) throw Error("unexpected consumer");
          return receipt;
        },
      }),
    ).toBe(1);
    expect(
      (await pool.query("SELECT state FROM myapps_installations")).rows[0].state
        .installedVersion,
    ).toBe(1);
    expect(await apps.install(human, pkg.appId, responseId)).toMatchObject({
      duplicate: true,
    });
    const op = () =>
      apps.operate(
        human,
        pkg.appId,
        1,
        digest(pkg),
        "create",
        { title: "Preserved task", priority: "Low" },
        "create-one",
      );
    const created = await op();
    expect(created.status).toBe("COMPLETED");
    expect(await op()).toEqual(created);
    await expect(
      apps.operate(
        human,
        pkg.appId,
        1,
        digest(pkg),
        "create",
        { title: "Different", priority: "Low" },
        "create-one",
      ),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    const next = validateAlphaTasksPackage({
      ...pkg,
      version: 2,
      base: { version: 1, digest: digest(pkg) },
    });
    await apps.prepare(human, next);
    expect(
      await apps.install(human, pkg.appId, await approval(next)),
    ).toMatchObject({ outcome: "INSTALLED" });
    const rolled = await apps.rollbackCandidate(human, pkg.appId, 1);
    expect(rolled.origin).toEqual(pkg.origin);
    expect(rolled.version).toBe(3);
    expect(
      await apps.install(human, pkg.appId, await approval(rolled)),
    ).toMatchObject({ outcome: "INSTALLED" });
    const listed = await apps.operate(
      human,
      pkg.appId,
      3,
      digest(rolled),
      "list",
      {},
      "list-after",
    );
    expect(listed.output).toEqual([
      { id: 1, title: "Preserved task", done: false, priority: "Low" },
    ]);
    const agent = {
      ...human,
      actorId: "sofie:synthetic-session",
      kind: "agent" as const,
      allowedOperations: human.allowedOperations.filter(
        (operation) => operation !== "apps.install",
      ),
    };
    expect(
      await alphaTasksCommands(apps)(agent, {
        operation: "update",
        appId: pkg.appId,
        version: 3,
        digest: digest(rolled),
        input: { id: 1, patch: { title: "Updated through Sofie" } },
        requestKey: "agent-update-one",
      }),
    ).toMatchObject({ status: "COMPLETED" });
    expect((await apps.catalog(human))[0].tasks[0].title).toBe(
      "Updated through Sofie",
    );
    await expect(
      alphaTasksCommands(apps)(agent, {
        operation: "decideInstall",
        appId: pkg.appId,
        answer: "Install privately",
      }),
    ).rejects.toThrow("INSTALLATION_APPROVAL_REQUIRED");
    await expect(
      apps.operate(
        { ...human, ownerId: "foreign" },
        pkg.appId,
        3,
        digest(rolled),
        "list",
        {},
        "foreign",
      ),
    ).rejects.toThrow();
    const receipt = (
      await pool.query(
        "SELECT state FROM myapps_installations WHERE owner_id=$1",
        [owner],
      )
    ).rows[0].state;
    expect(receipt.history).toHaveLength(3);
    expect(receipt.data.tasks).toHaveLength(1);
    // This is an explicitly labeled package-only update against one synthetic source candidate, not a second Factory Result.
  },
  30000,
);
test.skipIf(!enabled)(
  "stale policy or installed base invalidates approval; revocation prevents operations",
  async () => {
    const prior = (
      await pool.query(
        "SELECT package FROM myapps_candidates WHERE owner_id=$1 ORDER BY version DESC LIMIT 1",
        [owner],
      )
    ).rows[0].package;
    const next = validateAlphaTasksPackage({
      ...prior,
      version: prior.version + 1,
      base: { version: prior.version, digest: digest(prior) },
    });
    await apps.prepare(human, next);
    const response = await approval(next);
    policyRevision++;
    await expect(apps.install(human, next.appId, response)).rejects.toThrow(
      "INSTALLATION_STALE",
    );
    const pendingResponse = (
      await pool.query(
        "SELECT data FROM inbox_attention_responses WHERE id=$1",
        [response],
      )
    ).rows[0].data;
    expect(
      await apps.consumeOwnerResponse(human, pendingResponse),
    ).toMatchObject({ status: "stale" });
    policyRevision = -1;
    await expect(
      apps.operate(
        human,
        prior.appId,
        prior.version,
        digest(prior),
        "list",
        {},
        "revoked",
      ),
    ).rejects.toThrow("APP_CAPABILITY_DENIED");
    policyRevision = 1;
  },
);

test.skipIf(!enabled)(
  "ordinary role enforces owner RLS and legacy CRM does not interpret Alpha Tasks state",
  async () => {
    expect(
      (await appPool.query("SELECT * FROM myapps_installations")).rows,
    ).toEqual([]);
    const c = await appPool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('myeve.myapps_owner','foreign',true)");
      expect((await c.query("SELECT * FROM myapps_candidates")).rows).toEqual(
        [],
      );
      await c.query("ROLLBACK");
    } finally {
      c.release();
    }
    const crm = new PersistentApps(appPool as any, {
      runtimeId: "synthetic",
      target: "offline",
      enabled: () => true,
      verifyResult: async () => {
        throw Error("not used");
      },
    });
    expect(await crm.list(human)).toEqual([]);
    expect(await crm.offers(human)).toEqual([]);
    const savedResponse = (
      await pool.query("SELECT data FROM inbox_attention_responses LIMIT 1")
    ).rows[0].data;
    expect(await crm.consumeOwnerResponse(human, savedResponse)).toBe(null);
    await expect(crm.detail(human, f.pkg.appId, 3)).rejects.toThrow(
      "APP_UNAVAILABLE",
    );
  },
);
test.skipIf(!enabled)(
  "clean failure preserves data; UNKNOWN preview fences further execution and installation",
  async () => {
    const current = (
      await pool.query("SELECT package FROM myapps_candidates WHERE version=3")
    ).rows[0].package;
    const before = (await pool.query("SELECT state FROM myapps_installations"))
      .rows[0].state;
    const execute = host.execute;
    let calls = 0;
    try {
      host.execute = async () => {
        calls++;
        throw new IsolatedExecutionError("CONFIRMED");
      };
      await expect(
        apps.operate(
          human,
          current.appId,
          3,
          digest(current),
          "create",
          { title: "Rejected", priority: "Low" },
          "failure",
        ),
      ).rejects.toThrow("APP_CANDIDATE_REJECTED");
      expect(
        (
          await pool.query(
            "SELECT response FROM myapps_receipts WHERE id='failure'",
          )
        ).rows[0].response,
      ).toMatchObject({ status: "DENIED", cleanup: "CONFIRMED" });
      host.execute = execute;
      expect(
        (
          await apps.operate(
            human,
            current.appId,
            3,
            digest(current),
            "list",
            {},
            "after-failure",
          )
        ).status,
      ).toBe("COMPLETED");
      const candidate = (
        await pool.query(
          "SELECT package FROM myapps_candidates WHERE version=4",
        )
      ).rows[0].package;
      const responseId = await approval(candidate);
      host.execute = async () => {
        calls++;
        throw new IsolatedExecutionError("UNKNOWN");
      };
      await expect(apps.preview(human, current.appId, 3)).rejects.toThrow(
        "APP_CLEANUP_UNKNOWN",
      );
      await expect(apps.preview(human, current.appId, 3)).rejects.toThrow(
        "APP_OPERATION_UNKNOWN",
      );
      await expect(
        apps.operate(
          human,
          current.appId,
          3,
          digest(current),
          "list",
          {},
          "after-unknown",
        ),
      ).rejects.toThrow("APP_OPERATION_UNKNOWN");
      await expect(
        apps.install(human, current.appId, responseId),
      ).rejects.toThrow("APP_OPERATION_UNKNOWN");
      expect(calls).toBe(2);
      expect(
        (await pool.query("SELECT state FROM myapps_installations")).rows[0]
          .state,
      ).toEqual(before);
      expect(
        (
          await pool.query(
            "SELECT response FROM myapps_receipts WHERE response->>'status'='UNKNOWN'",
          )
        ).rows,
      ).toHaveLength(1);
    } finally {
      host.execute = execute;
    }
  },
);
test.skipIf(!enabled || process.env.MYAPPS_ALPHA_BROWSER_TEST !== "1")(
  "signed owner browser installs, updates, rolls back and safely retries an actual isolated app",
  async () => {
    const browserOwner = "synthetic-browser-owner";
    const browserHuman = {
      ...human,
      ownerId: browserOwner,
      actorId: browserOwner,
    };
    const browserPkg = validateAlphaTasksPackage({
      ...f.pkg,
      spec: { ...f.pkg.spec, ownerId: browserOwner },
      origin: { ...f.pkg.origin, ownerId: browserOwner },
      appId: alphaTasksAppId(
        browserOwner,
        f.pkg.origin.installationId,
        f.pkg.origin.missionId,
      ),
    });
    const browserHost: AlphaTasksHost = {
      ...host,
      authorize: async (_c, p, origin) => {
        if (
          p.ownerId !== browserOwner ||
          digest(origin) !== digest(browserPkg.origin)
        )
          throw Error("APP_CAPABILITY_DENIED");
        return { workVersion: 2, workGeneration: 2, policyRevision: 1 };
      },
    };
    const browserApps = new AlphaTasksApps(appPool as any, browserHost);
    // @ts-ignore Browser fixture intentionally lives outside application builds.
    const { qualifyAlphaTasksBrowser } =
      await import("../browser/alpha-tasks.mjs");
    await qualifyAlphaTasksBrowser({
      apps: browserApps,
      human: browserHuman,
      pkg: browserPkg,
      output:
        process.env.MYAPPS_ALPHA_BROWSER_OUTPUT ??
        "/private/tmp/unified-myapps-browser",
    });
  },
  120000,
);
