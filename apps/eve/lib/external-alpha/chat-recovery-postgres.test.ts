import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Env, connection, files } from "./work-test-fixture.ts";
import { ExternalAlphaAllowance } from "./allowance.ts";
import { digest } from "../engineering/contract.ts";

describe.skipIf(!connection)("chat no-send recovery (real PostgreSQL)", () => {
  const envs: Env[] = [];
  afterEach(async () => { await Promise.all(envs.splice(0).map(e => e.close())); }, 60000);
  async function fixture() {
    const e = await Env.create(); envs.push(e);
    const budget = new ExternalAlphaAllowance(e.db, e.policy), shared = e.db.externalAlphaAccounting!;
    const allowance = await budget.admit({kind:"CHAT",bindingId:"conversation:turn",requestSha256:digest("turn")});
    const input = {allowanceId:allowance.id,stepKey:"turn:0",requestSha256:digest("request"),microusd:20000};
    return {e,budget,shared,allowance,input};
  }
  it("records blocked acknowledgment as unsent, preserving Work lease and allowance charge", async () => {
    const {e,budget,shared,allowance,input} = await fixture();
    const au = await e.svc.issue(await e.seedWork(),files);
    await shared.dispatch(e.db,e.policy,au.allowanceId,"work:"+au.id);
    await expect(budget.reserve(input)).rejects.toThrow("SHARED_FENCED");
    const {rows:[op]} = await e.pool.query("SELECT * FROM external_alpha_operation WHERE allowance_id=$1",[allowance.id]);
    expect(op).toMatchObject({state:"NOT_DISPATCHED",spent_microusd:"0",reserved_microusd:"20000",result:null});
    await expect(budget.claimDispatch(op)).rejects.toThrow("NO_REDISPATCH");
    expect((await e.pool.query("SELECT state FROM external_alpha_cohort_dispatch WHERE operation_sha256=$1",[digest("work:"+au.id)])).rows[0].state).toBe("DISPATCHED");
    await shared.reconcile(e.db,e.policy); await shared.reconcile(e.db,e.policy);
    await shared.settle(e.db,e.policy,au.allowanceId,"work:"+au.id);
    await expect(budget.admit({kind:"CHAT",bindingId:"conversation:next",requestSha256:digest("next")})).resolves.toBeTruthy();
    expect((await e.pool.query("SELECT ceiling_microusd FROM external_alpha_allowance WHERE id=$1",[allowance.id])).rows[0].ceiling_microusd).toBe("100000");
  });
  it("repairs a lost shared grant acknowledgment and rejects its late duplicate", async () => {
    const {e,budget,shared,input} = await fixture();
    const original=shared.dispatch.bind(shared);
    shared.dispatch=async (...args)=>{await original(...args);throw Error("lost acknowledgment");};
    await expect(budget.reserve(input)).rejects.toThrow("lost acknowledgment");
    await shared.reconcile(e.db,e.policy);
    await expect(original(e.db,e.policy,input.allowanceId,"sofie:"+input.stepKey)).rejects.toThrow("NOT_DISPATCHED");
    expect((await e.pool.query("SELECT state FROM external_alpha_operation")).rows[0].state).toBe("NOT_DISPATCHED");
  });
  it("restart cancels only aged preparations, including a lost cancellation acknowledgment", async () => {
    const {e,budget,shared,input} = await fixture();
    const op=await budget.reserve(input);
    await e.pool.query("UPDATE external_alpha_operation SET created_at=clock_timestamp()-interval '61 seconds' WHERE id=$1",[op.id]);
    const cancel=shared.cancelUnsent.bind(shared); shared.cancelUnsent=async()=>{throw Error("offline");};
    await expect(shared.reconcile(e.db,e.policy)).rejects.toThrow("offline");
    expect((await e.pool.query("SELECT state FROM external_alpha_operation")).rows[0].state).toBe("NOT_DISPATCHED");
    shared.cancelUnsent=cancel;
    await shared.reconcile(e.db,e.policy);await shared.reconcile(e.db,e.policy);
    await expect(budget.claimDispatch(op)).rejects.toThrow("NO_REDISPATCH");
    await expect(shared.dispatch(e.db,e.policy,input.allowanceId,"sofie:"+input.stepKey)).rejects.toThrow("NOT_DISPATCHED");
  });
  it("concurrent cancellation and provider claims have one winner; UNKNOWN stays reserved", async () => {
    const {e,budget,shared,input}=await fixture();const op=await budget.reserve(input);
    const claims=await Promise.allSettled([budget.claimDispatch(op),budget.claimDispatch(op),budget.cancelPrepared(op)]);
    const state=(await e.pool.query("SELECT state FROM external_alpha_operation")).rows[0].state;
    expect(claims.slice(0,2).filter(x=>x.status==='fulfilled')).toHaveLength(state==='DISPATCHED'?1:0);
    if(state==='DISPATCHED') {
      await budget.unknown(op); await shared.reconcile(e.db,e.policy);
      await budget.cancelPrepared(op);
      await expect(budget.settle(op,0,{})).rejects.toThrow();
      expect((await e.pool.query("SELECT state,reserved_microusd,spent_microusd FROM external_alpha_operation")).rows[0]).toMatchObject({state:"UNKNOWN",reserved_microusd:"20000",spent_microusd:null});
    } else expect(state).toBe("NOT_DISPATCHED");
  });
  it("never cancels a legacy/provider-started operation or accepts wrong owner/hash/allowance", async () => {
    const {e,budget,shared,input}=await fixture();const op=await budget.reserve(input);await budget.claimDispatch(op);
    await e.pool.query("UPDATE external_alpha_operation SET created_at=clock_timestamp()-interval '61 seconds' WHERE id=$1",[op.id]);
    await shared.reconcile(e.db,e.policy);await budget.cancelPrepared(op);
    expect((await e.pool.query("SELECT state FROM external_alpha_operation")).rows[0].state).toBe("DISPATCHED");
    await expect(budget.cancelPrepared({...op,request_sha256:digest("changed")})).rejects.toThrow("BINDING");
    await expect(budget.cancelPrepared({...op,allowance_id:randomUUID()})).rejects.toThrow();
    await expect(new ExternalAlphaAllowance(e.db,{...e.policy,ownerId:randomUUID()}).cancelPrepared(op)).rejects.toThrow("BINDING");
    await expect(budget.reserve(input)).rejects.toThrow();
  });
  it("revocation can cancel unsent preparation but cannot authorize a provider claim or refund",async()=>{
    const {e,budget,shared,input}=await fixture();const op=await budget.reserve(input);
    await e.pool.query("UPDATE external_alpha_policy SET revoked_at=clock_timestamp()");
    await expect(budget.claimDispatch(op)).rejects.toThrow("REVOKED");
    await budget.cancelPrepared(op);await shared.reconcile(e.db,e.policy);
    expect((await e.pool.query("SELECT state FROM external_alpha_operation")).rows[0].state).toBe("NOT_DISPATCHED");
    expect((await e.pool.query("SELECT ceiling_microusd FROM external_alpha_allowance")).rows[0].ceiling_microusd).toBe("100000");
  });
  it('cancels only the canonical unsent Sofie step inside a Work allowance',async()=>{
    const {e,budget,shared}=await fixture();const au=await e.svc.issue(await e.seedWork(),files);
    const op=await budget.reserve({allowanceId:au.allowanceId,stepKey:'work-turn:0',requestSha256:digest('work-chat'),microusd:10000});
    await budget.cancelPrepared({...op,step_key:'forged:9'});
    expect((await e.pool.query('SELECT operation_sha256,state FROM external_alpha_cohort_dispatch')).rows).toEqual([{operation_sha256:digest('sofie:work-turn:0'),state:'NOT_DISPATCHED'}]);
    await shared.reconcile(e.db,e.policy);
    await shared.dispatch(e.db,e.policy,au.allowanceId,'work:'+au.id);
    await expect(shared.cancelUnsent(e.db,e.policy,au.allowanceId,'work:'+au.id)).rejects.toThrow('NO_SEND_FACT');
    expect((await e.pool.query('SELECT state FROM external_alpha_cohort_dispatch WHERE operation_sha256=$1',[digest('work:'+au.id)])).rows[0].state).toBe('DISPATCHED');
  });
});
