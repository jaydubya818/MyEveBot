import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";
import { GoalWorkService } from "../../../lib/goal-work/service.ts";
import { GoalWorkQueries } from "../../../lib/goal-work/projections.ts";
import { goalDatabase } from "../../../lib/goal-work/database.ts";
import {
  CanonicalGoalWorkAdapter,
  contractDigest,
} from "../../../lib/goal-work/canonical-adapter.ts";
import { GoalInboxConsumer } from "../../../lib/goal-work/inbox-adapter.ts";
import { goalAttentionEvent } from "../../../lib/goal-work/attention-adapter.ts";
import {
  GoalEventAdapter,
  GoalScheduleAdapter,
} from "../../../lib/goal-work/event-adapters.ts";
import {
  createGoalApi,
  signedGoalAuthenticator,
} from "../../../lib/goal-work/api.ts";
import { createWebSessionToken } from "../../../lib/web-auth.ts";
const repositoryRoot = fileURLToPath(
  new URL("../../../../..", import.meta.url),
);
export const inspectedSources = [];
async function pinned(_folder, sha, paths) {
  const cache = new Map();
  async function load(path) {
    if (cache.has(path)) return cache.get(path);
    const source = execFileSync("git", ["show", `${sha}:${path}`], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    inspectedSources.push({
      commit: sha,
      path,
      sha256: createHash("sha256").update(source).digest("hex"),
    });
    let js = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    for (const match of [...js.matchAll(/\bfrom\s*["']([^"']+)["']/g)]) {
      const spec = match[1];
      let url;
      if (spec.startsWith(".")) {
        let target = posix.normalize(posix.join(posix.dirname(path), spec));
        if (!target.endsWith(".ts")) target += ".ts";
        url = await load(target);
      } else if (spec.startsWith("node:")) continue;
      else url = import.meta.resolve(spec);
      js = js.replace(match[0], `from ${JSON.stringify(url)}`);
    }
    const url = `data:text/javascript;base64,${Buffer.from(js + `\n//# sourceURL=pinned-${sha}/${path}\n`).toString("base64")}`;
    cache.set(path, url);
    return url;
  }
  // Evaluate exact immutable Git objects in memory, never copy sibling source into this branch.
  for (const path of paths) await load(path);
  return async (path) => import(await load(path));
}
export async function integrationRuntime() {
  for (const path of [
    "apps/eve/lib/engineering/knowledge.ts",
    "apps/eve/lib/total-recall/store.ts",
  ]) {
    const commit = "4b31ddebe8235fc1efca154d41ee37061be2a444";
    const source = execFileSync("git", ["show", `${commit}:${path}`], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    inspectedSources.push({
      commit,
      path,
      sha256: createHash("sha256").update(source).digest("hex"),
      mode: "read-only contract inspection",
    });
  }

  const dw = await pinned(
    "digital-worker-integration",
    "21973e5bf646ceec4c68dc90625ff020d405d7a9",
    [
      "apps/eve/lib/engineering/types.ts",
      "apps/eve/lib/digital-worker/contracts.ts",
    ],
  );
  const ui = await pinned(
    "universal-inbox",
    "36675bd5c64fa848b32f7dfbbb349957b5853498",
    [
      "apps/eve/lib/universal-inbox/contracts.ts",
      "apps/eve/lib/universal-inbox/service.ts",
      "apps/eve/lib/universal-inbox/domain.ts",
      "apps/eve/lib/universal-inbox/fixture-repository.ts",
    ],
  );
  const beta = await pinned(
    "beta-product-experience",
    "ed0f6b5dad0e3a131a9f5332139e627245cbd4e8",
    ["apps/eve/components/owner/projection.ts"],
  );
  const memory = await pinned(
    "total-recall-learning",
    "4b31ddebe8235fc1efca154d41ee37061be2a444",
    ["apps/eve/lib/total-recall/learning.ts"],
  );
  const canonical = await dw("apps/eve/lib/digital-worker/contracts.ts");
  const { createWorkSchema } = await dw("apps/eve/lib/engineering/types.ts");
  const { UniversalInbox } = await ui(
    "apps/eve/lib/universal-inbox/service.ts",
  );
  const { FixtureAttentionRepository } = await ui(
    "apps/eve/lib/universal-inbox/fixture-repository.ts",
  );
  const inboxContracts = await ui("apps/eve/lib/universal-inbox/contracts.ts");
  const betaProjection = await beta("apps/eve/components/owner/projection.ts");
  const learning = await memory("apps/eve/lib/total-recall/learning.ts");
  const scratch = await mkdtemp(join(tmpdir(), "goal-integration-"));
  const schema = `goals_${randomUUID().replaceAll("-", "")}`,
    role = `goal_runtime_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({
    host: "127.0.0.1",
    port: Number(process.env.GOAL_TEST_PORT ?? 55473),
    user: "myeve_goals",
    database: "postgres",
    max: 20,
  });
  const admin = await pool.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.query(`SET search_path TO ${schema}`);
  await admin.query(
    "CREATE TABLE task_runs(id text PRIMARY KEY,owner_id text,updated_at timestamptz DEFAULT now())",
  );
  await admin.query(
    await readFile(
      new URL(
        "../../../migrations/0003_goal_operating_system.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await admin.query(
    "INSERT INTO goals(id,owner_id,title,status,success_criteria,completed_at) VALUES('legacy','alice','Old completed Goal','completed','[\"Old outcome\"]',now()); INSERT INTO goal_tasks(id,goal_id,title,status,completed_at) VALUES('legacy-task','legacy','Old task','completed',now())",
  );
  const ddl = await readFile(
    new URL("../../../goal-work-activation/schema.sql", import.meta.url),
    "utf8",
  );
  // Migration application is atomic even if an activation statement fails.
  await admin.query("BEGIN");
  await admin.query(ddl);
  await admin.query("ROLLBACK");
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int n FROM information_schema.columns WHERE table_schema=$1 AND table_name='goals' AND column_name='generation'",
        [schema],
      )
    ).rows[0].n,
    0,
  );
  await admin.query("BEGIN");
  await admin.query(ddl);
  const backfill = await readFile(
    new URL("../../../goal-work-activation/backfill.sql", import.meta.url),
    "utf8",
  );
  await admin.query(backfill);
  await admin.query(backfill);
  await admin.query("COMMIT");
  await admin.query(
    `CREATE ROLE ${role} NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA ${schema} TO ${role}`,
  );
  const access = (
    await readFile(
      new URL("../../../goal-work-activation/access.sql", import.meta.url),
      "utf8",
    )
  ).replaceAll("__GOAL_RUNTIME_ROLE__", `"${role}"`);
  await admin.query(access);
  await admin.query(`CREATE TABLE fixture_canonical(owner_id text,key text,work_id text UNIQUE,input jsonb,intent jsonb,binding jsonb,contract jsonb,receipt jsonb,PRIMARY KEY(owner_id,key));
    CREATE TABLE fixture_sources(event_key text PRIMARY KEY,event jsonb,binding jsonb);
    CREATE TABLE fixture_attention_sources(owner_id text,action_id text,goal_id text,item jsonb,PRIMARY KEY(owner_id,action_id));
    CREATE TABLE fixture_attention_snapshots(owner_id text,goal_id text,revision int,items jsonb,PRIMARY KEY(owner_id,goal_id))`);
  async function connect(restricted = false) {
    const c = await pool.connect();
    await c.query("RESET ROLE");
    await c.query(`SET search_path TO ${schema}`);
    if (restricted) await c.query(`SET ROLE ${role}`);
    return c;
  }
  const raw = {
    async query(sql, p) {
      const c = await connect();
      try {
        return (await c.query(sql, p)).rows;
      } finally {
        c.release();
      }
    },
  };
  const db = (owner) => goalDatabase({ connect: () => connect(true) }, owner);
  let repository = new FixtureAttentionRepository(
    join(scratch, "inbox.sqlite"),
  );
  const inbox = (owner) => new UniversalInbox(owner, repository);
  let configuredBudget = 1,
    crashAfterCanonical = false;
  const gateway = {
    async policy(request) {
      return {
        repository: "fixture/design-partner",
        maxCostUsd: configuredBudget,
        maxDurationSeconds: 300,
        methods: request.criteria.map(() => "test"),
      };
    },
    async ensure(ownerId, input, intent, hints) {
      createWorkSchema.parse(input);
      assert.ok(!("allowedRoutes" in intent));
      assert.ok(!("budgetUsd" in intent));
      const workId = randomUUID(),
        binding = {
          ownerId,
          correlationKey: intent.correlationKey,
          intent,
          input,
          workId,
          workGeneration: 1,
          state: "active",
        };
      const contract = canonical.digitalWorkContractSchema.parse({
        contractVersion: 2,
        workId,
        workVersion: 1,
        criteriaVersion: 1,
        scope: { kind: "personal", id: ownerId },
        humanOwnerId: ownerId,
        coordinatingAgentId: "sofie",
        objective: input.objective,
        criteria: input.criteria.map((c) => ({
          id: c.id,
          statement: c.statement,
          evidence: c.method === "test" ? "deterministic" : "human",
        })),
        resourceRefs: ["repository:fixture/design-partner"],
        allowedOperations: ["repository.read"],
        budgetUsd: input.maxCostUsd,
        deadline: "2035-01-01T00:00:00.000Z",
        policyVersion: 1,
        composition: {
          role: { id: "engineer", version: 1 },
          capabilityPacks: [],
          mode: { id: "bounded", version: 1 },
        },
        definitionOfDone: ["Current criteria independently satisfied"],
        allowedRoutes: ["DIRECT"],
        routingProfile: {
          profileVersion: 1,
          workShape: "bounded task",
          decomposition: "single",
          interaction: "service",
          parallelism: "none",
          verification: "deterministic",
          duration: "short",
          ambiguity: "low",
          externalExpertise: "none",
          humanJudgment: "explicit dependency",
          risk: "fixture",
        },
        routePolicy: { id: "fixture-policy", version: 1 },
      });
      await raw.query(
        "INSERT INTO fixture_canonical(owner_id,key,work_id,input,intent,binding,contract) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb) ON CONFLICT DO NOTHING",
        [
          ownerId,
          intent.correlationKey,
          workId,
          JSON.stringify(input),
          JSON.stringify(intent),
          JSON.stringify(binding),
          JSON.stringify(contract),
        ],
      );
      const [row] = await raw.query(
        "SELECT binding,input,intent FROM fixture_canonical WHERE owner_id=$1 AND key=$2",
        [ownerId, intent.correlationKey],
      );
      assert.deepEqual(row.input, input);
      assert.deepEqual(row.intent, intent);
      if (crashAfterCanonical) {
        crashAfterCanonical = false;
        throw new Error("Lost response after canonical creation");
      }
      return row.binding;
    },
    async find(owner, key) {
      return (
        (
          await raw.query(
            "SELECT binding FROM fixture_canonical WHERE owner_id=$1 AND key=$2",
            [owner, key],
          )
        )[0]?.binding ?? null
      );
    },
    async result(owner, id, resultId) {
      const [r] = await raw.query(
        "SELECT receipt FROM fixture_canonical WHERE owner_id=$1 AND work_id=$2",
        [owner, id],
      );
      if (!r?.receipt || r.receipt.id !== resultId)
        throw new Error("Result not found");
      return r.receipt;
    },
  };
  const validators = {
    create: createWorkSchema,
    contract: canonical.digitalWorkContractSchema,
    proof: canonical.proofOfWorkSchema,
    proofLinkProblems: (w, p) =>
      canonical.proofLinkProblems(
        canonical.digitalWorkContractSchema.parse(w),
        canonical.proofOfWorkSchema.parse(p),
      ),
  };
  const work = new CanonicalGoalWorkAdapter(gateway, validators);
  const responses = {
    read: (owner, id) =>
      repository.transaction((tx) => tx.getResponse(owner, id)),
    async context(owner, actionId) {
      const [r] = await raw.query(
        "SELECT goal_id FROM fixture_attention_sources WHERE owner_id=$1 AND action_id=$2",
        [owner, actionId],
      );
      return r ? { goalId: r.goal_id } : null;
    },
  };
  const signals = {
    async verify(signal) {
      if (signal.kind === "owner") {
        const id = signal.eventId.replace(/^inbox:/, "");
        const r = await responses.read(signal.ownerId, id);
        if (!r || r.status === "CANCELLED") return false;
        const expected = `inbox-response:${r.id}:${contractDigest([r.ownerId, r.itemId, r.action, r.actionBinding, r.answer])}`;
        return signal.evidenceRef === expected && signal.option === r.answer;
      }
      const [row] = await raw.query(
        "SELECT event,binding FROM fixture_sources WHERE event_key=$1",
        [signal.eventId],
      );
      return (
        !!row &&
        row.event.evidenceRef === signal.evidenceRef &&
        Object.entries(row.binding).every(([k, v]) => signal[k] === v)
      );
    },
  };
  const publisher = {
    async reconcile(snapshot) {
      const [old] = await raw.query(
        "SELECT * FROM fixture_attention_snapshots WHERE owner_id=$1 AND goal_id=$2",
        [snapshot.ownerId, snapshot.goalId],
      );
      if (old && old.revision >= snapshot.revision) return;
      for (const item of snapshot.items) {
        await raw.query(
          "INSERT INTO fixture_attention_sources(owner_id,action_id,goal_id,item) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING",
          [snapshot.ownerId, item.id, item.goalId, JSON.stringify(item)],
        );
        await inbox(snapshot.ownerId).ingest(goalAttentionEvent(item));
      }
      for (const missing of (old?.items ?? []).filter(
        (i) => !snapshot.items.some((n) => n.id === i.id),
      )) {
        const id = `attention_${contractDigest([snapshot.ownerId, missing.id, 1])}`,
          current = await repository.get(snapshot.ownerId, id);
        // A canonical response in delivery must settle through its own acknowledgment.
        if (current?.responseId) continue;
        const event = goalAttentionEvent(missing);
        await inbox(snapshot.ownerId).ingest({
          ...event,
          sequence: snapshot.revision,
          action: null,
          disposition: "supersede",
          source: {
            ...event.source,
            eventId: `settle:${missing.id}:${snapshot.revision}`,
          },
        });
      }
      await raw.query(
        "INSERT INTO fixture_attention_snapshots(owner_id,goal_id,revision,items) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(owner_id,goal_id) DO UPDATE SET revision=excluded.revision,items=excluded.items",
        [
          snapshot.ownerId,
          snapshot.goalId,
          snapshot.revision,
          JSON.stringify(snapshot.items),
        ],
      );
    },
  };
  const service = (owner = "alice", actor = "agent") =>
    new GoalWorkService(owner, actor, db(owner), work, signals, publisher);
  const queries = (owner = "alice") => new GoalWorkQueries(owner, db(owner));
  const consumer = (owner) => new GoalInboxConsumer(service(owner), responses);
  const sourceKey = (event) =>
    `source:${contractDigest([event.source, event.accountId, event.id])}`;
  const events = new GoalEventAdapter(
    {
      async resolve(event) {
        const [r] = await raw.query(
          "SELECT event,binding FROM fixture_sources WHERE event_key=$1",
          [sourceKey(event)],
        );
        return r && contractDigest(r.event) === contractDigest(event)
          ? r.binding
          : null;
      },
    },
    service,
  );
  const env = (owner) => ({
    NODE_ENV: "production",
    MYEVE_OWNER_ID: owner,
    MYEVE_ACCESS_PASSWORD: "fixture-local-password",
    MYEVE_SESSION_SECRET: "fixture-only-secret-not-for-real-deployments",
  });
  const api = createGoalApi({
    async authenticate(req) {
      for (const owner of ["alice", "bob"]) {
        const p = await signedGoalAuthenticator(env(owner))(req);
        if (p) return p;
      }
      return null;
    },
    service: (owner) => service(owner, "owner"),
    queries,
    respond: (owner, input) => inbox(owner).respond(input),
  });
  const call = (
    operation,
    owner = "alice",
    method = operation ? "POST" : "GET",
    url = "http://goal.fixture/api/goal-work",
    extraHeaders = {},
  ) =>
    api(
      new Request(url, {
        method,
        headers: {
          cookie: `myeve_session=${createWebSessionToken(env(owner))}`,
          origin: "http://goal.fixture",
          "content-type": "application/json",
          ...extraHeaders,
        },
        ...(method === "POST" ? { body: JSON.stringify(operation) } : {}),
      }),
    );
  async function produce(workId, patch = {}, receiptPatch = {}) {
    const [r] = await raw.query(
      "SELECT * FROM fixture_canonical WHERE work_id=$1",
      [workId],
    );
    const proof = canonical.proofOfWorkSchema.parse({
      contractVersion: 2,
      workId,
      workVersion: r.contract.workVersion,
      criteriaVersion: r.contract.criteriaVersion,
      outcome: "COMPLETED",
      resultRevision: "candidate-v1",
      createdAt: new Date().toISOString(),
      evidence: r.contract.criteria.map((c) => ({
        criterionId: c.id,
        resultRevision: "candidate-v1",
        state: "PASS",
        producer: c.evidence === "human" ? "human" : "trusted-verifier",
        sourceRef: `proof:${c.id}`,
        contentHash: `sha256:${"a".repeat(64)}`,
        observedAt: new Date().toISOString(),
      })),
      artifactRefs: ["artifact:beta"],
      limitations: [],
      ...patch,
    });
    const receipt = {
      id: randomUUID(),
      binding: r.binding,
      contract: r.contract,
      proof,
      integrityVerified: true,
      contentHash: contractDigest(proof),
      workGeneration: 1,
      currentResultRevision: "candidate-v1",
      ...receiptPatch,
    };
    await raw.query(
      "UPDATE fixture_canonical SET receipt=$2::jsonb WHERE work_id=$1",
      [workId, JSON.stringify(receipt)],
    );
    return receipt;
  }
  async function registerEvent(
    goalId,
    taskId,
    dependencyId,
    kind,
    reference,
    eventKind,
  ) {
    const context = await service().context(goalId, taskId),
      type = {
        external: "external_reply",
        file: "file_arrival",
        work: "provider_completion",
        capability: "capability_available",
      }[kind];
    const event = {
      id: randomUUID(),
      source: "fixture-provider",
      accountId: "alice-account",
      kind: eventKind ?? type,
      subjectReference: reference,
      evidenceRef: `provider-receipt:${randomUUID()}`,
      occurredAt: new Date().toISOString(),
    };
    const binding = { ...context, dependencyId, kind, reference };
    await raw.query(
      "INSERT INTO fixture_sources(event_key,event,binding) VALUES($1,$2::jsonb,$3::jsonb)",
      [sourceKey(event), JSON.stringify(event), JSON.stringify(binding)],
    );
    return event;
  }
  return {
    schema,
    role,
    scratch,
    pool,
    admin,
    raw,
    db,
    work,
    gateway,
    canonical,
    validators,
    inboxContracts,
    betaProjection,
    learning,
    service,
    queries,
    consumer,
    inbox,
    api,
    call,
    produce,
    registerEvent,
    events,
    schedule: (now) => new GoalScheduleAdapter(service(), () => new Date(now)),
    setBudget: (n) => (configuredBudget = n),
    crashCreation: () => {
      crashAfterCanonical = true;
    },
    async restart() {
      repository.close();
      repository = new FixtureAttentionRepository(
        join(scratch, "inbox.sqlite"),
      );
    },
    async close() {
      repository.close();
      await admin.query("RESET ROLE");
      await admin.query("SET search_path TO public");
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.query(`DROP ROLE ${role}`);
      admin.release();
      await pool.end();
      await rm(scratch, { recursive: true, force: true });
    },
  };
}
