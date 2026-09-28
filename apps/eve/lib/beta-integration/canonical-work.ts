import {
  NativeRouteAuthority,
  admitNativeWork,
} from "../engineering/native-routing.ts";
import { WorkError } from "../engineering/types.ts";
import { EngineeringWorkerProjectionStore } from "../engineering/worker-projection.ts";
import {
  continuationInput,
  type Continuation,
} from "../universal-inbox/continuation.ts";
import { contractDigest } from "../goal-work/canonical-adapter.ts";
import {
  eventSchema,
  type OwnerResponse,
} from "../universal-inbox/contracts.ts";
import type { BetaIntegration } from "./runtime.ts";

/** Trusted composition only. No writer/provider capability is implemented here. */
export class CanonicalBetaWork {
  constructor(
    readonly beta: BetaIntegration,
    readonly authorityFor = (owner: string) =>
      new NativeRouteAuthority(beta.store(owner)),
  ) {}
  async admit(
    owner: string,
    workId: string,
    version: number,
    generation: number,
  ) {
    const store = this.beta.store(owner),
      work = await store.get(workId);
    if (work.version !== version || work.generation !== generation)
      throw new WorkError(
        "work_changed",
        "Refresh the current Work before admission.",
        409,
      );
    let receipt: unknown = null,
      reason = "",
      status: "ADMITTED" | "DENIED" = "DENIED";
    try {
      const authority = this.authorityFor(owner);
      const assessment = await authority.assess(workId);
      if (!assessment.decision.admitted)
        throw new WorkError(
          "route_denied",
          assessment.decision.reasons.join(" "),
          403,
        );
      // The canonical native contract requires retained pricing from the exact
      // budgeted owner conversation. An Inbox answer cannot fabricate that receipt.
      const [call] = await this.beta.query(
        `SELECT c.session_id FROM engineering_work_model_calls c
        JOIN engineering_work_model_budget b ON b.scope_id=c.scope_id AND b.work_id=c.work_id AND b.scope_kind=c.scope_kind
        WHERE c.scope_id=$1 AND c.scope_kind='personal' AND c.work_id=$2 AND c.work_version=$3 AND c.work_generation=$4
          AND c.purpose='CONVERSATION_REASONING' AND c.status='RECONCILED' ORDER BY c.created_at DESC LIMIT 1`,
        [owner, workId, version, generation],
      );
      if (!call)
        throw new WorkError(
          "completion_conversation_required",
          "A current budgeted Sofie admission conversation is required. No provider was dispatched.",
          409,
        );
      receipt = await admitNativeWork(
        store,
        workId,
        version,
        generation,
        authority,
        String(call.session_id),
      );
      status = "ADMITTED";
      reason =
        "Canonical admission retained. No provider dispatched by this request.";
    } catch (error) {
      if (!(error instanceof WorkError)) throw error;
      reason = `${error.code}: ${error.message}`;
    }
    await this.beta.query(
      `INSERT INTO beta_work_admission_attempts(owner_id,work_id,work_version,work_generation,status,reason,receipt)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(owner_id,work_id,work_version,work_generation)
      DO UPDATE SET status=excluded.status,reason=excluded.reason,receipt=excluded.receipt,updated_at=now()`,
      [
        owner,
        workId,
        version,
        generation,
        status,
        reason,
        JSON.stringify(receipt),
      ],
    );
    if (status === "ADMITTED")
      await this.beta.query(
        `UPDATE beta_goal_work_bindings SET binding=jsonb_set(jsonb_set(binding,'{workGeneration}',to_jsonb($3::integer)),'{state}','"ADMITTED"'::jsonb)
      WHERE owner_id=$1 AND work_id=$2`,
        [owner, workId, generation],
      );
    return { status, reason, receipt };
  }
  async projection(owner: string, workId: string) {
    const [agent] = await this.beta.query(
      "SELECT id FROM agents WHERE owner_id=$1 AND is_primary AND status='active' ORDER BY id LIMIT 1",
      [owner],
    );
    const { projection } = await new EngineeringWorkerProjectionStore(
      this.beta.store(owner),
      String(agent?.id ?? "unbound-sofie"),
    ).get(workId);
    const [admission] = await this.beta.query(
      "SELECT status,reason,work_version,work_generation FROM beta_work_admission_attempts WHERE owner_id=$1 AND work_id=$2 ORDER BY updated_at DESC LIMIT 1",
      [owner, workId],
    );
    return { projection, admission: admission ?? null };
  }
  async requestDecision(
    owner: string,
    workId: string,
    prompt: string,
    options: string[],
  ) {
    const work = await this.beta.store(owner).get(workId);
    if (work.lifecycle !== "active" || work.control !== "paused")
      throw new WorkError(
        "work_not_blocked",
        "Pause Work at its canonical control boundary before requesting judgment.",
        409,
      );
    const actionId = `work-choice:${workId}:${work.version}:${work.generation}`;
    const event = eventSchema.parse({
      kind: "DECISION",
      title: work.title,
      summary:
        "Owner judgment is required. An answer records continuation eligibility only.",
      source: {
        system: "work",
        accountId: owner,
        eventId: actionId,
        sender: "Sofie",
        occurredAt: work.updatedAt,
        reference: workId,
      },
      correlationId: actionId,
      episode: 1,
      sequence: 1,
      workId,
      workVersion: work.version,
      workGeneration: work.generation,
      action: {
        id: actionId,
        kind: "decision",
        reason: "choice",
        involvement: "NECESSARY_JUDGMENT",
        prompt,
        options,
      },
      priority: { blockingActiveWork: true },
    });
    const [saved] = await this.beta.query(
      `INSERT INTO beta_work_decisions(owner_id,work_id,action_id,work_version,work_generation,event) VALUES($1,$2,$3,$4,$5,$6::jsonb)
      ON CONFLICT(owner_id,action_id) DO UPDATE SET action_id=excluded.action_id RETURNING event`,
      [
        owner,
        workId,
        actionId,
        work.version,
        work.generation,
        JSON.stringify(event),
      ],
    );
    if (contractDigest(saved.event) !== contractDigest(event))
      throw new WorkError(
        "decision_conflict",
        "The current Work already has a different retained question.",
        409,
      );
    return this.beta.inbox(owner).ingest(event);
  }
  async accept(response: OwnerResponse) {
    const input: Continuation = continuationInput(response);
    if (!input.workId || input.canonicalApproval)
      throw new WorkError(
        "continuation_target",
        "Only Work judgment belongs to this consumer.",
        403,
      );
    const retained = await this.beta
      .responses()
      .read(input.ownerId, input.responseId);
    if (
      !retained ||
      contractDigest(continuationInput(retained)) !== contractDigest(input)
    )
      throw new WorkError(
        "continuation_source",
        "Retained owner response required.",
        403,
      );
    const status = await this.beta.transaction(async (c) => {
      const [work] = (
        await c.query(
          `SELECT version,generation,control,lifecycle FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' AND id=$2 FOR UPDATE`,
          [input.ownerId, input.workId],
        )
      ).rows;
      if (!work) throw new WorkError("work_not_found", "Work not found.", 404);
      const [decision] = (
        await c.query(
          "SELECT * FROM beta_work_decisions WHERE owner_id=$1 AND work_id=$2 AND action_id=$3",
          [input.ownerId, input.workId, input.actionId],
        )
      ).rows;
      if (
        !decision ||
        contractDigest(decision.event.action) !== input.actionBinding
      )
        throw new WorkError(
          "continuation_binding",
          "Retained action binding required.",
          403,
        );
      const hash = contractDigest(input);
      const [prior] = (
        await c.query(
          "SELECT status,response_hash FROM beta_work_continuations WHERE owner_id=$1 AND response_id=$2",
          [input.ownerId, input.responseId],
        )
      ).rows;
      if (prior) {
        if (prior.response_hash !== hash)
          throw new Error("Continuation identity conflict");
        return prior.status;
      }
      const eligible =
        work.version === input.workVersion &&
        work.generation === input.workGeneration &&
        work.control === "paused" &&
        work.lifecycle === "active" &&
        decision.work_version === input.workVersion &&
        decision.work_generation === input.workGeneration &&
        retained.status === "PENDING";
      const next = eligible ? "ELIGIBLE" : "STALE";
      await c.query(
        `INSERT INTO beta_work_continuations(owner_id,response_id,work_id,work_version,work_generation,action_id,response_hash,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          input.ownerId,
          input.responseId,
          input.workId,
          input.workVersion,
          input.workGeneration,
          input.actionId,
          hash,
          next,
        ],
      );
      return next;
    });
    return {
      status:
        status === "ELIGIBLE" ? ("accepted" as const) : ("stale" as const),
      receipt: `canonical-work:${input.responseId}:${status}`,
    };
  }
}
