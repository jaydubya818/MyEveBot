import {
  factoryAction,
  factoryActionSchema,
} from "../engineering/factory-api.ts";
import { factoryConfig } from "../engineering/factory-routing.ts";
import { GOLDEN_QUALIFICATION_REPOSITORY } from "../engineering/base-preflight.ts";
import { CanonicalBetaWork } from "./canonical-work.ts";
import { createRequire } from "node:module";
import { z } from "zod";
import { webPrincipal, requireSameOrigin } from "../web-auth.ts";
import { boundedJson } from "../relay/client.ts";
import { WorkStore } from "../engineering/store.ts";
import { createWorkSchema, WorkError } from "../engineering/types.ts";
import {
  digitalWorkContractSchema,
  proofOfWorkSchema,
  proofLinkProblems,
} from "../digital-worker/contracts.ts";
import {
  CanonicalGoalWorkAdapter,
  contractDigest,
  type CanonicalGateway,
  type CanonicalBinding,
} from "../goal-work/canonical-adapter.ts";
import {
  goalDatabase,
  type GoalPool,
  type GoalConnection,
} from "../goal-work/database.ts";
import { GoalWorkService } from "../goal-work/service.ts";
import { GoalWorkQueries } from "../goal-work/projections.ts";
import { createGoalApi, signedGoalAuthenticator } from "../goal-work/api.ts";
import { GoalInboxConsumer } from "../goal-work/inbox-adapter.ts";
import { goalAttentionEvent } from "../goal-work/attention-adapter.ts";
import type { NeedsYouPort, SignalPort } from "../goal-work/contracts.ts";
import { UniversalInbox } from "../universal-inbox/service.ts";
import { PostgresAttentionRepository } from "../universal-inbox/postgres-repository.ts";
import { createInboxApi } from "../universal-inbox/api.ts";
import { LearningStore } from "../total-recall/store.ts";
import { WorkRecallStore } from "../total-recall/work-retrieval.ts";
import { assembleSofieRecall } from "../total-recall/sofie-adapter.ts";
import {
  LearningRuntime,
  resultFeedbackSchema,
} from "../total-recall/runtime.ts";
import { goalInput } from "../goal-work/validation.ts";
import { learningCommandSchema } from "../total-recall/learning.ts";
import { EngineeringKnowledgeStore } from "../engineering/knowledge.ts";

export interface BetaPolicy {
  repository: string;
  maxCostUsd: number;
  maxDurationSeconds: number;
}
/** Only composition and persistence. Product commands use canonical admission; this module never dispatches a provider. */
export class BetaIntegration {
  constructor(
    readonly pool: GoalPool,
    readonly policy: BetaPolicy,
  ) {}
  private rolePool(role: "myeve_beta_goals" | "myeve_beta_inbox"): GoalPool {
    return {
      connect: async () => {
        const c = await this.pool.connect();
        return {
          release: () => c.release(),
          query: async (sql, params) => {
            const result = await c.query(sql, params);
            if (sql === "BEGIN") await c.query(`SET LOCAL ROLE ${role}`);
            return result;
          },
        };
      },
    };
  }
  async transaction<T>(run: (c: GoalConnection) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        "SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15s'",
      );
      const value = await run(c);
      await c.query("COMMIT");
      return value;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async query(sql: string, params?: unknown[]) {
    const c = await this.pool.connect();
    try {
      return (await c.query(sql, params)).rows;
    } finally {
      c.release();
    }
  }
  store(owner: string) {
    return new WorkStore(
      { scopeId: owner, actorId: owner, scopeKind: "personal" },
      this,
    );
  }
  repository() {
    return new PostgresAttentionRepository(this.rolePool("myeve_beta_inbox"));
  }
  inbox(owner: string) {
    return new UniversalInbox(owner, this.repository());
  }
  database(owner: string) {
    return goalDatabase(this.rolePool("myeve_beta_goals"), owner);
  }
  queries(owner: string) {
    return new GoalWorkQueries(owner, this.database(owner));
  }
  gateway(): CanonicalGateway {
    return {
      policy: async (request) => ({
        ...this.policy,
        methods: request.criteria.map(() => "test" as const),
      }),
      find: async (owner, key) =>
        (
          await this.query(
            "SELECT binding FROM beta_goal_work_bindings WHERE owner_id=$1 AND correlation_key=$2",
            [owner, key],
          )
        )[0]?.binding ?? null,
      ensure: async (owner, input, intent) =>
        this.transaction(async (c) => {
          if (owner !== intent.ownerId) throw new Error("Work owner mismatch");
          await c.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,958))",
            [owner + ":" + intent.correlationKey],
          );
          const prior = (
            await c.query(
              "SELECT binding FROM beta_goal_work_bindings WHERE owner_id=$1 AND correlation_key=$2",
              [owner, intent.correlationKey],
            )
          ).rows[0]?.binding;
          if (prior) {
            if (
              contractDigest(prior.input) !== contractDigest(input) ||
              contractDigest(prior.intent) !== contractDigest(intent)
            )
              throw new Error("Work intent conflict");
            return prior;
          }
          const store = new WorkStore(
            { scopeId: owner, actorId: owner, scopeKind: "personal" },
            { query: async (sql, p) => (await c.query(sql, p)).rows },
          );
          const { work } = await store.create(input);
          const binding: CanonicalBinding = {
            ownerId: owner,
            correlationKey: intent.correlationKey,
            intent,
            input,
            workId: work.id,
            workGeneration: work.generation,
            state: "AWAITING_ADMISSION",
          };
          await c.query(
            "INSERT INTO beta_goal_work_bindings(owner_id,correlation_key,work_id,binding) VALUES($1,$2,$3,$4::jsonb)",
            [owner, intent.correlationKey, work.id, JSON.stringify(binding)],
          );
          return binding;
        }),
      result: async (owner, workId, resultId) => {
        const work = await this.store(owner).get(workId);
        const [row] = await this.query(
          `SELECT r.*, b.binding, COALESCE(p.contract,rd.admission_authority_snapshot->'contract') AS contract, COALESCE(p.source,'CANONICAL') AS source, (SELECT latest.candidate_sha FROM engineering_native_results latest WHERE latest.scope_id=r.scope_id AND latest.scope_kind=r.scope_kind AND latest.work_id=r.work_id ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1) AS latest_revision FROM engineering_native_results r
          JOIN beta_goal_work_bindings b ON b.owner_id=r.scope_id AND b.work_id=r.work_id
          LEFT JOIN beta_result_provenance p ON p.owner_id=r.scope_id AND p.result_id=r.id
          LEFT JOIN engineering_direct_workspaces ws ON ws.scope_id=r.scope_id AND ws.scope_kind=r.scope_kind AND ws.work_id=r.work_id
          LEFT JOIN engineering_routing_decisions rd ON rd.id=ws.decision_id
          WHERE r.scope_id=$1 AND r.scope_kind='personal' AND r.work_id=$2 AND r.id=$3`,
          [owner, workId, resultId],
        );
        if (!row) throw new Error("Result not found");
        const contract = digitalWorkContractSchema.parse(row.contract);
        const proof = proofOfWorkSchema.parse(row.proof);
        const current =
          contract.workVersion === work.version &&
          contract.criteriaVersion === work.criteriaVersion &&
          contract.objective === work.objective &&
          row.work_generation === work.generation &&
          row.candidate_sha === row.latest_revision;
        return {
          id: resultId,
          binding: row.binding,
          contract,
          proof,
          contentHash: row.content_hash,
          integrityVerified:
            current && contractDigest(proof) === row.content_hash,
          workGeneration: row.work_generation,
          currentResultRevision: current ? row.candidate_sha : null,
        };
      },
    };
  }
  workAdapter() {
    return new CanonicalGoalWorkAdapter(this.gateway(), {
      create: createWorkSchema,
      contract: digitalWorkContractSchema,
      proof: proofOfWorkSchema,
      proofLinkProblems: (w, p) =>
        proofLinkProblems(
          digitalWorkContractSchema.parse(w),
          proofOfWorkSchema.parse(p),
        ),
    });
  }
  responses() {
    return {
      read: (owner: string, id: string) =>
        this.repository().transaction((tx) => tx.getResponse(owner, id)),
      context: async (owner: string, action: string) => {
        const [row] = await this.query(
          `SELECT goal_id FROM beta_goal_attention_snapshots WHERE owner_id=$1
        AND EXISTS(SELECT FROM jsonb_array_elements(snapshot->'items') i WHERE i->>'id'=$2)`,
          [owner, action],
        );
        return row ? { goalId: String(row.goal_id) } : null;
      },
    };
  }
  signals(): SignalPort {
    return {
      verify: async (signal) => {
        if (signal.kind !== "owner") return false; // Provider adapters require their own authenticated receipt source.
        const response = await this.responses().read(
          signal.ownerId,
          signal.eventId.replace(/^inbox:/, ""),
        );
        if (!response || !["PENDING", "DELIVERED"].includes(response.status))
          return false;
        const expected = `inbox-response:${response.id}:${contractDigest([response.ownerId, response.itemId, response.action, response.actionBinding, response.answer])}`;
        if (
          signal.evidenceRef !== expected ||
          signal.option !== response.answer
        )
          return false;
        const [prior] = await this.query(
          "SELECT payload FROM goal_work_signals WHERE owner_id=$1 AND event_id=$2",
          [signal.ownerId, signal.eventId],
        );
        if (prior)
          return contractDigest(prior.payload) === contractDigest(signal);
        const [snapshot] = await this.query(
          "SELECT snapshot FROM beta_goal_attention_snapshots WHERE owner_id=$1 AND goal_id=$2",
          [signal.ownerId, signal.goalId],
        );
        const item = snapshot?.snapshot.items.find(
          (candidate: { id: string }) => candidate.id === response.action.id,
        );
        return (
          !!item &&
          [
            "ownerId",
            "goalId",
            "taskId",
            "goalGeneration",
            "taskGeneration",
            "dependencyId",
            "reference",
          ].every((key) => item[key] === signal[key as keyof typeof signal]) &&
          contractDigest(goalAttentionEvent(item).action) ===
            response.actionBinding
        );
      },
    };
  }
  publisher(): NeedsYouPort {
    return {
      reconcile: async (snapshot) =>
        this.transaction(async (c) => {
          await c.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,959))",
            [snapshot.ownerId + ":" + snapshot.goalId],
          );
          const old = (
            await c.query(
              "SELECT revision,snapshot FROM beta_goal_attention_snapshots WHERE owner_id=$1 AND goal_id=$2",
              [snapshot.ownerId, snapshot.goalId],
            )
          ).rows[0];
          if (old && old.revision >= snapshot.revision) return;
          const inbox = this.inbox(snapshot.ownerId);
          for (const item of snapshot.items)
            await inbox.ingest(goalAttentionEvent(item));
          for (const item of old?.snapshot.items ?? []) {
            if (snapshot.items.some((next) => next.id === item.id)) continue;
            const id = `attention_${contractDigest([snapshot.ownerId, item.id, 1])}`;
            const current = await inbox.repository.get(snapshot.ownerId, id);
            if (current?.responseId) continue;
            const event = goalAttentionEvent(item);
            await inbox.ingest({
              ...event,
              sequence: snapshot.revision,
              action: null,
              disposition: "supersede",
              source: {
                ...event.source,
                eventId: `settle:${item.id}:${snapshot.revision}`,
              },
            });
          }
          await c.query(
            `INSERT INTO beta_goal_attention_snapshots(owner_id,goal_id,revision,snapshot) VALUES($1,$2,$3,$4::jsonb)
      ON CONFLICT(owner_id,goal_id) DO UPDATE SET revision=excluded.revision,snapshot=excluded.snapshot`,
            [
              snapshot.ownerId,
              snapshot.goalId,
              snapshot.revision,
              JSON.stringify(snapshot),
            ],
          );
        }),
    };
  }
  service(owner: string, actor: "owner" | "agent" = "agent") {
    return new GoalWorkService(
      owner,
      actor,
      this.database(owner),
      this.workAdapter(),
      this.signals(),
      this.publisher(),
    );
  }
  async deliver(owner: string) {
    const reader = this.responses();
    const consumer = new GoalInboxConsumer(this.service(owner), {
      ...reader,
      read: async (o, id) => {
        const r = await reader.read(o, id);
        return r && r.status !== "STALE" ? { ...r, status: r.status } : null;
      },
    });
    return this.inbox(owner).deliver({
      accept: async (r) => {
        if (r.status === "STALE")
          return { status: "stale", receipt: `goal-response-stale:${r.id}` };
        if (r.workId && !r.goal) return new CanonicalBetaWork(this).accept(r);
        const receipt = await consumer.accept({ ...r, status: r.status });
        return {
          status: receipt.startsWith("goal-response-stale:")
            ? "stale"
            : "accepted",
          receipt,
        };
      },
    });
  }
  async recall(
    owner: string,
    workId: string,
    query: string,
    reference: string,
  ) {
    const store = this.store(owner),
      work = await store.get(workId);
    const context = await assembleSofieRecall(
      new WorkRecallStore(store),
      {
        contractVersion: 1,
        ownerId: owner,
        workId,
        workVersion: work.version,
        repository: work.repository,
        objective: work.objective,
        projectId: null,
        context: {
          query,
          purpose: "plan",
          workType: "implementation",
          reference,
        },
        scope: { selectedKnowledge: [], selectedOwnerMemoryIds: [] },
        limits: { maxItems: 12, maxCharacters: 16000, minRelevance: 0.1 },
      },
      new LearningStore(store),
    );
    await this.query(
      `INSERT INTO beta_work_contexts(owner_id,work_id,context_ref,document) VALUES($1,$2,$3,$4::jsonb)
      ON CONFLICT DO NOTHING`,
      [owner, workId, reference, JSON.stringify(context)],
    );
    return context;
  }
}

let instance: BetaIntegration | undefined;
/** Explicit local qualification activation. Never reads the deployment DATABASE_URL. */
export function betaIntegration() {
  if (
    process.env.MYEVE_BETA_MODE !== "qualification" ||
    process.env.VERCEL_ENV === "production"
  )
    throw new Error("Beta integration is not enabled");
  if (!instance) {
    const url = new URL(process.env.MYEVE_BETA_DATABASE_URL ?? "");
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !/^\/myeve_beta_[a-z0-9_]+$/.test(url.pathname)
    )
      throw new Error("Disposable beta database required");
    const { Pool } = createRequire(import.meta.url)("pg") as {
      Pool: new (config: object) => GoalPool;
    };
    instance = new BetaIntegration(
      new Pool({ connectionString: url.href, max: 12 }),
      {
        repository: GOLDEN_QUALIFICATION_REPOSITORY,
        maxCostUsd: 1,
        maxDurationSeconds: 300,
      },
    );
  }
  return instance;
}
export async function betaRequest(
  request: Request,
  resource: string,
): Promise<Response> {
  const headers = { "cache-control": "no-store" };
  try {
    const principal = webPrincipal(request, {
      ...process.env,
      NODE_ENV: "production",
    });
    if (!principal)
      return Response.json(
        { error: "Sign in to continue." },
        { status: 401, headers },
      );
    if (requireSameOrigin(request))
      return Response.json(
        { error: "Same-origin request required." },
        { status: 403, headers },
      );
    const beta = betaIntegration(),
      owner = principal.id;
    if (resource === "goals")
      return createGoalApi({
        authenticate: signedGoalAuthenticator(),
        service: (o) => beta.service(o, "owner"),
        queries: (o) => beta.queries(o),
        respond: async (o, v) => {
          const response = await beta
            .inbox(o)
            .respond(v as Parameters<UniversalInbox["respond"]>[0]);
          await beta.deliver(o);
          return response;
        },
      })(request);
    if (resource === "inbox") {
      const response = await createInboxApi({
        repository: beta.repository(),
        authenticate: signedGoalAuthenticator(),
        sourceAuthority: {
          admit: async () => null,
          canRead: async (o, s) =>
            ["notification", "work"].includes(s.system) &&
            s.accountId === o &&
            s.grantId === null,
        },
      })(request);
      if (request.method === "POST" && response.ok) await beta.deliver(owner);
      return response;
    }
    const url = new URL(request.url),
      id = url.searchParams.get("workId");
    if (request.method === "GET") {
      if (resource === "work")
        return Response.json(
          {
            works: id
              ? [await beta.store(owner).get(z.string().uuid().parse(id))]
              : await beta.store(owner).list(),
            ...(id
              ? {
                  canonical: await new CanonicalBetaWork(beta).projection(
                    owner,
                    id,
                  ),
                }
              : {}),
          },
          { headers },
        );
      if (resource === "activity")
        return Response.json(
          {
            changes: await beta.query(
              `
          SELECT 'memory:'||k.id AS id,'Memory '||k.status AS kind,k.statement AS summary,k.updated_at AS at,w.work_id::text AS work_id
          FROM knowledge_records k JOIN engineering_work_knowledge w ON w.scope_id=k.owner_id AND w.knowledge_id=k.id
          WHERE k.owner_id=$1 AND w.scope_kind='personal'
          UNION ALL
          SELECT 'learning:'||l.id AS id,'Learning changed' AS kind,l.document->'scope'->>'repository' AS summary,l.updated_at AS at,l.work_id::text
          FROM recall_learning l WHERE l.owner_id=$1
          ORDER BY at DESC,id LIMIT 50`,
              [owner],
            ),
          },
          { headers },
        );
      if (resource === "results")
        return Response.json(
          {
            results: await beta.query(
              `SELECT r.id,r.work_id,r.proof,r.content_hash,r.created_at,r.candidate_sha,COALESCE(p.source,'CANONICAL') AS source,CASE rd.selected_route WHEN 'DEEP_AGENT' THEN 'DIRECT_SOFIE' WHEN 'MYFACTORY' THEN 'MYFACTORY' WHEN 'HUMAN' THEN 'HUMAN' ELSE NULL END AS route, CASE WHEN p.source='LOCAL_FIXTURE' OR EXISTS(SELECT FROM jsonb_array_elements(COALESCE(ws.evidence,'[]'::jsonb)) e WHERE e#>>'{artifact,qualification}'='CONTROLLED_LOCAL_FIXTURE_NOT_LIVE') THEN 'CONTROLLED_LOCAL_FIXTURE' ELSE 'NOT_LIVE_QUALIFIED' END AS verification_mode FROM engineering_native_results r
        LEFT JOIN beta_result_provenance p ON p.owner_id=r.scope_id AND p.result_id=r.id
          LEFT JOIN engineering_direct_workspaces ws ON ws.scope_id=r.scope_id AND ws.scope_kind=r.scope_kind AND ws.work_id=r.work_id
          LEFT JOIN engineering_routing_decisions rd ON rd.id=ws.decision_id WHERE r.scope_id=$1 AND r.scope_kind='personal' AND (p.result_id IS NOT NULL OR rd.admission_authority_snapshot IS NOT NULL) ORDER BY r.created_at DESC,r.id LIMIT 100`,
              [owner],
            ),
          },
          { headers },
        );
      if (resource === "memory")
        return Response.json(
          {
            facts: id
              ? await new EngineeringKnowledgeStore(beta.store(owner)).list(
                  z.string().uuid().parse(id),
                  { limit: 100, includeHistory: true },
                )
              : [],
            families: await new LearningStore(beta.store(owner)).list(),
          },
          { headers },
        );
    }
    if (request.method === "POST" && resource === "factory") {
      const input = factoryActionSchema
        .extend({ workId: z.string().uuid() })
        .strict()
        .parse(await boundedJson(new Response(request.body), 4000));
      const config = await factoryConfig();
      if (
        config.engineering.ownerId !== owner ||
        !["LOCAL_FIXTURE", "LOCAL_SPEND_FIXTURE"].includes(
          config.connection.qualification.mode,
        )
      )
        throw new WorkError(
          "factory_local_only",
          "This integration enables only the qualified local Factory fixture. Live execution requires separate authorization.",
          403,
        );
      const { workId, ...action } = input;
      const result = await factoryAction(beta.store(owner), workId, action);
      await beta.query(
        `UPDATE beta_goal_work_bindings b SET binding=jsonb_set(jsonb_set(binding,'{workGeneration}',to_jsonb(w.generation)),'{state}','"ADMITTED"'::jsonb)
        FROM engineering_work w,engineering_routing_decisions d WHERE b.owner_id=$1 AND b.work_id=$2 AND w.scope_id=b.owner_id AND w.scope_kind='personal' AND w.id=b.work_id AND d.scope_id=w.scope_id AND d.scope_kind=w.scope_kind AND d.work_id=w.id AND d.work_version=w.version AND d.selected_route='MYFACTORY' AND d.status='ADMITTED'`,
        [owner, workId],
      );
      return Response.json({ result }, { headers });
    }
    if (request.method === "POST" && resource === "work") {
      const binding = z.object({
        workId: z.string().uuid(),
        expectedVersion: z.number().int().positive(),
        expectedGeneration: z.number().int().positive(),
      });
      const input = z
        .union([
          binding
            .extend({ operation: z.enum(["pause", "resume", "admit"]) })
            .strict(),
          binding
            .extend({
              operation: z.literal("continue"),
              responseId: z.string().min(1).max(255),
            })
            .strict(),
          binding
            .extend({
              operation: z.literal("request_decision"),
              prompt: z.string().trim().min(1).max(4000),
              options: z.array(z.string().trim().min(1).max(200)).min(2).max(8),
            })
            .strict(),
        ])
        .parse(await boundedJson(new Response(request.body), 16000));
      const canonical = new CanonicalBetaWork(beta);
      if (input.operation === "request_decision")
        return Response.json(
          {
            item: await canonical.requestDecision(
              owner,
              input.workId,
              input.prompt,
              input.options,
              {
                version: input.expectedVersion,
                generation: input.expectedGeneration,
              },
            ),
          },
          { headers },
        );
      const result =
        input.operation === "admit"
          ? {
              admission: await canonical.admit(
                owner,
                input.workId,
                input.expectedVersion,
                input.expectedGeneration,
              ),
            }
          : await canonical.control(
              owner,
              input.workId,
              input.expectedVersion,
              input.expectedGeneration,
              input.operation,
              input.operation === "continue" ? input.responseId : undefined,
            );
      return Response.json(result, { headers });
    }
    if (request.method === "POST" && resource === "start") {
      const input = z
        .object({
          goal: goalInput,
          taskId: z.string().uuid(),
          planCommandId: z.string().uuid(),
        })
        .strict()
        .parse(await boundedJson(new Response(request.body), 16000));
      await beta.service(owner, "owner").create(input.goal);
      const agent = beta.service(owner);
      const plan = await agent.plan(
        input.goal.id,
        input.goal.objective,
        "Initial single-task plan from the owner's exact outcome",
        undefined,
        input.planCommandId,
      );
      await agent.addTask(input.goal.id, {
        id: input.taskId,
        objective: input.goal.objective,
        criteria: input.goal.criteria,
        provenance: { kind: "plan", reference: plan.id, depth: 0 },
      });
      await agent.tick(input.goal.id);
      return Response.json(
        { goal: await beta.queries(owner).goal(input.goal.id) },
        { status: 201, headers },
      );
    }
    if (request.method === "POST" && resource === "learning") {
      const input = z
        .object({
          workId: z.string().uuid(),
          workVersion: z.number().int().positive(),
          workType: z.enum(["research", "implementation", "review"]),
          familyId: z.string().regex(/^[a-f0-9]{64}$/),
          revision: z.number().int().positive(),
          command: learningCommandSchema,
        })
        .strict()
        .parse(await boundedJson(new Response(request.body), 16000));
      return Response.json(
        {
          family: await new LearningRuntime(
            new LearningStore(beta.store(owner)),
          ).decide(input),
        },
        { headers },
      );
    }
    if (request.method === "POST" && resource === "memory") {
      const input = z
        .object({
          workId: z.string().uuid(),
          knowledgeId: z.string().min(1),
          statement: z.string().trim().min(1).max(4000),
        })
        .strict()
        .parse(await boundedJson(new Response(request.body), 12000));
      const store = new EngineeringKnowledgeStore(beta.store(owner));
      const previous = (
        await store.list(input.workId, { limit: 100, includeHistory: true })
      ).find((f) => f.id === input.knowledgeId);
      if (!previous || previous.status !== "active")
        return Response.json(
          { error: "This fact changed. Refresh before correcting it." },
          { status: 409, headers },
        );
      return Response.json(
        {
          fact: await store.save({
            workId: input.workId,
            statement: input.statement,
            sourceId: previous.source.id,
            origin: { type: "owner" },
            supersedesId: previous.id,
          }),
        },
        { headers },
      );
    }
    if (request.method === "POST" && resource === "feedback") {
      const input = resultFeedbackSchema.parse(
        await boundedJson(new Response(request.body), 16000),
      );
      return Response.json(
        {
          family: await new LearningRuntime(
            new LearningStore(beta.store(owner)),
          ).feedback(input),
        },
        { headers },
      );
    }
    return Response.json({ error: "Not available." }, { status: 404, headers });
  } catch (error) {
    const status =
      error instanceof z.ZodError
        ? 400
        : error instanceof WorkError
          ? error.status
          : 503;
    return Response.json(
      {
        error:
          "This service could not confirm the request. Refresh to check its saved state.",
      },
      { status, headers },
    );
  }
}
