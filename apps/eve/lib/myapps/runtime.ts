import { candidatePreview } from "../../../../packages/myapps/src/preview.ts";
import { randomUUID } from "node:crypto";
import {
  appId,
  canonical,
  digest,
  requireValue,
  text,
  validatePackage,
  leadCrmSpec,
  ACTIONS,
  QUERIES,
} from "../../../../packages/myapps/src/contracts.ts";
import type { AppPackage } from "../../../../packages/myapps/src/contracts.ts";
import { Crm } from "../../../../packages/myapps/src/crm.ts";
import type {
  ActionInput,
  QueryInput,
} from "../../../../packages/myapps/src/crm.ts";
import type {
  AppRow,
  Principal,
  Verification,
} from "../../../../packages/myapps/src/store.ts";
import type { GoalPool, GoalConnection } from "../goal-work/database.ts";
import { WorkStore } from "../engineering/store.ts";
import { UniversalInbox } from "../universal-inbox/service.ts";
import { PostgresAttentionRepository } from "../universal-inbox/postgres-repository.ts";
import { eventSchema } from "../universal-inbox/contracts.ts";
import type {
  OwnerResponse,
  AttentionItem,
} from "../universal-inbox/contracts.ts";
import { hash as attentionHash } from "../universal-inbox/domain.ts";

type Connection = GoalConnection;
type State = AppRow & {
  runtimeId: string | null;
  target: string;
  grants: string[];
};
type Candidate = {
  package: AppPackage;
  digest: string;
  proof: any;
  revoked: boolean;
};
export interface AcceptedResult {
  manifest: any;
  verification: Verification;
}
/** Supplied by the trusted host: signed Result verification, never a body-authored verifier report. */
export interface RuntimeHost {
  runtimeId: string;
  target: string;
  enabled(): boolean;
  verifyResult(input: unknown, pkg: AppPackage): Promise<AcceptedResult>;
}
/** No connections, credentials, generated code or production grants are created here.
 * The injected pool is shared with canonical Work and Needs You. */
export class PersistentApps {
  constructor(
    readonly pool: GoalPool,
    readonly host: RuntimeHost,
  ) {
    text(host.runtimeId);
    text(host.target);
  }
  inbox(owner: string) {
    return new UniversalInbox(
      owner,
      new PostgresAttentionRepository(this.pool),
    );
  }
  private permit(p: Principal, operation: string) {
    text(p.ownerId);
    text(p.actorId);
    requireValue(
      this.host.enabled() && p.allowedOperations.includes(operation),
      "APP_UNAVAILABLE",
    );
  }
  private async atomic<T>(
    owner: string,
    body: (c: Connection) => Promise<T>,
  ): Promise<T> {
    text(owner);
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        "SELECT set_config('myeve.myapps_owner',$1,true),set_config('myeve.inbox_owner',$1,true),set_config('lock_timeout','5s',true),set_config('statement_timeout','15s',true)",
        [owner],
      );
      // Serializes absent-row creation and all app writes for one owner. No network under this lock.
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,821))", [
        owner,
      ]);
      const output = await body(c);
      requireValue(this.host.enabled(), "APP_UNAVAILABLE");
      await c.query("COMMIT");
      return output;
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
  }
  private async work(c: Connection, pkg: AppPackage) {
    const [row] = (
      await c.query(
        "SELECT * FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' AND id=$2 FOR UPDATE",
        [pkg.work.ownerId, pkg.work.workId],
      )
    ).rows;
    requireValue(
      row &&
        row.lifecycle === "active" &&
        row.control === "agent" &&
        row.version === pkg.work.workVersion &&
        row.generation === pkg.work.workGeneration,
      "APP_WORK_STALE",
    );
  }
  private async app(c: Connection, owner: string, id: string): Promise<State> {
    const [row] = (
      await c.query(
        "SELECT state FROM myapps_installations WHERE owner_id=$1 AND app_id=$2 FOR UPDATE",
        [owner, id],
      )
    ).rows;
    requireValue(row, "APP_UNAVAILABLE");
    return row.state;
  }
  private async candidate(
    c: Connection,
    owner: string,
    id: string,
    version: number,
  ): Promise<Candidate> {
    const [row] = (
      await c.query(
        "SELECT * FROM myapps_candidates WHERE owner_id=$1 AND app_id=$2 AND version=$3",
        [owner, id, version],
      )
    ).rows;
    requireValue(row && !row.revoked, "APP_UNAVAILABLE");
    return row as Candidate;
  }
  private async save(c: Connection, state: State) {
    await c.query(
      "UPDATE myapps_installations SET state=$3::jsonb WHERE owner_id=$1 AND app_id=$2",
      [state.ownerId, state.appId, canonical(state)],
    );
  }
  private async audit(
    c: Connection,
    owner: string,
    id: string,
    action: string,
    actor: string,
    evidence: unknown,
  ) {
    await c.query(
      "INSERT INTO myapps_audit(owner_id,app_id,action,actor,evidence) VALUES($1,$2,$3,$4,$5::jsonb)",
      [owner, id, action, actor, canonical(evidence)],
    );
  }
  /** Canonical Work creation only; no model dispatch or paid admission is performed. */
  async requestWork(p: Principal, input: unknown) {
    this.permit(p, "apps.manage");
    return this.atomic(p.ownerId, (c) =>
      new WorkStore(
        { scopeId: p.ownerId, scopeKind: "personal", actorId: p.actorId },
        { query: async (s, v) => (await c.query(s, v)).rows },
      ).create(input),
    );
  }
  /** Strict deterministic intent adapter. Canonical Work remains the only Work lifecycle. */
  async prepareWork(
    p: Principal,
    requestId: string,
    request: string,
    factoryVersion: AppPackage["factoryVersion"],
    emptyCommit: string,
  ) {
    this.permit(p, "apps.manage");
    requireValue(
      [
        "Build me a CRM to track leads.",
        "Add a priority field.",
        "Roll back CRM behavior.",
      ].includes(request),
      "APP_INTENT_UNMATCHED",
    );
    return this.atomic(p.ownerId, async (c) => {
      const store = new WorkStore(
        { scopeId: p.ownerId, scopeKind: "personal", actorId: p.actorId },
        { query: async (s, v) => (await c.query(s, v)).rows },
      );
      const created = await store.create({
        title: request,
        objective: request,
        repository: "synthetic/app-package",
        criteria: [
          {
            id: requestId,
            statement:
              "Verify exact private app candidate and preserve owner data",
            method: "test",
          },
        ],
        maxCostUsd: 0.01,
        maxDurationSeconds: 180,
        idempotencyKey: requestId,
      });
      const [prior] = (
        await c.query(
          "SELECT package,creation_intent FROM myapps_admissions WHERE owner_id=$1 AND work_id=$2",
          [p.ownerId, created.work.id],
        )
      ).rows;
      if (prior?.package) {
        await this.work(c, prior.package);
        return {
          pkg: prior.package as AppPackage,
          creationIntent: prior.creation_intent as string,
        };
      }
      requireValue(created.created, "APP_WORK_STALE");
      await store.change(created.work.id, {
        operation: "resume",
        expectedVersion: created.work.version,
      });
      const work = await store.get(created.work.id);
      const creationIntent = "lead-crm",
        id = appId(p.ownerId, creationIntent);
      const [existing] = (
        await c.query(
          "SELECT state FROM myapps_installations WHERE owner_id=$1 AND app_id=$2",
          [p.ownerId, id],
        )
      ).rows;
      const state = existing?.state as State | undefined;
      const [latest] = (
        await c.query(
          "SELECT COALESCE(MAX(version),0) AS version FROM myapps_candidates WHERE owner_id=$1 AND app_id=$2",
          [p.ownerId, id],
        )
      ).rows;
      let base: Candidate | null = null;
      if (state?.installedVersion) {
        const [row] = (
          await c.query(
            "SELECT * FROM myapps_candidates WHERE owner_id=$1 AND app_id=$2 AND version=$3",
            [p.ownerId, id, state.installedVersion],
          )
        ).rows;
        base = row as Candidate;
      }
      requireValue(
        request === "Build me a CRM to track leads." ? !base : Boolean(base),
        "APP_BASE_MISMATCH",
      );
      const priority = request === "Add a priority field.";
      const fromSchema = state?.data.schemaVersion ?? 1;
      const pkg: AppPackage = {
        format: "myeve.app-package.reference.v1",
        appId: id,
        version: Number(latest.version) + 1,
        spec: leadCrmSpec(p.ownerId, false, priority),
        work: {
          ownerId: p.ownerId,
          workId: work.id,
          workVersion: work.version,
          workGeneration: work.generation,
        },
        source: {
          repositoryCommit:
            base?.proof.manifest.candidate.commit ?? emptyCommit,
          template: "lead-crm.v1",
          candidateId: work.id,
        },
        factoryVersion,
        base: base
          ? { version: base.package.version, digest: base.digest }
          : null,
        migration:
          priority && fromSchema === 1
            ? { kind: "add-priority", fromSchema: 1, toSchema: 2 }
            : { kind: "identity", fromSchema, toSchema: fromSchema },
      };
      validatePackage(pkg);
      const binding = {
        work: pkg.work,
        appId: id,
        appVersion: pkg.version,
        appDigest: digest(pkg),
        factoryVersion,
      };
      await c.query(
        "INSERT INTO myapps_admissions(owner_id,work_id,app_id,version,binding,package,creation_intent) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)",
        [
          p.ownerId,
          work.id,
          id,
          pkg.version,
          canonical(binding),
          canonical(pkg),
          creationIntent,
        ],
      );
      return { pkg, creationIntent };
    });
  }
  /** The host retains an exact deterministic request before Factory can read it. */
  async admit(p: Principal, pkg: AppPackage) {
    this.permit(p, "apps.manage");
    pkg = validatePackage(pkg);
    requireValue(pkg.work.ownerId === p.ownerId, "APP_UNAVAILABLE");
    return this.atomic(p.ownerId, async (c) => {
      await this.work(c, pkg);
      const binding = {
        work: pkg.work,
        appId: pkg.appId,
        appVersion: pkg.version,
        appDigest: digest(pkg),
        factoryVersion: pkg.factoryVersion,
      };
      const [row] = (
        await c.query(
          "INSERT INTO myapps_admissions(owner_id,work_id,app_id,version,binding) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(owner_id,work_id) DO UPDATE SET work_id=EXCLUDED.work_id RETURNING binding",
          [
            p.ownerId,
            pkg.work.workId,
            pkg.appId,
            pkg.version,
            canonical(binding),
          ],
        )
      ).rows;
      requireValue(
        canonical(row.binding) === canonical(binding),
        "APP_ADMISSION_CONFLICT",
      );
      return binding;
    });
  }
  async authorize(binding: any) {
    try {
      return await this.atomic(binding.work.ownerId, async (c) => {
        const [row] = (
          await c.query(
            "SELECT binding FROM myapps_admissions WHERE owner_id=$1 AND work_id=$2",
            [binding.work.ownerId, binding.work.workId],
          )
        ).rows;
        if (!row || canonical(row.binding) !== canonical(binding)) return false;
        const [work] = (
          await c.query(
            "SELECT version,generation,lifecycle,control FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' AND id=$2 FOR UPDATE",
            [binding.work.ownerId, binding.work.workId],
          )
        ).rows;
        return Boolean(
          work &&
          work.version === binding.work.workVersion &&
          work.generation === binding.work.workGeneration &&
          work.lifecycle === "active" &&
          work.control === "agent",
        );
      });
    } catch {
      return false;
    }
  }
  /** Called by the trusted Factory Result consumer, not by the app/session API. */
  async retain(creationIntent: string, input: unknown, signedResult: unknown) {
    const pkg = validatePackage(input),
      owner = pkg.spec.ownerId,
      id = pkg.appId;
    requireValue(id === appId(owner, creationIntent), "APP_ID_BINDING");
    const accepted = await this.host.verifyResult(signedResult, pkg);
    requireValue(
      accepted.verification.status === "PASS" &&
        accepted.verification.cleanupConfirmed &&
        accepted.verification.appDigest === digest(pkg) &&
        accepted.verification.candidateId === pkg.source.candidateId,
      "VERIFIER_BINDING",
    );
    const proof = {
      ...accepted,
      signedResult,
      publication: "DISABLED",
      installation: "NOT_INSTALLED",
      productionIntegration: "NOT_RUN",
    };
    return this.atomic(owner, async (c) => {
      await this.work(c, pkg);
      await c.query(
        "INSERT INTO myapps_installations(owner_id,app_id,creation_intent,state) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(owner_id,app_id) DO NOTHING",
        [
          owner,
          id,
          creationIntent,
          canonical({
            ownerId: owner,
            appId: id,
            installedVersion: null,
            installedDigest: null,
            enabled: false,
            revision: 0,
            data: { schemaVersion: 1, leads: {} },
            runtimeId: null,
            target: this.host.target,
            grants: [],
          }),
        ],
      );
      const [prior] = (
        await c.query(
          "SELECT * FROM myapps_candidates WHERE owner_id=$1 AND app_id=$2 AND version=$3",
          [owner, id, pkg.version],
        )
      ).rows;
      if (prior) {
        requireValue(
          prior.digest === digest(pkg) &&
            canonical(prior.proof) === canonical(proof),
          "APP_VERSION_IMMUTABLE",
        );
        return prior;
      }
      const [latest] = (
        await c.query(
          "SELECT COALESCE(MAX(version),0) AS version FROM myapps_candidates WHERE owner_id=$1 AND app_id=$2",
          [owner, id],
        )
      ).rows;
      requireValue(
        pkg.version === Number(latest.version) + 1,
        "APP_VERSION_SEQUENCE",
      );
      if (pkg.base) {
        const [base] = (
          await c.query(
            "SELECT digest FROM myapps_candidates WHERE owner_id=$1 AND app_id=$2 AND version=$3",
            [owner, id, pkg.base.version],
          )
        ).rows;
        requireValue(base?.digest === pkg.base.digest, "APP_BASE_MISMATCH");
      }
      await c.query(
        "INSERT INTO myapps_candidates(owner_id,app_id,version,digest,package,proof) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)",
        [owner, id, pkg.version, digest(pkg), canonical(pkg), canonical(proof)],
      );
      await this.audit(
        c,
        owner,
        id,
        "candidate.verified",
        "factory-result-consumer",
        {
          version: pkg.version,
          digest: digest(pkg),
          work: pkg.work,
          verification: digest(proof),
        },
      );
      return { package: pkg, digest: digest(pkg), proof, revoked: false };
    });
  }
  async list(p: Principal) {
    this.permit(p, "apps.read");
    return this.atomic(p.ownerId, async (c) =>
      (
        await c.query(
          "SELECT state FROM myapps_installations WHERE owner_id=$1 ORDER BY app_id",
          [p.ownerId],
        )
      ).rows.map((r) => ({
        ...r.state,
        data: { schemaVersion: r.state.data.schemaVersion, leads: {} },
      })),
    );
  }
  async detail(p: Principal, id: string, version: number) {
    this.permit(p, "apps.read");
    return this.atomic(p.ownerId, async (c) => ({
      app: { ...(await this.app(c, p.ownerId, id)), data: undefined },
      version: {
        ...(await this.candidate(c, p.ownerId, id, version)),
        state: "VERIFIED",
      },
      history: (
        await c.query(
          "SELECT action,actor,evidence,created_at FROM myapps_audit WHERE owner_id=$1 AND app_id=$2 ORDER BY sequence",
          [p.ownerId, id],
        )
      ).rows,
    }));
  }
  async preview(p: Principal, id: string, version: number) {
    this.permit(p, "apps.read");
    return this.atomic(p.ownerId, async (c) => {
      const candidate = await this.candidate(c, p.ownerId, id, version);
      await this.work(c, candidate.package);
      const [prior] = (
        await c.query(
          "SELECT binding,expires_at FROM myapps_previews WHERE owner_id=$1 AND app_id=$2 AND binding->>'digest'=$3 AND binding->>'runtimeId'=$4 AND NOT ended AND expires_at>clock_timestamp() ORDER BY expires_at DESC LIMIT 1",
          [p.ownerId, id, candidate.digest, this.host.runtimeId],
        )
      ).rows;
      if (prior)
        return { ...prior.binding, expiresAt: prior.expires_at.toISOString() };
      const binding = {
        id: randomUUID(),
        appId: id,
        version,
        digest: candidate.digest,
        runtimeId: this.host.runtimeId,
        target: this.host.target,
      };
      const [row] = (
        await c.query(
          "INSERT INTO myapps_previews(owner_id,app_id,id,binding,expires_at) VALUES($1,$2,$3,$4::jsonb,clock_timestamp()+interval '1 hour') RETURNING expires_at",
          [p.ownerId, id, binding.id, canonical(binding)],
        )
      ).rows;
      await this.audit(c, p.ownerId, id, "preview.created", p.actorId, binding);
      return { ...binding, expiresAt: row.expires_at.toISOString() };
    });
  }
  async previewData(p: Principal, id: string, previewId: string) {
    this.permit(p, "apps.read");
    return this.atomic(p.ownerId, async (c) => {
      const preview = await this.currentPreview(c, p.ownerId, id, previewId),
        candidate = await this.candidate(
          c,
          p.ownerId,
          id,
          preview.binding.version,
        ),
        state = await this.app(c, p.ownerId, id);
      await this.work(c, candidate.package);
      const [row] = (
        await c.query(
          "SELECT creation_intent FROM myapps_installations WHERE owner_id=$1 AND app_id=$2",
          [p.ownerId, id],
        )
      ).rows;
      return candidatePreview(
        { ...candidate, state: "VERIFIED" },
        {
          ...preview.binding,
          appDigest: candidate.digest,
          expiresAt: preview.expires_at.toISOString(),
        },
        p,
        row.creation_intent,
        state.installedVersion,
        new Date().toISOString().slice(0, 10),
      );
    });
  }
  async offers(p: Principal) {
    this.permit(p, "apps.read");
    return this.atomic(p.ownerId, async (c) => {
      const rows = (
        await c.query(
          `SELECT p.app_id,p.id,p.binding,v.package FROM myapps_previews p JOIN myapps_candidates v ON v.owner_id=p.owner_id AND v.app_id=p.app_id AND v.version=(p.binding->>'version')::integer JOIN myapps_installations a ON a.owner_id=p.owner_id AND a.app_id=p.app_id WHERE p.owner_id=$1 AND NOT p.ended AND p.expires_at>clock_timestamp() AND NOT v.revoked AND (a.state->>'installedVersion' IS NULL OR (p.binding->>'version')::integer>(a.state->>'installedVersion')::integer) ORDER BY v.version DESC`,
          [p.ownerId],
        )
      ).rows;
      const offers = [];
      for (const r of rows) {
        const state = await this.app(c, p.ownerId, r.app_id),
          base = r.package.base;
        if (
          r.binding.runtimeId !== this.host.runtimeId ||
          r.binding.target !== this.host.target ||
          (base
            ? base.version !== state.installedVersion ||
              base.digest !== state.installedDigest
            : state.installedVersion !== null)
        )
          continue;
        try {
          await this.work(c, r.package);
        } catch {
          continue;
        }
        offers.push({
          ownerId: p.ownerId,
          appId: r.app_id,
          version: r.binding.version,
          previewId: r.id,
          name: r.package.spec.name,
        });
      }
      return offers;
    });
  }
  private async currentPreview(
    c: Connection,
    owner: string,
    id: string,
    previewId: string,
  ) {
    const [row] = (
      await c.query(
        "SELECT * FROM myapps_previews WHERE owner_id=$1 AND app_id=$2 AND id=$3 AND NOT ended AND expires_at>clock_timestamp()",
        [owner, id, previewId],
      )
    ).rows;
    requireValue(
      row &&
        row.binding.runtimeId === this.host.runtimeId &&
        row.binding.target === this.host.target,
      "PREVIEW_EXPIRED",
    );
    return row;
  }
  async endPreviews(p: Principal, id: string) {
    this.permit(p, "apps.manage");
    return this.atomic(p.ownerId, async (c) => {
      await this.app(c, p.ownerId, id);
      await c.query(
        "UPDATE myapps_previews SET ended=true WHERE owner_id=$1 AND app_id=$2",
        [p.ownerId, id],
      );
      await this.audit(c, p.ownerId, id, "preview.cleaned", p.actorId, {
        temporaryDataRetained: false,
      });
    });
  }
  /** Retained event is the outbox: ingest is duplicate-safe after crash/restart. */
  async requestInstall(p: Principal, id: string, previewId: string) {
    this.permit(p, "apps.manage");
    const event = await this.atomic(p.ownerId, async (c) => {
      const preview = await this.currentPreview(c, p.ownerId, id, previewId),
        candidate = await this.candidate(
          c,
          p.ownerId,
          id,
          preview.binding.version,
        ),
        state = await this.app(c, p.ownerId, id);
      await this.work(c, candidate.package);
      const binding = {
        owner: p.ownerId,
        work: candidate.package.work,
        appId: id,
        version: candidate.package.version,
        candidate: candidate.digest,
        verification: digest(candidate.proof),
        capabilities: candidate.package.spec.capabilities,
        operations: [
          ...candidate.package.spec.queries,
          ...candidate.package.spec.actions,
        ].map((o) => o.name),
        runtimeId: this.host.runtimeId,
        target: this.host.target,
        revision: state.revision,
        previewId,
        expiresAt: preview.expires_at.toISOString(),
      };
      const requestId = digest(binding),
        [prior] = (
          await c.query(
            "SELECT event FROM myapps_install_requests WHERE owner_id=$1 AND app_id=$2 AND id=$3",
            [p.ownerId, id, requestId],
          )
        ).rows;
      if (prior) return prior.event;
      const event = eventSchema.parse({
        kind: "DECISION",
        title: `Install ${candidate.package.spec.name} version ${candidate.package.version}`,
        summary:
          "Install privately with the displayed app permissions. Publication and deployment remain disabled.",
        source: {
          system: "work",
          accountId: p.ownerId,
          eventId: requestId,
          sender: "Sofie",
          occurredAt: new Date().toISOString(),
          reference: candidate.package.work.workId,
          evidence: [candidate.digest, digest(candidate.proof)],
        },
        correlationId: requestId,
        episode: 1,
        sequence: 1,
        workId: candidate.package.work.workId,
        workVersion: candidate.package.work.workVersion,
        workGeneration: candidate.package.work.workGeneration,
        action: {
          id: requestId,
          kind: "decision",
          reason: "choice",
          involvement: "NECESSARY_JUDGMENT",
          prompt: `Approve private installation of version ${candidate.package.version}? Candidate ${candidate.digest}. No network, secrets, Memory, Files or connected accounts.`,
          options: ["Install privately", "Decline"],
          expiresAt: binding.expiresAt,
        },
        priority: { blockingActiveWork: true },
      });
      await c.query(
        "INSERT INTO myapps_install_requests(owner_id,app_id,id,binding,event) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)",
        [p.ownerId, id, requestId, canonical(binding), canonical(event)],
      );
      return event;
    });
    return this.inbox(p.ownerId).ingest(event);
  }
  /** Owner identity comes from authentication. A submitted response object is never trusted. */
  async install(p: Principal, id: string, responseId: string) {
    this.permit(p, "apps.install");
    requireValue(p.kind === "human", "APP_UNAVAILABLE");
    return this.atomic(p.ownerId, async (c) => {
      // Work locking precedes Inbox locking, matching canonical Work continuation order.
      const [saved] = (
        await c.query(
          "SELECT data FROM inbox_attention_responses WHERE owner_id=$1 AND id=$2",
          [p.ownerId, responseId],
        )
      ).rows;
      const response = saved?.data as OwnerResponse | undefined;
      requireValue(response, "INSTALLATION_APPROVAL_REQUIRED");
      const [request] = (
        await c.query(
          "SELECT * FROM myapps_install_requests WHERE owner_id=$1 AND app_id=$2 AND id=$3",
          [p.ownerId, id, response.action.id],
        )
      ).rows;
      requireValue(request, "INSTALLATION_APPROVAL_REQUIRED");
      const b = request.binding,
        candidate = await this.candidate(c, p.ownerId, id, b.version),
        state = await this.app(c, p.ownerId, id);
      await this.work(c, candidate.package);
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,719))", [
        p.ownerId,
      ]);
      const [fresh] = (
        await c.query(
          "SELECT data FROM inbox_attention_responses WHERE owner_id=$1 AND id=$2 FOR UPDATE",
          [p.ownerId, responseId],
        )
      ).rows;
      const [attention] = (
        await c.query(
          "SELECT data FROM inbox_attention_items WHERE owner_id=$1 AND id=$2 FOR UPDATE",
          [p.ownerId, response.itemId],
        )
      ).rows;
      const item = attention?.data as AttentionItem | undefined,
        r = fresh?.data as OwnerResponse | undefined;
      requireValue(
        r &&
          item &&
          item.responseId === responseId &&
          ["WAITING", "RESOLVED"].includes(item.status) &&
          ["PENDING", "DELIVERED"].includes(r.status) &&
          r.actionBinding === attentionHash(request.event.action) &&
          canonical(r.action) === canonical(request.event.action) &&
          r.workId === b.work.workId &&
          r.workVersion === b.work.workVersion &&
          r.workGeneration === b.work.workGeneration &&
          r.correlationId === request.event.correlationId &&
          r.episode === request.event.episode &&
          item.sourceSequence === request.event.sequence,
        "INSTALLATION_APPROVAL_REQUIRED",
      );
      requireValue(
        b.runtimeId === this.host.runtimeId &&
          b.target === this.host.target &&
          b.candidate === candidate.digest &&
          b.verification === digest(candidate.proof) &&
          canonical(b.capabilities) ===
            canonical(candidate.package.spec.capabilities),
        "INSTALLATION_STALE",
      );
      if (request.response_id) {
        requireValue(
          request.response_id === responseId &&
            (request.outcome === "DENIED" ||
              (state.installedVersion === b.version &&
                state.installedDigest === b.candidate &&
                state.enabled)),
          "INSTALLATION_STALE",
        );
        return {
          version: b.version,
          digest: b.candidate,
          outcome: request.outcome,
          duplicate: true,
        };
      }
      await this.currentPreview(c, p.ownerId, id, b.previewId);
      requireValue(state.revision === b.revision, "INSTALLATION_STALE");
      requireValue(
        r.answer === "Install privately" || r.answer === "Decline",
        "INSTALLATION_APPROVAL_REQUIRED",
      );
      if (r.answer === "Install privately") {
        const base = candidate.package.base;
        requireValue(
          base
            ? base.version === state.installedVersion &&
                base.digest === state.installedDigest
            : state.installedVersion === null,
          "INSTALLATION_BASE_MISMATCH",
        );
        requireValue(
          state.data.schemaVersion === candidate.package.migration.fromSchema,
          "MIGRATION_FAILED",
        );
        if (candidate.package.migration.kind === "add-priority") {
          for (const lead of Object.values(state.data.leads))
            lead.priority = null;
          state.data.schemaVersion = 2;
        }
        state.installedVersion = b.version;
        state.installedDigest = b.candidate;
        state.runtimeId = b.runtimeId;
        state.target = b.target;
        state.grants = b.operations;
        state.enabled = true;
        state.revision++;
        await this.save(c, state);
      }
      const outcome = r.answer === "Install privately" ? "INSTALLED" : "DENIED";
      await c.query(
        "UPDATE myapps_install_requests SET response_id=$4,outcome=$5 WHERE owner_id=$1 AND app_id=$2 AND id=$3",
        [p.ownerId, id, request.id, responseId, outcome],
      );
      await this.audit(
        c,
        p.ownerId,
        id,
        outcome === "INSTALLED" ? "app.installed" : "installation.denied",
        p.actorId,
        { binding: b, responseId },
      );
      const delivered = {
        ...r,
        status: "DELIVERED",
        receipt: `myapps:${outcome}:${request.id}`,
      };
      const resolved = {
        ...item,
        status: "RESOLVED",
        action: null,
        actionBinding: null,
        revision: item.revision + 1,
        resolvedAt: new Date().toISOString(),
      };
      await c.query(
        "UPDATE inbox_attention_responses SET data=$3::jsonb WHERE owner_id=$1 AND id=$2",
        [p.ownerId, responseId, canonical(delivered)],
      );
      await c.query(
        "UPDATE inbox_attention_items SET data=$3::jsonb WHERE owner_id=$1 AND id=$2",
        [p.ownerId, item.id, canonical(resolved)],
      );
      return {
        version: b.version,
        digest: b.candidate,
        outcome,
        duplicate: false,
      };
    });
  }
  async consumeOwnerResponse(p: Principal, response: OwnerResponse) {
    this.permit(p, "apps.install");
    requireValue(
      p.kind === "human" && p.ownerId === response.ownerId,
      "APP_UNAVAILABLE",
    );
    const appId = await this.atomic(p.ownerId, async (c) => {
      const [row] = (
        await c.query(
          "SELECT app_id FROM myapps_install_requests WHERE owner_id=$1 AND id=$2",
          [p.ownerId, response.action.id],
        )
      ).rows;
      return row?.app_id as string | undefined;
    });
    if (!appId) return null;
    const receipt = await this.install(p, appId, response.id);
    return {
      status: "accepted" as const,
      receipt: `myapps:${response.id}:${receipt.outcome}`,
    };
  }

  async setEnabled(
    p: Principal,
    id: string,
    enabled: boolean,
    revision: number,
  ) {
    this.permit(p, "apps.manage");
    requireValue(
      p.kind === "human" && typeof enabled === "boolean",
      "APP_UNAVAILABLE",
    );
    return this.atomic(p.ownerId, async (c) => {
      const state = await this.app(c, p.ownerId, id);
      requireValue(
        state.revision === revision && state.installedVersion,
        "APP_REVISION_CONFLICT",
      );
      await this.candidate(c, p.ownerId, id, state.installedVersion);
      state.enabled = enabled;
      state.revision++;
      await this.save(c, state);
      await this.audit(
        c,
        p.ownerId,
        id,
        enabled ? "app.enabled" : "app.disabled",
        p.actorId,
        { revision: state.revision },
      );
      return { revision: state.revision };
    });
  }
  async revoke(p: Principal, id: string, version: number) {
    this.permit(p, "apps.manage");
    requireValue(p.kind === "human", "APP_UNAVAILABLE");
    return this.atomic(p.ownerId, async (c) => {
      const state = await this.app(c, p.ownerId, id);
      await c.query(
        "UPDATE myapps_candidates SET revoked=true WHERE owner_id=$1 AND app_id=$2 AND version=$3",
        [p.ownerId, id, version],
      );
      if (state.installedVersion === version) {
        state.enabled = false;
        state.grants = [];
      }
      state.revision++;
      await this.save(c, state);
      await this.audit(c, p.ownerId, id, "version.revoked", p.actorId, {
        version,
      });
    });
  }
  async operate(
    p: Principal,
    id: string,
    version: number,
    hash: string,
    operation: string,
    input: unknown,
    key?: string,
  ) {
    this.permit(p, operation);
    const write = ACTIONS.some((o) => o.name === operation);
    requireValue(
      write || QUERIES.some((o) => o.name === operation),
      "APP_UNAVAILABLE",
    );
    return this.atomic(p.ownerId, (c) =>
      this.apply(c, p, id, version, hash, operation, input, key),
    );
  }
  private async apply(
    c: Connection,
    p: Principal,
    id: string,
    version: number,
    hash: string,
    operation: string,
    input: unknown,
    key?: string,
  ) {
    this.permit(p, operation);
    const write = ACTIONS.some((o) => o.name === operation);
    const state = await this.app(c, p.ownerId, id),
      candidate = await this.candidate(c, p.ownerId, id, version);
    requireValue(
      state.enabled &&
        state.installedVersion === version &&
        state.installedDigest === hash &&
        candidate.digest === hash &&
        state.runtimeId === this.host.runtimeId &&
        state.target === this.host.target &&
        state.grants.includes(operation),
      "APP_UNAVAILABLE",
    );
    const requestHash = digest({
      actor: p.actorId,
      kind: p.kind,
      version,
      hash,
      operation,
      input,
    });
    if (write) {
      text(key);
      const [prior] = (
        await c.query(
          "SELECT * FROM myapps_receipts WHERE owner_id=$1 AND app_id=$2 AND id=$3",
          [p.ownerId, id, key],
        )
      ).rows;
      if (prior) {
        requireValue(
          prior.request_hash === requestHash,
          "IDEMPOTENCY_CONFLICT",
        );
        return prior.response;
      }
    }
    // The same trusted typed CRM implementation runs for UI and Sofie. No generated callbacks.
    const crm = new Crm(
      {
        operate: (_p, _i, _v, _h, _op, _w, _input, _key, handler) =>
          handler(state, new Date().toISOString()),
      },
      p,
    );
    const output = write
      ? crm.action(
          id,
          version,
          hash,
          operation as keyof ActionInput,
          input as any,
          key!,
        )
      : crm.query(
          id,
          version,
          hash,
          operation as keyof QueryInput,
          input as any,
        );
    if (write) {
      await this.save(c, state);
      await c.query(
        "INSERT INTO myapps_receipts(owner_id,app_id,id,request_hash,response) VALUES($1,$2,$3,$4,$5::jsonb)",
        [p.ownerId, id, key, requestHash, canonical(output)],
      );
    }
    await this.audit(c, p.ownerId, id, operation, p.actorId, {
      version,
      digest: hash,
      requestHash,
      kind: p.kind,
    });
    return output;
  }
  async sofie(p: Principal, requestId: string, request: string) {
    this.permit(p, "apps.read");
    text(requestId);
    text(request, 1000);
    const move =
      /^Move (.{1,160}) to (New|Contacted|Qualified|Discovery|Proposal|Won|Lost)\.$/.exec(
        request,
      );
    const show = request === "Show me my CRM." || request === "Show me my CRM";
    if (!show && !move)
      return {
        status: "NO_MATCH",
        message: "Choose an available app operation; no action was taken.",
      };
    return this.atomic(p.ownerId, async (c) => {
      const apps = (
        await c.query(
          "SELECT state FROM myapps_installations WHERE owner_id=$1 AND state->>'enabled'='true'",
          [p.ownerId],
        )
      ).rows;
      if (apps.length !== 1)
        return {
          status: apps.length ? "AMBIGUOUS" : "NO_MATCH",
          message: apps.length
            ? "Choose which CRM to use."
            : "No enabled CRM is installed.",
        };
      const state = apps[0].state as State,
        id = state.appId,
        version = state.installedVersion!,
        hash = state.installedDigest!;
      const operation = show ? "listLeads" : "updateStage";
      this.permit(p, operation);
      const current = await this.candidate(c, p.ownerId, id, version);
      requireValue(
        state.runtimeId === this.host.runtimeId &&
          state.target === this.host.target &&
          state.grants.includes(operation) &&
          current.digest === hash,
        "APP_UNAVAILABLE",
      );
      const requestHash = digest({
        request,
        actor: p.actorId,
        kind: p.kind,
        version,
        hash,
      });
      const key = "conversation:" + requestId;
      const [prior] = (
        await c.query(
          "SELECT request_hash,response FROM myapps_receipts WHERE owner_id=$1 AND app_id=$2 AND id=$3",
          [p.ownerId, id, key],
        )
      ).rows;
      if (prior) {
        requireValue(
          prior.request_hash === requestHash,
          "IDEMPOTENCY_CONFLICT",
        );
        return prior.response;
      }
      const leads = await this.apply(c, p, id, version, hash, "listLeads", {});
      let output: any = {
        status: "ANSWER",
        target: { appId: id, version, digest: hash, operation },
        leads,
        message: "Here is your CRM.",
      };
      if (move) {
        const matches = leads.filter((l: any) =>
          [l.company, l.name].some(
            (v) => v.toLowerCase() === move[1].toLowerCase(),
          ),
        );
        if (matches.length !== 1)
          return {
            status: matches.length ? "AMBIGUOUS" : "NO_MATCH",
            message: "Choose exactly one lead.",
          };
        const lead = await this.apply(
          c,
          p,
          id,
          version,
          hash,
          "updateStage",
          {
            leadId: matches[0].id,
            expectedRevision: matches[0].revision,
            stage: move[2],
          },
          "agent-operation:" + requestId,
        );
        output = {
          status: "ANSWER",
          target: output.target,
          lead,
          message: lead.company + " is now in " + lead.stage + ".",
        };
      }
      await c.query(
        "INSERT INTO myapps_receipts(owner_id,app_id,id,request_hash,response) VALUES($1,$2,$3,$4,$5::jsonb)",
        [p.ownerId, id, key, requestHash, canonical(output)],
      );
      return output;
    });
  }
}
