import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import type { ExecutionDatabase } from "../execution-types.ts";
import { digest } from "../engineering/contract.ts";
import type { ExternalAlphaPolicy } from "./policy.ts";

type Admission = {
  id: string;
  cohort_id: string;
  owner_id: string;
  policy_sha256: string;
  kind: "CHAT" | "WORK";
  binding_sha256: string;
  request_sha256: string;
  ceiling_microusd: string;
  state: "RESERVED" | "BOUND" | "UNKNOWN";
  local_allowance_id: string | null;
  deadline: string;
};
export interface AlphaAccountingDatabase extends ExecutionDatabase {
  /** Explicit server-side dependency injection, used by disposable qualification
   * databases. Production resolves the separate restricted accounting DB. */
  externalAlphaAccounting?: SharedAlphaAccounting;
}
let configured: { url: string; database: ExecutionDatabase } | undefined;
export function sharedAlphaAccounting(
  database: AlphaAccountingDatabase,
  env: NodeJS.ProcessEnv = process.env,
): SharedAlphaAccounting {
  if (database.externalAlphaAccounting) return database.externalAlphaAccounting;
  const url = env.MYEVE_EXTERNAL_ALPHA_ACCOUNTING_DATABASE_URL;
  const credential = env.MYEVE_EXTERNAL_ALPHA_ACCOUNTING_TOKEN;
  if (!url || !credential || !/^[a-f0-9]{64}$/.test(credential) || typeof window !== "undefined")
    throw Error("EXTERNAL_ALPHA_SHARED_CONFIGURATION_REQUIRED");
  if (!configured || configured.url !== url) {
    const pg = createRequire(import.meta.url)("pg");
    const pool = new pg.Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 5000, query_timeout: 10000 });
    pool.on("error", () => {});
    configured = { url, database: { query: async (q, p) => (await pool.query(q, p)).rows } };
  }
  return new SharedAlphaAccounting(configured.database, credential);
}

/** Authoritative full-allowance reservation shared by the two isolated app DBs.
 * The protocol deliberately never refunds a reservation: crashes, cancellation,
 * expiry and unused allowance cannot create more paid authority. */
export class SharedAlphaAccounting {
  constructor(readonly database: ExecutionDatabase, private readonly credential: string) {}
  private async call(policy: ExternalAlphaPolicy, payload: Record<string, unknown>): Promise<Admission> {
    try {
      const [row] = await this.database.query("SELECT external_alpha_cohort_call($1::jsonb) AS receipt", [JSON.stringify({
        ...payload, cohortId: policy.cohortId, ownerId: policy.ownerId, slot: policy.slot,
        policySha256: digest(policy), credential: this.credential,
      })]);
      if (!row?.receipt) throw Error();
      return row.receipt as Admission;
    } catch (error) {
      // Database/network errors must never expose the connection URL, token or
      // SQL parameters to the caller, logs, Result or browser.
      const code = /EXTERNAL_ALPHA_SHARED_[A-Z_]+/.exec(error instanceof Error ? error.message : "")?.[0];
      throw Error(code ?? "EXTERNAL_ALPHA_SHARED_UNAVAILABLE");
    }
  }
  async reserve(policy: ExternalAlphaPolicy, input: { kind: "CHAT" | "WORK"; bindingId: string; requestSha256: string }) {
    const row = await this.call(policy, { mode: "reserve", id: randomUUID(), kind: input.kind,
      bindingSha256: digest(input.bindingId), requestSha256: input.requestSha256 });
    if (row.owner_id !== policy.ownerId || row.cohort_id !== policy.cohortId || row.policy_sha256 !== digest(policy)
      || row.kind !== input.kind || row.binding_sha256 !== digest(input.bindingId) || row.request_sha256 !== input.requestSha256
      || Number(row.ceiling_microusd) !== (input.kind === "CHAT" ? 100000 : 1300000))
      throw Error("EXTERNAL_ALPHA_SHARED_RECEIPT_MISMATCH");
    return row;
  }
  async bind(database: ExecutionDatabase, policy: ExternalAlphaPolicy, admission: Admission, allowanceId: string) {
    // Remote commit precedes local mirror. If either acknowledgment is lost,
    // the same binding can resume; it cannot reserve or bind another allowance.
    const bound = await this.call(policy, { mode: "bind", id: admission.id, allowanceId });
    if (bound.local_allowance_id !== allowanceId || bound.id !== admission.id || bound.state !== "BOUND")
      throw Error("EXTERNAL_ALPHA_SHARED_RECEIPT_MISMATCH");
    const receiptSha256 = digest({ admissionId: admission.id, cohortId: admission.cohort_id,
      ownerId: policy.ownerId, policySha256: digest(policy), allowanceId, deadline: admission.deadline });
    await database.query(`INSERT INTO external_alpha_shared_binding(allowance_id,admission_id,cohort_id,receipt_sha256,deadline)
      VALUES($1,$2,$3,$4,$5::timestamptz) ON CONFLICT DO NOTHING`,
    [allowanceId, admission.id, admission.cohort_id, receiptSha256, admission.deadline]);
    const [local] = await database.query("SELECT * FROM external_alpha_shared_binding WHERE allowance_id=$1", [allowanceId]);
    if (local?.admission_id !== admission.id || local?.receipt_sha256 !== receiptSha256)
      throw Error("EXTERNAL_ALPHA_SHARED_LOCAL_BINDING_MISMATCH");
  }
  async assertBound(database: ExecutionDatabase, policy: ExternalAlphaPolicy, allowanceId: string) {
    const [local] = await database.query("SELECT admission_id FROM external_alpha_shared_binding WHERE allowance_id=$1 AND cohort_id=$2 AND deadline>clock_timestamp()", [allowanceId, policy.cohortId]);
    if (!local) throw Error("EXTERNAL_ALPHA_SHARED_LOCAL_BINDING_REQUIRED");
    return this.call(policy, { mode: "assert", id: local.admission_id, allowanceId });
  }
  async dispatch(database: ExecutionDatabase, policy: ExternalAlphaPolicy, allowanceId: string, operationKey: string) {
    const [local] = await database.query("SELECT admission_id FROM external_alpha_shared_binding WHERE allowance_id=$1 AND cohort_id=$2 AND deadline>clock_timestamp()", [allowanceId, policy.cohortId]);
    if (!local) throw Error("EXTERNAL_ALPHA_SHARED_LOCAL_BINDING_REQUIRED");
    return this.call(policy, { mode: "dispatch", id: local.admission_id, allowanceId, operationSha256: digest(operationKey) });
  }
  async workPhase(database: ExecutionDatabase, policy: ExternalAlphaPolicy, allowanceId: string, authorityId: string, phase: "running_work" | "hold_work") {
    if(phase==="running_work") {
      const [known]=await database.query("SELECT 1 FROM external_alpha_work_authority WHERE id=$1 AND owner_id=$2 AND allowance_id=$3 AND state='CONSUMED' AND receipt IS NOT NULL",[authorityId,policy.ownerId,allowanceId]);
      if(!known)throw Error("EXTERNAL_ALPHA_SHARED_KNOWN_WORK_REQUIRED");
    }
    const [local] = await database.query("SELECT admission_id FROM external_alpha_shared_binding WHERE allowance_id=$1 AND cohort_id=$2", [allowanceId, policy.cohortId]);
    if (!local) throw Error("EXTERNAL_ALPHA_SHARED_LOCAL_BINDING_REQUIRED");
    return this.call(policy, {mode:phase,id:local.admission_id,allowanceId,operationSha256:digest("work:"+authorityId)});
  }
  async settle(database: ExecutionDatabase, policy: ExternalAlphaPolicy, allowanceId: string, operationKey: string) {
    const [local] = await database.query("SELECT admission_id FROM external_alpha_shared_binding WHERE allowance_id=$1 AND cohort_id=$2", [allowanceId, policy.cohortId]);
    if (!local) throw Error("EXTERNAL_ALPHA_SHARED_LOCAL_BINDING_REQUIRED");
    return this.call(policy, { mode: "settle", id: local.admission_id, allowanceId, operationSha256: digest(operationKey) });
  }
  async fence(database: ExecutionDatabase, policy: ExternalAlphaPolicy, allowanceId: string) {
    const [local] = await database.query("SELECT admission_id FROM external_alpha_shared_binding WHERE allowance_id=$1 AND cohort_id=$2", [allowanceId, policy.cohortId]);
    if (!local) throw Error("EXTERNAL_ALPHA_SHARED_LOCAL_BINDING_REQUIRED");
    return this.call(policy, { mode: "fence", id: local.admission_id });
  }
  async cancelUnsent(database: ExecutionDatabase, policy: ExternalAlphaPolicy, allowanceId: string, operationKey: string) {
    const [unsent] = await database.query(`SELECT o.id FROM external_alpha_operation o JOIN external_alpha_allowance a ON a.id=o.allowance_id
      WHERE a.id=$1 AND a.owner_id=$2 AND a.policy_sha256=$3 AND o.source='SOFIE' AND o.state='NOT_DISPATCHED' AND 'sofie:'||o.step_key=$4`,[allowanceId,policy.ownerId,digest(policy),operationKey]);
    if (!unsent) throw Error("EXTERNAL_ALPHA_SHARED_NO_SEND_FACT_REQUIRED");
    const [local] = await database.query("SELECT admission_id FROM external_alpha_shared_binding WHERE allowance_id=$1 AND cohort_id=$2", [allowanceId, policy.cohortId]);
    if (!local) throw Error("EXTERNAL_ALPHA_SHARED_LOCAL_BINDING_REQUIRED");
    return this.call(policy, { mode: "cancel_unsent", id: local.admission_id, allowanceId, operationSha256: digest(operationKey) });
  }
  /** Restart repair only records facts already durable locally. It never
   * dispatches, creates allowance/authority, refunds charge, or clears UNKNOWN. */
  async reconcile(database: ExecutionDatabase, policy: ExternalAlphaPolicy) {
    // Only preparations created by 0091 can be cancelled after a restart. A
    // concurrent provider claim and cancellation serialize on the same row.
    const prepared = await database.query(`SELECT o.* FROM external_alpha_operation o
      JOIN external_alpha_allowance a ON a.id=o.allowance_id
      WHERE a.owner_id=$1 AND a.policy_sha256=$2 AND o.source='SOFIE'
      AND o.state='PREPARED' AND o.created_at<clock_timestamp()-interval '60 seconds'`, [policy.ownerId, digest(policy)]);
    for (const op of prepared) await database.query("SELECT external_alpha_model_transition($1::jsonb)", [JSON.stringify({
      ownerId: policy.ownerId, policySha256: digest(policy), allowanceId: op.allowance_id,
      operationId: op.id, requestSha256: op.request_sha256, state: "NOT_DISPATCHED",
    })]);
    const rows = await database.query(`SELECT a.id,a.state,au.id AS authority_id,au.state AS authority_state,au.consumed_at,au.terminal_reason,
      r.settlement_state,r.exposure_unknown
      FROM external_alpha_allowance a JOIN external_alpha_shared_binding b ON b.allowance_id=a.id
      LEFT JOIN external_alpha_work_authority au ON au.allowance_id=a.id
      LEFT JOIN external_alpha_work_result r ON r.authority_id=au.id
      WHERE a.owner_id=$1 AND a.policy_sha256=$2`, [policy.ownerId, digest(policy)]);
    for (const row of rows) {
      if (row.state === "UNKNOWN" || row.authority_state === "UNKNOWN" || row.exposure_unknown === true) {
        await this.fence(database, policy, row.id as string);
        continue;
      }
      if (row.settlement_state === "SETTLED" && row.exposure_unknown === false) {
        await this.settle(database, policy, row.id as string, "work:" + row.authority_id);
      }
      if (row.authority_state === "CANCELLED" && row.consumed_at === null && /^FACTORY_DENIED:/.test(String(row.terminal_reason ?? "")))
        await this.settle(database, policy, row.id as string, "work:" + row.authority_id);
      const operations = await database.query("SELECT step_key,state FROM external_alpha_operation WHERE allowance_id=$1 AND source='SOFIE'", [row.id]);
      for (const op of operations) {
        if (op.state === "UNKNOWN") await this.fence(database, policy, row.id as string);
        else if (op.state === "SETTLED") await this.settle(database, policy, row.id as string, "sofie:" + op.step_key);
        else if (op.state === "NOT_DISPATCHED") await this.cancelUnsent(database, policy, row.id as string, "sofie:" + op.step_key);
      }
    }
    // 0090 adds an immutable authenticated no-candidate settlement fact. Older
    // inert installations have no such table and cannot clear from a terminal
    // label alone. This additive check permits safe composition with Gate 1.
    const [terminalSchema] = await database.query("SELECT to_regclass('public.external_alpha_work_terminal_settlement') IS NOT NULL AS present");
    if (terminalSchema?.present === true) {
      const terminal = await database.query(`SELECT a.id AS allowance_id,au.id AS authority_id
        FROM external_alpha_work_terminal_settlement t
        JOIN external_alpha_work_authority au ON au.id=t.authority_id
        JOIN external_alpha_allowance a ON a.id=au.allowance_id
        JOIN external_alpha_shared_binding b ON b.allowance_id=a.id
        WHERE a.owner_id=$1 AND a.policy_sha256=$2
        AND t.owner_id=a.owner_id AND t.policy_sha256=a.policy_sha256
        AND t.request_id=au.request_id AND t.authority_sha256=au.document_sha256
        AND t.work_id=au.work_id AND t.work_version=au.work_version AND t.work_generation=au.work_generation
        AND t.settlement_state='SETTLED' AND t.exposure_unknown=false
        AND t.cleanup_confirmed=true AND t.result_verdict='NONE'
        AND au.state IN('COMPLETED','CANCELLED') AND a.state<>'UNKNOWN'
        AND NOT EXISTS(SELECT 1 FROM external_alpha_operation o WHERE o.allowance_id=a.id AND o.state IN('DISPATCHED','UNKNOWN'))`, [policy.ownerId, digest(policy)]);
      for (const row of terminal)
        await this.settle(database, policy, row.allowance_id as string, "work:" + row.authority_id);
    }
  }
}
