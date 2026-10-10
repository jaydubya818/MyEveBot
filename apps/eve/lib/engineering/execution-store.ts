import { admitCapabilityWork } from "../capability-control/admission.ts";
import { randomUUID } from "node:crypto";
import { WorkStore } from "./store.ts";
import { WorkError, type Work } from "./types.ts";
import { initialExecution, nowIso, type Execution } from "./execution.ts";
import type { WorkContract } from "./contract.ts";

/** SQL snapshots preserve each transition, including candidates and immutable Result versions. */
export class ExecutionStore {
  constructor(readonly workStore: WorkStore) {}
  private scope(id: string) { const p = this.workStore.principal; return [p.scopeId,p.scopeKind,id]; }
  async get(id: string): Promise<Execution | null> {
    await this.workStore.get(id);
    const [row] = await this.workStore.database.query(`SELECT state,reserved_usd,model_requests FROM engineering_execution WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3`, this.scope(id));
    return row ? {...row.state,reservedUsd:Number(row.reserved_usd),modelRequests:Number(row.model_requests)} : null;
  }
  async admit(work: Work, contract: WorkContract) {
    const state = initialExecution(contract, work.generation + 1);
    const capabilityId = contract.executor === 'factory-cloud' ? 'myfactory' : 'development-tools';
    const rows = await admitCapabilityWork(this.workStore, work, capabilityId, contract.coordinatingAgent,
      contract.budgetUsd, database => database.query(`WITH w AS (
      UPDATE engineering_work SET control='agent',version=version+1,generation=generation+1,updated_at=now()
      WHERE scope_id=$1 AND scope_kind=$2 AND id=$3 AND version=$4 AND lifecycle='active'
      AND NOT EXISTS(SELECT 1 FROM engineering_execution e WHERE e.scope_id=$1 AND e.scope_kind=$2 AND e.work_id=$3) RETURNING *
    ), e AS (
      INSERT INTO engineering_execution(scope_id,scope_kind,work_id,revision,state)
      SELECT scope_id,scope_kind,id,1,$5::jsonb FROM w RETURNING *
    ), h AS (
      INSERT INTO engineering_execution_history(scope_id,scope_kind,work_id,revision,kind,actor_id,state)
      SELECT scope_id,scope_kind,work_id,revision,'admitted',$6,state FROM e
    ), event AS (
      INSERT INTO engineering_work_events(id,scope_id,scope_kind,work_id,version,actor_id,kind)
      SELECT $7,scope_id,scope_kind,id,version,$6,'admitted' FROM w
    ) SELECT work_id FROM e`, [...this.scope(work.id),work.version,JSON.stringify(state),this.workStore.principal.actorId,randomUUID()]));
    if (!rows.length) throw new WorkError("admission_changed", "Work changed or has already been admitted. Reload its contract.");
    return state;
  }
  async claim(id: string): Promise<{ token: string; state: Execution } | null> {
    const token = randomUUID();
    const [row] = await this.workStore.database.query(`UPDATE engineering_execution SET lease_token=$4,lease_until=now()+interval '30 seconds'
      WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND (lease_until IS NULL OR lease_until<now()) RETURNING state,reserved_usd,model_requests`, [...this.scope(id),token]);
    return row ? { token, state: {...row.state,reservedUsd:Number(row.reserved_usd),modelRequests:Number(row.model_requests)} } : null;
  }
  async save(work: Work, state: Execution, kind: string, token?: string) {
    if (work.generation!==state.generation) throw new WorkError("writer_fenced","Work control changed; this writer is fenced.");
    const next = {...state,revision:state.revision+1,lastActivity:nowIso()};
    const rows = await this.workStore.database.query(`WITH e AS (
      UPDATE engineering_execution SET state=$5::jsonb,revision=revision+1,updated_at=now()
      WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND revision=$4
      AND (($8::uuid IS NULL AND (lease_until IS NULL OR lease_until<now())) OR (lease_token=$8 AND lease_until>now()))
      AND EXISTS(SELECT 1 FROM engineering_work w WHERE w.scope_id=$1 AND w.scope_kind=$2 AND w.id=$3 AND w.generation=$7)
      RETURNING *
    ), h AS (
      INSERT INTO engineering_execution_history(scope_id,scope_kind,work_id,revision,kind,actor_id,state)
      SELECT scope_id,scope_kind,work_id,revision,$6,$9,state FROM e
    ) SELECT work_id FROM e`, [...this.scope(work.id),state.revision,JSON.stringify(next),kind,work.generation,token??null,this.workStore.principal.actorId]);
    if (!rows.length) throw new WorkError("execution_changed", "Execution authority or state changed. Reconcile before continuing.");
    Object.assign(state,next);
    return state;
  }
  async release(id: string, token: string) {
    await this.workStore.database.query(`UPDATE engineering_execution SET lease_token=NULL,lease_until=NULL WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND lease_token=$4`, [...this.scope(id),token]);
  }
  async renew(id: string, token: string) {
    const rows=await this.workStore.database.query(`UPDATE engineering_execution SET lease_until=now()+interval '30 seconds'
      WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND lease_token=$4 AND lease_until>now() RETURNING work_id`,[...this.scope(id),token]);
    if (!rows.length) throw new WorkError("lease_lost","Worker ownership expired; reconcile before continuing.");
  }
  async refreshObservation(work:Work,state:Execution,token:string) {
    const rows=await this.workStore.database.query(`UPDATE engineering_execution SET state=jsonb_set(state,'{truth}',$6::jsonb),updated_at=now()
      WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND revision=$4 AND lease_token=$5 AND lease_until>now()
      AND EXISTS(SELECT 1 FROM engineering_work w WHERE w.scope_id=$1 AND w.scope_kind=$2 AND w.id=$3 AND w.generation=$7)
      RETURNING work_id`,[...this.scope(work.id),state.revision,token,JSON.stringify(state.truth),work.generation]);
    if(!rows.length)throw new WorkError("observation_fenced","Observation authority changed.");
  }
  async history(id: string) {
    await this.workStore.get(id);
    return this.workStore.database.query(`SELECT revision,kind,actor_id,created_at FROM engineering_execution_history WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 ORDER BY revision DESC LIMIT 200`, this.scope(id));
  }
  async approve(id: string, revision: number, candidate: string, boundedUpdates: boolean) {
    const work = await this.workStore.get(id), state = await this.get(id);
    if (!state || state.revision !== revision || state.phase !== "approval" || state.candidates.at(-1)?.sha !== candidate || work.generation !== state.generation || work.control !== "agent" || work.lifecycle!=="active" || work.criteriaVersion!==state.contract.criteriaVersion || Date.now()>=Date.parse(state.contract.deadline))
      throw new WorkError("approval_changed", "Approval no longer matches the current candidate and authority.");
    state.approval = { id: randomUUID(), candidate, actor: this.workStore.principal.actorId, generation: work.generation, boundedUpdates, at: nowIso() };
    state.phase = "publishing";
    state.interventions.push({id:state.approval.id,kind:"judgment",reason:"Approved exact draft PR candidate and selected update policy",at:nowIso()});
    return this.save(work,state,"publication_approved");
  }
  async decline(id: string, revision: number, candidate: string) {
    const work = await this.workStore.get(id), state = await this.get(id);
    if (!state || state.revision !== revision || state.phase !== "approval" || state.candidates.at(-1)?.sha !== candidate ||
      work.generation !== state.generation || work.control !== "agent" || work.lifecycle !== "active" ||
      work.criteriaVersion !== state.contract.criteriaVersion)
      throw new WorkError("decision_changed", "The candidate or Work changed. Reload before deciding.");
    state.phase = "stopped";
    state.approval = null;
    state.blockers = ["The owner declined publication of this candidate."];
    state.interventions.push({ id: randomUUID(), kind: "judgment", reason: "Declined exact draft PR candidate", at: nowIso() });
    return this.save(work, state, "publication_declined");
  }
}
