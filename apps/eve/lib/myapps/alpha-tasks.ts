import { randomUUID } from "node:crypto";
import type { GoalPool, GoalConnection } from "../goal-work/database.ts";
import { UniversalInbox } from "../universal-inbox/service.ts";
import { PostgresAttentionRepository } from "../universal-inbox/postgres-repository.ts";
import {
  eventSchema,
  type OwnerResponse,
} from "../universal-inbox/contracts.ts";
import { hash as actionHash } from "../universal-inbox/domain.ts";
import {
  requireValue,
  AppError,
} from "../../../../packages/myapps/src/contracts.ts";
import type { Principal } from "../../../../packages/myapps/src/store.ts";
import {
  canonical,
  digest,
  PROFILE,
  validateAlphaTasksPackage,
  validateTaskData,
  validateOperation,
  type AlphaTasksPackage,
  type Origin,
  type TaskData,
} from "../../../../packages/myapps/src/alpha-tasks/contracts.ts";
import {
  verifySourceClosure,
  sourceClosureDigest,
  type SourceClosure,
} from "../../../../packages/myapps/src/alpha-tasks/source.ts";
import {
  IsolatedExecutionError,
  type IsolatedResult,
} from "../../../../packages/myapps/src/alpha-tasks/isolation.ts";
import type {RemoteRequest} from '../../../../packages/myapps/src/alpha-tasks/remote-isolation.ts';
import {executionAdmission,authorizeRemoteAdmission,type ReceivingIdentity} from './remote-admission.ts';
type Connection = GoalConnection;
export interface AlphaTasksHost {
  runtimeId: string;
  target: string;
  enabled(): boolean;
  /** Dormant remote compositions must supply an exact trusted enrollment. Local hosts omit it. */
  receivingIdentity?():ReceivingIdentity;
  assertProfile(pkg: AlphaTasksPackage): void;
  /** Must resolve canonical custody and current capability policy in the provided transaction. */
  authorize(
    c: Connection,
    p: Principal,
    origin: Origin,
    operation: "apps.manage" | "apps.install" | "apps.run",
  ): Promise<{
    workVersion: number;
    workGeneration: number;
    policyRevision: number;
  }>;
  source(pkg: AlphaTasksPackage): Promise<SourceClosure>;
  execute(
    pkg: AlphaTasksPackage,
    source: SourceClosure,
    operation: unknown,
    input: unknown,
    data: TaskData,
    operationId: string,
  ): Promise<IsolatedResult>;
}
interface State {
  profile: typeof PROFILE;
  ownerId: string;
  appId: string;
  installedVersion: number | null;
  installedDigest: string | null;
  revision: number;
  dataRevision: number;
  data: TaskData;
  enabled: boolean;
  history: unknown[];
}
export interface AlphaTasksView {
  appId: string;
  installedVersion: number | null;
  installedDigest: string | null;
  revision: number;
  dataRevision: number;
  enabled: boolean;
  recoveryRequired: boolean;
  tasks: TaskData["tasks"];
  releases: Array<{
    version: number;
    digest: string;
    baseVersion: number | null;
    installedBefore: boolean;
  }>;
}
/** Inert until a trusted local composition supplies custody, policy and isolated execution.
 * Uses owner-scoped MyApps/Needs You stores; additive receipt custody, no production bootstrap. */
export class AlphaTasksApps {
  constructor(
    readonly pool: GoalPool,
    readonly host: AlphaTasksHost,
  ) {}
  private permit(p: Principal, operation: string) {
    requireValue(
      this.host.enabled() &&
        p.ownerId.length > 0 &&
        p.actorId.length > 0 &&
        p.allowedOperations.includes(operation),
      "APP_CAPABILITY_DENIED",
    );
  }
  private async atomic<T>(
    owner: string,
    body: (c: Connection) => Promise<T>,
  ): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        "SELECT set_config('myeve.myapps_owner',$1,true),set_config('myeve.inbox_owner',$1,true),set_config('lock_timeout','5s',true),set_config('statement_timeout','15s',true)",
        [owner],
      );
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,821))", [
        owner,
      ]);
      const result = await body(c);
      requireValue(this.host.enabled(), "APP_CAPABILITY_DENIED");
      await c.query("COMMIT");
      return result;
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
  }
  private async state(c: Connection, p: Principal, id: string): Promise<State> {
    const row = (
      await c.query(
        "SELECT state FROM myapps_installations WHERE owner_id=$1 AND app_id=$2 FOR UPDATE",
        [p.ownerId, id],
      )
    ).rows[0];
    requireValue(
      row?.state?.profile === PROFILE && row.state.ownerId === p.ownerId,
      "APP_UNAVAILABLE",
    );
    validateTaskData(row.state.data);
    return row.state;
  }
  private async candidate(
    c: Connection,
    p: Principal,
    id: string,
    version: number,
  ) {
    const row = (
      await c.query(
        "SELECT * FROM myapps_candidates WHERE owner_id=$1 AND app_id=$2 AND version=$3",
        [p.ownerId, id, version],
      )
    ).rows[0];
    requireValue(row && !row.revoked, "APP_UNAVAILABLE");
    const pkg = validateAlphaTasksPackage(row.package);
    this.host.assertProfile(pkg);
    requireValue(
      pkg.spec.ownerId === p.ownerId && digest(pkg) === row.digest,
      "APP_RESULT_BINDING",
    );
    return { digest: String(row.digest), package: pkg };
  }
  private async save(c: Connection, s: State) {
    await c.query(
      "UPDATE myapps_installations SET state=$3::jsonb WHERE owner_id=$1 AND app_id=$2",
      [s.ownerId, s.appId, canonical(s)],
    );
  }
  private async audit(
    c: Connection,
    p: Principal,
    id: string,
    action: string,
    evidence: unknown,
  ) {
    await c.query(
      "INSERT INTO myapps_audit(owner_id,app_id,action,actor,evidence) VALUES($1,$2,$3,$4,$5::jsonb)",
      [p.ownerId, id, action, p.actorId, canonical(evidence)],
    );
  }
  /** Owner-scoped retained state only. Reading the catalog never runs candidate code. */
  async catalog(p: Principal): Promise<AlphaTasksView[]> {
    this.permit(p, "apps.read");
    return this.atomic(p.ownerId, async (c) => {
      const rows = (
        await c.query(
          "SELECT state FROM myapps_installations WHERE owner_id=$1 AND state->>'profile'=$2 ORDER BY app_id LIMIT 50",
          [p.ownerId, PROFILE],
        )
      ).rows;
      const views: AlphaTasksView[] = [];
      for (const row of rows) {
        const s = row.state as State;
        requireValue(s.ownerId === p.ownerId, "APP_UNAVAILABLE");
        const data = validateTaskData(s.data);
        const candidates = (
          await c.query(
            "SELECT version,digest,package FROM myapps_candidates WHERE owner_id=$1 AND app_id=$2 AND NOT revoked ORDER BY version DESC LIMIT 20",
            [p.ownerId, s.appId],
          )
        ).rows;
        const releases = candidates.map((candidate) => {
          const pkg = validateAlphaTasksPackage(candidate.package);
          requireValue(
            pkg.appId === s.appId &&
              pkg.spec.ownerId === p.ownerId &&
              digest(pkg) === candidate.digest,
            "APP_RESULT_BINDING",
          );
          return {
            version: pkg.version,
            digest: String(candidate.digest),
            baseVersion: pkg.base?.version ?? null,
            installedBefore: s.history.some(
              (entry: any) => entry.toVersion === pkg.version,
            ),
          };
        });
        const pending =
          (
            await c.query(
              "SELECT 1 FROM myapps_receipts WHERE owner_id=$1 AND app_id=$2 AND response->>'status' IN('RUNNING','UNKNOWN') LIMIT 1",
              [p.ownerId, s.appId],
            )
          ).rows.length > 0;
        views.push({
          appId: s.appId,
          installedVersion: s.installedVersion,
          installedDigest: s.installedDigest,
          revision: s.revision,
          dataRevision: s.dataRevision,
          enabled: s.enabled,
          recoveryRequired: pending,
          tasks: data.tasks,
          releases,
        });
      }
      return views;
    });
  }
  inbox(owner: string) {
    return new UniversalInbox(
      owner,
      new PostgresAttentionRepository(this.pool),
    );
  }
  async prepare(p: Principal, value: unknown) {
    this.permit(p, "apps.manage");
    const pkg = validateAlphaTasksPackage(value);
    this.host.assertProfile(pkg);
    requireValue(pkg.spec.ownerId === p.ownerId, "APP_OWNER_MISMATCH");
    const source = verifySourceClosure(
      await this.host.source(pkg),
      pkg.origin.candidateTree,
    );
    requireValue(
      sourceClosureDigest(source) === pkg.sourceClosureDigest,
      "APP_SOURCE_TREE_MISMATCH",
    );
    // Source closure and authentic Result are separate requirements; no synthetic reference PASS.
    return this.atomic(p.ownerId, async (c) => {
      await this.host.authorize(c, p, pkg.origin, "apps.manage");
      const initial: State = {
        profile: PROFILE,
        ownerId: p.ownerId,
        appId: pkg.appId,
        installedVersion: null,
        installedDigest: null,
        revision: 0,
        dataRevision: 0,
        data: { next: 1, tasks: [] },
        enabled: false,
        history: [],
      };
      await c.query(
        "INSERT INTO myapps_installations(owner_id,app_id,creation_intent,state) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING",
        [
          p.ownerId,
          pkg.appId,
          "alpha-tasks:" +
            pkg.origin.installationId +
            ":" +
            pkg.origin.missionId,
          canonical(initial),
        ],
      );
      const s = await this.state(c, p, pkg.appId),
        hash = digest(pkg),
        prior = (
          await c.query(
            "SELECT digest FROM myapps_candidates WHERE owner_id=$1 AND app_id=$2 AND version=$3",
            [p.ownerId, pkg.appId, pkg.version],
          )
        ).rows[0];
      if (prior) {
        requireValue(prior.digest === hash, "APP_VERSION_IMMUTABLE");
        return { version: pkg.version, digest: hash };
      }
      const last = (
        await c.query(
          "SELECT COALESCE(MAX(version),0) AS version FROM myapps_candidates WHERE owner_id=$1 AND app_id=$2",
          [p.ownerId, pkg.appId],
        )
      ).rows[0];
      requireValue(
        pkg.version === Number(last.version) + 1 &&
          (pkg.base
            ? pkg.base.version === s.installedVersion &&
              pkg.base.digest === s.installedDigest
            : s.installedVersion === null),
        "APP_BASE_MISMATCH",
      );
      await c.query(
        "INSERT INTO myapps_candidates(owner_id,app_id,version,digest,package,proof) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)",
        [
          p.ownerId,
          pkg.appId,
          pkg.version,
          hash,
          canonical(pkg),
          canonical({
            format: "myapps.alpha-tasks-origin.v1",
            origin: pkg.origin,
            publication: "DISABLED",
            installation: "NOT_INSTALLED",
          }),
        ],
      );
      await this.audit(c, p, pkg.appId, "alpha-tasks.candidate.retained", {
        digest: hash,
        origin: pkg.origin,
      });
      return { version: pkg.version, digest: hash };
    });
  }
  private async assertQuiescent(c: Connection, p: Principal, id: string) {
    const pending = (
      await c.query(
        "SELECT 1 FROM myapps_receipts WHERE owner_id=$1 AND app_id=$2 AND response->>'status' IN('RUNNING','UNKNOWN') LIMIT 1",
        [p.ownerId, id],
      )
    ).rows[0];
    requireValue(!pending, "APP_OPERATION_UNKNOWN");
  }
  private async recordFailure(
    p: Principal,
    id: string,
    key: string,
    operationId: string,
    cleanupConfirmed: boolean,
  ) {
    // Never overwrite a committed success after an ambiguous COMMIT acknowledgment.
    await this.atomic(p.ownerId, async (c) => {
      await c.query(
        "UPDATE myapps_receipts SET response=$4::jsonb WHERE owner_id=$1 AND app_id=$2 AND id=$3 AND response->>'status'='RUNNING' AND response->>'operationId'=$5",
        [
          p.ownerId,
          id,
          key,
          canonical({
            status: cleanupConfirmed ? "DENIED" : "UNKNOWN",
            operationId,
            cleanup: cleanupConfirmed ? "CONFIRMED" : "UNKNOWN",
          }),
          operationId,
        ],
      );
    }).catch(() => {});
  }
  async preview(p: Principal, id: string, version: number) {
    this.permit(p, "apps.manage");
    const operationId = randomUUID(),
      key = "preview:" + operationId;
    const candidate = await this.atomic(p.ownerId, async (c) => {
      const state=await this.state(c, p, id);
      const row = await this.candidate(c, p, id, version);
      const authorization=await this.host.authorize(c, p, row.package.origin, "apps.manage");
      await this.assertQuiescent(c, p, id);
      const requestHash=digest({version,digest:row.digest,mode:'preview'});
      await c.query(
        "INSERT INTO myapps_receipts(owner_id,app_id,id,request_hash,response,execution_admission) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)",
        [
          p.ownerId,
          id,
          key,
          requestHash,
          canonical({ status: "RUNNING", operationId }),
          canonical(executionAdmission({principal:p,pkg:row.package,receiptId:key,requestHash,operationId,mode:'PREVIEW',
            operation:'list',input:{},data:{next:1,tasks:[]},appRevision:state.revision,dataRevision:state.dataRevision,authorization,
            receivingIdentity:this.host.receivingIdentity?.()??null})),
        ],
      );
      return row;
    });
    let cleanupConfirmed = true;
    try {
      const source = verifySourceClosure(
        await this.host.source(candidate.package),
        candidate.package.origin.candidateTree,
      );
      requireValue(
        sourceClosureDigest(source) === candidate.package.sourceClosureDigest,
        "APP_SOURCE_TREE_MISMATCH",
      );
      cleanupConfirmed = false;
      const observation = await this.host.execute(
        candidate.package,
        source,
        "list",
        {},
        { next: 1, tasks: [] },
        operationId,
      );
      requireValue(
        observation.operationId === operationId &&
          observation.cleanup === "CONFIRMED" &&
          observation.sourceClosureDigest ===
            candidate.package.sourceClosureDigest &&
          observation.runtimeDigest === digest(candidate.package.runtime),
        "APP_RUNTIME_UNQUALIFIED",
      );
      cleanupConfirmed = true;
      return await this.atomic(p.ownerId, async (c) => {
        const current = await this.candidate(c, p, id, version);
        await this.host.authorize(c, p, current.package.origin, "apps.manage");
        requireValue(
          current.digest === candidate.digest,
          "APP_VERSION_IMMUTABLE",
        );
        const previewId = randomUUID(),
          expiresAt = new Date(Date.now() + 300000).toISOString();
        await c.query(
          "INSERT INTO myapps_previews(owner_id,app_id,id,binding,expires_at) VALUES($1,$2,$3,$4::jsonb,$5)",
          [
            p.ownerId,
            id,
            previewId,
            canonical({
              version,
              digest: current.digest,
              runtime: digest(current.package.runtime),
              cleanup: "CONFIRMED",
              operationId,
            }),
            expiresAt,
          ],
        );
        const completed = await c.query(
          "UPDATE myapps_receipts SET response=$4::jsonb WHERE owner_id=$1 AND app_id=$2 AND id=$3 AND response->>'status'='RUNNING' AND response->>'operationId'=$5 RETURNING id",
          [
            p.ownerId,
            id,
            key,
            canonical({
              status: "COMPLETED",
              operationId,
              previewId,
              cleanup: "CONFIRMED",
            }),
            operationId,
          ],
        );
        requireValue(completed.rows.length === 1, "APP_OPERATION_FENCED");
        return {
          previewId,
          expiresAt,
          digest: current.digest,
          mode: "SYNTHETIC_READ_ONLY_PREVIEW",
          output: observation.output,
        };
      });
    } catch (error) {
      if (error instanceof IsolatedExecutionError)
        cleanupConfirmed = error.cleanup === "CONFIRMED";
      await this.recordFailure(p, id, key, operationId, cleanupConfirmed);
      throw error;
    }
  }
  async requestInstall(p: Principal, id: string, previewId: string) {
    this.permit(p, "apps.manage");
    const event = await this.atomic(p.ownerId, async (c) => {
      const preview = (
        await c.query(
          "SELECT * FROM myapps_previews WHERE owner_id=$1 AND app_id=$2 AND id=$3 AND NOT ended AND expires_at>clock_timestamp()",
          [p.ownerId, id, previewId],
        )
      ).rows[0];
      requireValue(preview, "APP_PREVIEW_EXPIRED");
      const candidate = await this.candidate(c, p, id, preview.binding.version),
        s = await this.state(c, p, id);
      requireValue(
        preview.binding.digest === candidate.digest &&
          preview.binding.runtime === digest(candidate.package.runtime) &&
          preview.binding.cleanup === "CONFIRMED",
        "APP_RUNTIME_UNQUALIFIED",
      );
      const current = await this.host.authorize(
        c,
        p,
        candidate.package.origin,
        "apps.manage",
      );
      const binding = {
        owner: p.ownerId,
        appId: id,
        version: candidate.package.version,
        digest: candidate.digest,
        origin: candidate.package.origin,
        runtimeId: this.host.runtimeId,
        target: this.host.target,
        runtimeDigest: digest(candidate.package.runtime),
        revision: s.revision,
        dataRevision: s.dataRevision,
        current,
        previewId,
        expiresAt: new Date(preview.expires_at).toISOString(),
      };
      const requestId = digest(binding),
        prior = (
          await c.query(
            "SELECT event FROM myapps_install_requests WHERE owner_id=$1 AND app_id=$2 AND id=$3",
            [p.ownerId, id, requestId],
          )
        ).rows[0];
      if (prior) return prior.event;
      const event = eventSchema.parse({
        kind: "DECISION",
        title: "Install Alpha Tasks release " + binding.version,
        summary:
          "Exact retained AlphaTasks Result; private installation is a separate decision.",
        source: {
          system: "work",
          accountId: p.ownerId,
          eventId: requestId,
          sender: "Sofie",
          occurredAt: new Date().toISOString(),
          reference: binding.origin.workId,
          evidence: [binding.digest, binding.origin.proofHash],
        },
        correlationId: requestId,
        episode: 1,
        sequence: 1,
        workId: binding.origin.workId,
        workVersion: current.workVersion,
        workGeneration: current.workGeneration,
        action: {
          id: requestId,
          kind: "decision",
          reason: "choice",
          involvement: "NECESSARY_JUDGMENT",
          prompt:
            "Install this exact AlphaTasks release privately? No network, secrets or publication.",
          options: ["Install privately", "Decline"],
          expiresAt: binding.expiresAt,
        },
        priority: { blockingActiveWork: false },
      });
      await c.query(
        "INSERT INTO myapps_install_requests(owner_id,app_id,id,binding,event) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)",
        [p.ownerId, id, requestId, canonical(binding), canonical(event)],
      );
      return event;
    });
    return new UniversalInbox(
      p.ownerId,
      new PostgresAttentionRepository(this.pool),
    ).ingest(event);
  }
  async install(p: Principal, id: string, responseId: string) {
    this.permit(p, "apps.install");
    requireValue(
      p.kind === "human" && p.actorId === p.ownerId,
      "INSTALLATION_APPROVAL_REQUIRED",
    );
    return this.atomic(p.ownerId, async (c) => {
      const response = (
        await c.query(
          "SELECT data FROM inbox_attention_responses WHERE owner_id=$1 AND id=$2",
          [p.ownerId, responseId],
        )
      ).rows[0]?.data;
      requireValue(response, "INSTALLATION_APPROVAL_REQUIRED");
      const request = (
        await c.query(
          "SELECT * FROM myapps_install_requests WHERE owner_id=$1 AND app_id=$2 AND id=$3",
          [p.ownerId, id, response.action.id],
        )
      ).rows[0];
      requireValue(request, "INSTALLATION_APPROVAL_REQUIRED");
      const b = request.binding,
        candidate = await this.candidate(c, p, id, b.version),
        s = await this.state(c, p, id);
      const current = await this.host.authorize(
        c,
        p,
        candidate.package.origin,
        "apps.install",
      );
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,719))", [
        p.ownerId,
      ]);
      const r = (
        await c.query(
          "SELECT data FROM inbox_attention_responses WHERE owner_id=$1 AND id=$2 FOR UPDATE",
          [p.ownerId, responseId],
        )
      ).rows[0]?.data;
      const item = (
        await c.query(
          "SELECT data FROM inbox_attention_items WHERE owner_id=$1 AND id=$2 FOR UPDATE",
          [p.ownerId, response.itemId],
        )
      ).rows[0]?.data;
      requireValue(
        r &&
          item &&
          item.responseId === responseId &&
          ["WAITING", "RESOLVED"].includes(item.status) &&
          ["PENDING", "DELIVERED"].includes(r.status) &&
          r.actionBinding === actionHash(request.event.action) &&
          canonical(r.action) === canonical(request.event.action) &&
          r.workId === b.origin.workId &&
          r.workVersion === current.workVersion &&
          r.workGeneration === current.workGeneration &&
          r.correlationId === request.event.correlationId &&
          r.episode === request.event.episode &&
          item.sourceSequence === request.event.sequence,
        "INSTALLATION_APPROVAL_REQUIRED",
      );
      requireValue(
        b.digest === candidate.digest &&
          canonical(b.origin) === canonical(candidate.package.origin) &&
          b.runtimeId === this.host.runtimeId &&
          b.target === this.host.target &&
          b.runtimeDigest === digest(candidate.package.runtime) &&
          canonical(current) === canonical(b.current),
        "INSTALLATION_STALE",
      );
      if (request.response_id) {
        requireValue(
          request.response_id === responseId &&
            (request.outcome === "DENIED" || s.installedDigest === b.digest),
          "INSTALLATION_STALE",
        );
        return { outcome: request.outcome, duplicate: true };
      }
      requireValue(
        Date.parse(b.expiresAt) > Date.now() &&
          s.revision === b.revision &&
          s.dataRevision === b.dataRevision,
        "INSTALLATION_STALE",
      );
      const preview = (
        await c.query(
          "SELECT 1 FROM myapps_previews WHERE owner_id=$1 AND app_id=$2 AND id=$3 AND NOT ended AND expires_at>clock_timestamp()",
          [p.ownerId, id, b.previewId],
        )
      ).rows[0];
      requireValue(preview, "APP_PREVIEW_EXPIRED");
      requireValue(
        ["Install privately", "Decline"].includes(r.answer),
        "INSTALLATION_APPROVAL_REQUIRED",
      );
      const outcome = r.answer === "Install privately" ? "INSTALLED" : "DENIED";
      if (outcome === "INSTALLED") {
        await this.assertQuiescent(c, p, id);
        const base = candidate.package.base;
        requireValue(
          base
            ? base.version === s.installedVersion &&
                base.digest === s.installedDigest
            : s.installedVersion === null,
          "APP_BASE_MISMATCH",
        );
        validateTaskData(s.data);
        s.history.push({
          fromVersion: s.installedVersion,
          toVersion: b.version,
          digest: b.digest,
          responseId,
        });
        s.installedVersion = b.version;
        s.installedDigest = b.digest;
        s.enabled = true;
        s.revision++;
        await this.save(c, s);
      }
      await c.query(
        "UPDATE myapps_install_requests SET response_id=$4,outcome=$5 WHERE owner_id=$1 AND app_id=$2 AND id=$3",
        [p.ownerId, id, request.id, responseId, outcome],
      );
      await this.audit(c, p, id, "alpha-tasks.installation." + outcome, {
        binding: b,
        responseId,
      });
      await c.query(
        "UPDATE inbox_attention_responses SET data=$3::jsonb WHERE owner_id=$1 AND id=$2",
        [
          p.ownerId,
          responseId,
          canonical({
            ...r,
            status: "DELIVERED",
            receipt: "myapps:" + outcome + ":" + request.id,
          }),
        ],
      );
      await c.query(
        "UPDATE inbox_attention_items SET data=$3::jsonb WHERE owner_id=$1 AND id=$2",
        [
          p.ownerId,
          item.id,
          canonical({
            ...item,
            status: "RESOLVED",
            action: null,
            actionBinding: null,
            revision: item.revision + 1,
            resolvedAt: new Date().toISOString(),
          }),
        ],
      );
      return { outcome, duplicate: false };
    });
  }
  /** Pass this consumer to the existing UniversalInbox delivery loop in local composition. */
  async consumeOwnerResponse(p: Principal, response: OwnerResponse) {
    this.permit(p, "apps.install");
    requireValue(
      p.kind === "human" &&
        p.actorId === p.ownerId &&
        p.ownerId === response.ownerId,
      "INSTALLATION_APPROVAL_REQUIRED",
    );
    const request = await this.atomic(
      p.ownerId,
      async (c) =>
        (
          await c.query(
            "SELECT r.app_id FROM myapps_install_requests r JOIN myapps_installations a USING(owner_id,app_id) WHERE r.owner_id=$1 AND r.id=$2 AND a.state->>'profile'=$3",
            [p.ownerId, response.action.id, PROFILE],
          )
        ).rows[0],
    );
    if (!request) return null;
    try {
      const result = await this.install(p, request.app_id, response.id);
      return {
        status: "accepted" as const,
        receipt: "myapps-alpha:" + response.id + ":" + result.outcome,
      };
    } catch (error) {
      // A stale exact decision must not block later owner decisions; uncertainty stays pending.
      if (
        error instanceof AppError &&
        [
          "APP_WORK_STALE",
          "APP_PREVIEW_EXPIRED",
          "INSTALLATION_STALE",
          "INSTALLATION_APPROVAL_REQUIRED",
          "APP_BASE_MISMATCH",
        ].includes(error.code)
      )
        return {
          status: "stale" as const,
          receipt: "myapps-alpha:stale:" + response.id + ":" + error.code,
        };
      throw error;
    }
  }
  async rollbackCandidate(p: Principal, id: string, targetVersion: number) {
    this.permit(p, "apps.manage");
    const pkg = await this.atomic(p.ownerId, async (c) => {
      const s = await this.state(c, p, id),
        target = await this.candidate(c, p, id, targetVersion);
      requireValue(
        s.installedVersion !== null &&
          s.installedDigest !== null &&
          s.history.some((h: any) => h.toVersion === targetVersion),
        "APP_ROLLBACK_UNAVAILABLE",
      );
      const latest = (
        await c.query(
          "SELECT MAX(version) AS version FROM myapps_candidates WHERE owner_id=$1 AND app_id=$2",
          [p.ownerId, id],
        )
      ).rows[0];
      await this.host.authorize(c, p, target.package.origin, "apps.manage");
      validateTaskData(s.data);
      return {
        ...target.package,
        version: Number(latest.version) + 1,
        base: { version: s.installedVersion, digest: s.installedDigest },
      };
    });
    await this.prepare(p, pkg);
    return pkg;
  }
  async operate(
    p: Principal,
    id: string,
    version: number,
    hash: string,
    operation: unknown,
    input: unknown,
    requestKey: string,
  ) {
    this.permit(p, "apps.run");
    requireValue(
      typeof requestKey === "string" &&
        /^[A-Za-z0-9._:-]{1,160}$/.test(requestKey),
      "APP_REQUEST_KEY",
    );
    const request = validateOperation(operation, input),
      requestHash = digest({
        actor: p.actorId,
        kind: p.kind,
        version,
        hash,
        ...request,
      });
    const admitted = await this.atomic(p.ownerId, async (c) => {
      const s = await this.state(c, p, id),
        candidate = await this.candidate(c, p, id, version);
      requireValue(
        s.enabled &&
          s.installedVersion === version &&
          s.installedDigest === hash &&
          candidate.digest === hash,
        "APP_VERSION_CONFLICT",
      );
      const authorization=await this.host.authorize(c, p, candidate.package.origin, "apps.run");
      const prior = (
        await c.query(
          "SELECT request_hash,response FROM myapps_receipts WHERE owner_id=$1 AND app_id=$2 AND id=$3",
          [p.ownerId, id, requestKey],
        )
      ).rows[0];
      if (prior) {
        requireValue(
          prior.request_hash === requestHash,
          "IDEMPOTENCY_CONFLICT",
        );
        return { prior: prior.response };
      }
      const pending = (
        await c.query(
          "SELECT 1 FROM myapps_receipts WHERE owner_id=$1 AND app_id=$2 AND response->>'status' IN('RUNNING','UNKNOWN') LIMIT 1",
          [p.ownerId, id],
        )
      ).rows[0];
      requireValue(!pending, "APP_OPERATION_UNKNOWN");
      const operationId = randomUUID();
      await c.query(
        "INSERT INTO myapps_receipts(owner_id,app_id,id,request_hash,response,execution_admission) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)",
        [
          p.ownerId,
          id,
          requestKey,
          requestHash,
          canonical({ status: "RUNNING", operationId }),
          canonical(executionAdmission({principal:p,pkg:candidate.package,receiptId:requestKey,requestHash,operationId,mode:'INVOKE',
            ...request,data:s.data,appRevision:s.revision,dataRevision:s.dataRevision,authorization,
            receivingIdentity:this.host.receivingIdentity?.()??null})),
        ],
      );
      return {
        candidate,
        data: s.data,
        dataRevision: s.dataRevision,
        revision: s.revision,
        operationId,
      };
    });
    if ("prior" in admitted) return admitted.prior;
    let cleanupConfirmed = true;
    try {
      const pkg = admitted.candidate.package,
        source = verifySourceClosure(
          await this.host.source(pkg),
          pkg.origin.candidateTree,
        );
      requireValue(
        sourceClosureDigest(source) === pkg.sourceClosureDigest,
        "APP_SOURCE_TREE_MISMATCH",
      );
      cleanupConfirmed = false;
      const result = await this.host.execute(
        pkg,
        source,
        request.operation,
        request.input,
        admitted.data,
        admitted.operationId,
      );
      requireValue(
        result.operationId === admitted.operationId &&
          result.cleanup === "CONFIRMED" &&
          result.sourceClosureDigest === pkg.sourceClosureDigest &&
          result.runtimeDigest === digest(pkg.runtime),
        "APP_RUNTIME_UNQUALIFIED",
      );
      cleanupConfirmed = true;
      return await this.atomic(p.ownerId, async (c) => {
        const s = await this.state(c, p, id),
          candidate = await this.candidate(c, p, id, version);
        await this.host.authorize(c, p, candidate.package.origin, "apps.run");
        requireValue(
          s.enabled &&
            s.installedDigest === hash &&
            s.revision === admitted.revision &&
            s.dataRevision === admitted.dataRevision,
          "APP_VERSION_CONFLICT",
        );
        const output = {
          status: "COMPLETED",
          operationId: admitted.operationId,
          output: result.output,
          cleanup: "CONFIRMED",
          dataRevision: s.dataRevision,
        };
        if (request.operation === "create" || request.operation === "update") {
          s.data = validateTaskData(result.data);
          s.dataRevision++;
          output.dataRevision = s.dataRevision;
          await this.save(c, s);
        } else
          requireValue(
            canonical(s.data) === canonical(result.data),
            "APP_READ_MUTATED_DATA",
          );
        const completed = await c.query(
          "UPDATE myapps_receipts SET response=$4::jsonb WHERE owner_id=$1 AND app_id=$2 AND id=$3 AND response->>'status'='RUNNING' AND response->>'operationId'=$5 RETURNING id",
          [p.ownerId, id, requestKey, canonical(output), admitted.operationId],
        );
        requireValue(completed.rows.length === 1, "APP_OPERATION_FENCED");
        await this.audit(c, p, id, "alpha-tasks." + request.operation, {
          requestHash,
          operationId: admitted.operationId,
          dataRevision: s.dataRevision,
        });
        return output;
      });
    } catch (error) {
      if (error instanceof IsolatedExecutionError)
        cleanupConfirmed = error.cleanup === "CONFIRMED";
      // Do not auto-reexecute after uncertainty; historical Work/Factory accounting is untouched.
      await this.recordFailure(
        p,
        id,
        requestKey,
        admitted.operationId,
        cleanupConfirmed,
      );
      throw error;
    }
  }
  /** Dormant receiving adapter. Authentication is supplied afresh by the trusted composition;
   * no route or tool exposes this method and the request cannot supply its own principal. */
  async authorizeRemote(request:RemoteRequest,authenticate:()=>Promise<Principal>,now=Date.now) {
    const snapshot=structuredClone(request),p=structuredClone(await authenticate());
    this.permit(p,'apps.read');
    const grant=await this.atomic(p.ownerId,c=>authorizeRemoteAdmission(c,p,snapshot,this.host,now));
    requireValue(grant.expiresAt>now(),'APP_REMOTE_ADMISSION');return grant;
  }
  async setEnabled(
    p: Principal,
    id: string,
    revision: number,
    enabled: boolean,
  ) {
    this.permit(p, "apps.manage");
    requireValue(
      p.kind === "human" &&
        p.actorId === p.ownerId &&
        typeof enabled === "boolean",
      "APP_CAPABILITY_DENIED",
    );
    return this.atomic(p.ownerId, async (c) => {
      const s = await this.state(c, p, id);
      requireValue(
        s.revision === revision && s.installedVersion !== null,
        "APP_VERSION_CONFLICT",
      );
      const candidate = await this.candidate(c, p, id, s.installedVersion);
      await this.host.authorize(c, p, candidate.package.origin, "apps.manage");
      if (enabled) await this.assertQuiescent(c, p, id);
      s.enabled = enabled;
      s.revision++;
      await this.save(c, s);
      await this.audit(c, p, id, "alpha-tasks.enabled", {
        enabled,
        revision: s.revision,
      });
      return { revision: s.revision, enabled };
    });
  }
}
