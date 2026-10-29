import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { digest } from "../engineering/contract.ts";
import { ExternalAlphaAllowance } from "./allowance.ts";
import { SharedAlphaAccounting } from "./shared-accounting.ts";
import { readAlphaChatUsage } from "./usage.ts";
import { connection, Env } from "./work-test-fixture.ts";

describe.skipIf(!connection)("chat-only authorization across isolated PostgreSQL databases", () => {
  const envs: Env[] = [];
  afterEach(async () => { await Promise.all(envs.splice(0).map(e => e.close())); }, 60000);
  async function make(active = true, narrow = true) {
    const central = await Env.create(false, {}, false); envs.push(central);
    for (const file of ["shared-accounting.sql", "shared-accounting-recovery.sql", "shared-accounting-zero-gap.sql"])
      await central.pool.query(await readFile(new URL(file, import.meta.url), "utf8"));
    const cohortId = randomUUID();
    const a = await Env.create(true, { cohortId }); envs.push(a);
    const b = await Env.create(true, { cohortId, slot: "2", repository: a.policy.repository.slice(0,-1)+"2" }); envs.push(b);
    await central.pool.query("INSERT INTO external_alpha_cohort(id) VALUES($1)", [cohortId]);
    for (const e of [a,b]) {
      const token = e.policy.slot.repeat(64);
      await central.pool.query("INSERT INTO external_alpha_cohort_member(cohort_id,slot,owner_id,policy_sha256,credential_sha256) VALUES($1,$2,$3,$4,encode(sha256(convert_to($5,'UTF8')),'hex'))", [cohortId,e.policy.slot,e.owner,digest(e.policy),token]);
      e.db.externalAlphaAccounting = new SharedAlphaAccounting(central.db,token);
      if (narrow) await e.pool.query("INSERT INTO external_alpha_chat_only(owner_id,policy_sha256) VALUES($1,$2)",[e.owner,digest(e.policy)]);
    }
    const upgrade = async () => central.pool.query(await readFile(new URL("shared-accounting-chat-only.sql",import.meta.url),"utf8"));
    if (narrow) await upgrade();
    if (active) await central.pool.query("UPDATE external_alpha_cohort SET activated_at=clock_timestamp()");
    const budget = (e: Env) => new ExternalAlphaAllowance(e.db,e.policy);
    const chat = (e: Env,id: string=randomUUID()) => budget(e).admit({kind:"CHAT",bindingId:id,requestSha256:digest(id)});
    const raw = (e: Env,over: Record<string,unknown>={}) => ({cohortId,ownerId:e.owner,slot:e.policy.slot,policySha256:digest(e.policy),credential:e.policy.slot.repeat(64),mode:"reserve",kind:"CHAT",id:randomUUID(),bindingSha256:digest(randomUUID()),requestSha256:digest("request"),...over});
    const call = async (p: unknown,client=central.pool) => (await client.query("SELECT external_alpha_cohort_call($1::jsonb) AS r",[JSON.stringify(p)])).rows[0].r;
    return {central,cohortId,a,b,budget,chat,raw,call,upgrade};
  }
  // Clock/history changes below are fixture-only on disposable localhost DBs.
  async function fixtureChange(e: Env,sql: string,params: unknown[]=[]) {
    const c=await e.pool.connect();
    try { await c.query("BEGIN"); await c.query("SET LOCAL session_replication_role=replica"); await c.query(sql,params); await c.query("COMMIT"); }
    catch(error) {await c.query("ROLLBACK");throw error;} finally {c.release();}
  }
  async function directInsert(e: Env,over: Record<string,unknown>={},client=e.pool) {
    const row={id:randomUUID(),owner:e.owner,sha:digest(e.policy),kind:"CHAT",day:Math.floor(Date.now()/86400000),amount:100000,ops:2,...over};
    return client.query("INSERT INTO external_alpha_allowance(id,owner_id,policy_sha256,kind,binding_id,request_sha256,day_index,ceiling_microusd,max_operations,deadline) VALUES($1::uuid,$2,$3,$4,$1::text,$3,$5,$6,$7,clock_timestamp()+interval '120 seconds')",[row.id,row.owner,row.sha,row.kind,row.day,row.amount,row.ops]);
  }
  it("reads exact owner quota in a read-only transaction, including central-only reservations, without exposing the other tester", async () => {
    const {central,a,b,chat,raw,call} = await make();
    await call(raw(a)); // Lost local acknowledgment: no app allowance exists.
    for(let i=0;i<7;i++) await chat(b);
    const before = (await central.pool.query("SELECT row_to_json(a) AS row FROM external_alpha_cohort_admission a ORDER BY id")).rows;
    const c = await central.pool.connect();
    try {
      await c.query("BEGIN READ ONLY");
      const status = await call(raw(a,{mode:"status"}),c);
      expect(status).toMatchObject({version:1,state:"active",dailyTurnsUsed:1,dailyReservedMicrousd:100000,trialReservedMicrousd:100000,quotaRemaining:9});
      expect(Object.keys(status).sort()).toEqual(["version","checkedAt","dayIndex","resetsAt","activatedAt","expiresAt","state","dailyTurnsUsed","dailyReservedMicrousd","trialReservedMicrousd","quotaRemaining","limits"].sort());
      expect(JSON.stringify(status)).not.toContain(b.owner);
      expect(status).not.toHaveProperty("cohortDayReservedMicrousd");
      await c.query("COMMIT");
    } finally { await c.query("ROLLBACK"); c.release(); }
    expect((await central.pool.query("SELECT row_to_json(a) AS row FROM external_alpha_cohort_admission a ORDER BY id")).rows).toEqual(before);
    expect(await a.count("external_alpha_allowance")).toBe(0);
    expect(await central.count("external_alpha_cohort_dispatch")).toBe(0);
    const usage = await readAlphaChatUsage(a.db,a.policy);
    expect(usage).toMatchObject({dailyTurnsUsed:1,quotaRemaining:9,measured:{dailyMicrousd:0,trialMicrousd:0,unsettledOperations:0}});
  });
  it("keeps quota charges distinct from multiple settled model operations and preserves UTC/trial history", async () => {
    const {central,a,chat,budget} = await make();
    const allowance = await chat(a);
    for (const [step,cost] of [["first:0",5000],["second:0",7000]] as const) {
      const op = await budget(a).reserve({allowanceId:allowance.id,stepKey:step,requestSha256:digest(step),microusd:10000});
      await budget(a).claimDispatch(op); await budget(a).settle(op,cost,{known:true});
    }
    expect(await readAlphaChatUsage(a.db,a.policy)).toMatchObject({dailyTurnsUsed:1,dailyReservedMicrousd:100000,quotaRemaining:9,measured:{dailyMicrousd:12000,trialMicrousd:12000}});
    await fixtureChange(central,"UPDATE external_alpha_cohort_admission SET day_index=day_index-1");
    await fixtureChange(a,"UPDATE external_alpha_allowance SET day_index=day_index-1");
    expect(await readAlphaChatUsage(a.db,a.policy)).toMatchObject({dailyTurnsUsed:0,dailyReservedMicrousd:0,trialReservedMicrousd:100000,quotaRemaining:10,measured:{dailyMicrousd:0,trialMicrousd:12000}});
  });
  it("reports pending/UNKNOWN exposure and inactive, revoked, expired state without mutating quota", async () => {
    const {central,a,b,chat,budget} = await make(false);
    expect((await readAlphaChatUsage(a.db,a.policy)).state).toBe("inactive");
    await central.pool.query("UPDATE external_alpha_cohort SET activated_at=clock_timestamp()");
    const allowance = await chat(a);
    const op = await budget(a).reserve({allowanceId:allowance.id,stepKey:"pending:0",requestSha256:digest("pending"),microusd:10000});
    await budget(a).claimDispatch(op);
    expect(await readAlphaChatUsage(a.db,a.policy)).toMatchObject({state:"paused",dailyTurnsUsed:1,quotaRemaining:9,measured:{dailyMicrousd:0,unsettledOperations:1}});
    await budget(a).unknown(op);
    expect(await readAlphaChatUsage(a.db,a.policy)).toMatchObject({state:"paused",localPaused:true,quotaRemaining:9});
    expect((await readAlphaChatUsage(b.db,b.policy)).state).toBe("paused");
    await fixtureChange(central,"UPDATE external_alpha_cohort SET activated_at=clock_timestamp()-interval '121 hours'");
    expect((await readAlphaChatUsage(a.db,a.policy)).state).toBe("expired");
    await central.pool.query("UPDATE external_alpha_cohort SET revoked_at=clock_timestamp()");
    expect((await readAlphaChatUsage(a.db,a.policy)).state).toBe("revoked");
    expect(await central.count("external_alpha_cohort_admission")).toBe(1);
  });
  it("requires exact credentials and local owner/policy narrowing for usage reads", async () => {
    const {a,raw,call} = await make();
    for (const over of [{ownerId:randomUUID()},{slot:"2"},{credential:"wrong"},{policySha256:"f".repeat(64)}])
      await expect(call(raw(a,{mode:"status",...over}))).rejects.toThrow("SHARED_DENIED");
    await expect(readAlphaChatUsage(a.db,{...a.policy,ownerId:randomUUID()})).rejects.toThrow("BINDING_REQUIRED");
    expect(await a.count("external_alpha_allowance")).toBe(0);
  });
  it("projects the effective local trial state and earlier expiry rather than cohort eligibility alone", async () => {
    const {central,a} = await make();
    await fixtureChange(a,"UPDATE external_alpha_policy SET created_at=clock_timestamp()-interval '122 hours',activated_at=clock_timestamp()-interval '1 hour'");
    const [local] = (await a.pool.query("SELECT activated_at+interval '120 hours' AS expiry FROM external_alpha_policy")).rows;
    expect((await readAlphaChatUsage(a.db,a.policy)).expiresAt).toBe(local.expiry.toISOString());
    await fixtureChange(a,"UPDATE external_alpha_policy SET activated_at=clock_timestamp()-interval '121 hours'");
    expect((await readAlphaChatUsage(a.db,a.policy)).state).toBe("expired");
    await fixtureChange(a,"UPDATE external_alpha_policy SET activated_at=NULL");
    expect(await readAlphaChatUsage(a.db,a.policy)).toMatchObject({state:"inactive",activatedAt:null,expiresAt:null});
    await a.pool.query("UPDATE external_alpha_policy SET revoked_at=clock_timestamp()");
    expect((await readAlphaChatUsage(a.db,a.policy)).state).toBe("revoked");
    expect((await central.pool.query("SELECT revoked_at FROM external_alpha_cohort")).rows[0].revoked_at).toBeNull();
    expect(await central.count("external_alpha_cohort_admission")).toBe(0);
  });
  it("stays inactive until operator activation, then admits both exact owners and no Work",async()=>{
    const {central,a,b,chat,budget}=await make(false);
    await expect(chat(a)).rejects.toThrow("SHARED_FENCED");
    expect(await central.count("external_alpha_cohort_admission")).toBe(0);
    await central.pool.query("UPDATE external_alpha_cohort SET activated_at=clock_timestamp()");
    for(const e of [a,b]) {
      await chat(e);
      await expect(budget(e).admit({kind:"WORK",bindingId:randomUUID(),requestSha256:digest("work")})).rejects.toThrow("CHAT_ONLY");
      await expect(directInsert(e,{kind:"WORK"})).rejects.toThrow("CHAT_ONLY_DENIED");
      expect(await e.count("external_alpha_work_authority")).toBe(0);
    }
    expect(await central.count("external_alpha_cohort_admission","kind='WORK'")).toBe(0);
  });
  it("serializes concurrent last-slot reservations, permanently charges full turns, and deduplicates exact retries",async()=>{
    const {central,a,b,chat}=await make();
    const first=await chat(a,"exact-retry");
    expect((await chat(a,"exact-retry")).id).toBe(first.id);
    const outcomes=await Promise.allSettled([...Array.from({length:14},()=>chat(a)),...Array.from({length:15},()=>chat(b))]);
    expect(outcomes.filter(r=>r.status==="fulfilled")).toHaveLength(19);
    for(const e of [a,b]) expect(await e.count("external_alpha_allowance")).toBe(10);
    const rows=(await central.pool.query("SELECT owner_id,count(*)::int AS n,sum(ceiling_microusd)::int AS charge FROM external_alpha_cohort_admission GROUP BY owner_id")).rows;
    expect(rows.every((r: any)=>r.n===10&&r.charge===1000000)).toBe(true);
    await expect(chat(a)).rejects.toThrow("SHARED_EXHAUSTED");
    await expect(directInsert(a)).rejects.toThrow("CHAT_ONLY_EXHAUSTED");
  },60000);
  it("keeps the $10 lifetime cap across a sixth UTC date, without recycling settled history",async()=>{
    const {central,cohortId,a,b,chat}=await make();
    const day=Math.floor(Date.now()/86400000);
    for(const e of [a,b]) {
      for(let i=0;i<49;i++) await central.pool.query("INSERT INTO external_alpha_cohort_admission(id,cohort_id,owner_id,policy_sha256,kind,binding_sha256,request_sha256,day_index,ceiling_microusd,deadline) VALUES($1,$2,$3,$4,'CHAT',$5,$5,$6,100000,clock_timestamp()-interval '1 second')",[randomUUID(),cohortId,e.owner,digest(e.policy),digest(randomUUID()),day-1-Math.floor(i/10)]);
      await chat(e);
    }
    expect(Number((await central.pool.query("SELECT sum(ceiling_microusd) AS n FROM external_alpha_cohort_admission")).rows[0].n)).toBe(10000000);
    await fixtureChange(central,"UPDATE external_alpha_cohort_admission SET day_index=day_index-1");
    for(const e of [a,b]) await expect(chat(e)).rejects.toThrow("SHARED_EXHAUSTED");
    expect(await central.count("external_alpha_cohort_admission")).toBe(100);
  },60000);
  it("independently caps local lifetime and rejects forged owner/day/amount and removal of narrowing",async()=>{
    const {a}=await make();
    for(const over of [{owner:randomUUID()},{sha:"a".repeat(64)},{day:0},{amount:1},{ops:5}])
      await expect(directInsert(a,over)).rejects.toThrow("CHAT_ONLY_DENIED");
    for(let day=0;day<5;day++) {
      for(let i=0;i<10;i++) await directInsert(a);
      await fixtureChange(a,"UPDATE external_alpha_allowance SET day_index=day_index-1");
    }
    await expect(directInsert(a)).rejects.toThrow("CHAT_ONLY_EXHAUSTED");
    for(const sql of ["DELETE FROM external_alpha_chat_only","TRUNCATE external_alpha_chat_only","UPDATE external_alpha_chat_only SET policy_sha256=repeat('a',64)"])
      await expect(a.pool.query(sql)).rejects.toThrow("CHAT_ONLY_IMMUTABLE");
    expect(await a.count("external_alpha_allowance")).toBe(50);
  },60000);
  it("rejects stale REPEATABLE READ snapshots at both admission boundaries",async()=>{
    const {central,a,chat,raw,call}=await make();
    for(const e of [central,a]) {
      const client=await e.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        await client.query("SELECT count(*) FROM external_alpha_allowance");
        await chat(a);
        await expect(e===central?call(raw(a),client):directInsert(a,{},client)).rejects.toThrow("CHAT_ONLY_ISOLATION");
      } finally {await client.query("ROLLBACK");client.release();}
    }
    expect(await central.count("external_alpha_cohort_admission")).toBe(2);
  });
  it("denies altered membership, changed-binding replay and unsupported kinds before charging",async()=>{
    const {central,a,raw,call}=await make();
    const request=raw(a);
    const receipt=await call(request);
    expect((await call(request)).id).toBe(receipt.id);
    await expect(call({...request,requestSha256:digest("changed")})).rejects.toThrow("BINDING_CHANGED");
    for(const over of [{ownerId:randomUUID()},{slot:"2"},{credential:"wrong"},{policySha256:"a".repeat(64)}])
      await expect(call(raw(a,over))).rejects.toThrow("SHARED_DENIED");
    await expect(call(raw(a,{kind:"WORK"}))).rejects.toThrow("CHAT_ONLY");
    expect(await central.count("external_alpha_cohort_admission")).toBe(1);
  });
  it("retains zero-gap UNKNOWN fencing and permits known settlement after revocation without refund",async()=>{
    const {central,a,b,budget,chat}=await make();
    const allowance=await chat(a);
    const op=await budget(a).reserve({allowanceId:allowance.id,stepKey:"turn:0",requestSha256:digest("model"),microusd:80000});
    await budget(a).claimDispatch(op);
    await expect(chat(b)).rejects.toThrow("SHARED_FENCED");
    await central.pool.query("UPDATE external_alpha_cohort SET revoked_at=clock_timestamp()");
    await budget(a).settle(op,5000,{text:"known usage"});
    await expect(budget(a).assertActive(allowance.id)).rejects.toThrow("SHARED_FENCED");
    expect((await central.pool.query("SELECT state FROM external_alpha_cohort_dispatch")).rows).toEqual([{state:"SETTLED"}]);
    expect(await central.count("external_alpha_cohort_admission")).toBe(1);
    await expect(chat(b)).rejects.toThrow("SHARED_FENCED");
  });
  it("fences permanently on UNKNOWN and rejects expired authority",async()=>{
    const {central,a,b,chat,budget}=await make();
    const allowance=await chat(a);
    const op=await budget(a).reserve({allowanceId:allowance.id,stepKey:"turn:0",requestSha256:digest("model"),microusd:80000});
    await budget(a).claimDispatch(op);
    await budget(a).unknown(op);
    await expect(chat(b)).rejects.toThrow("SHARED_FENCED");
    await expect(budget(a).settle(op,1,{})).rejects.toThrow();
    await fixtureChange(central,"UPDATE external_alpha_cohort SET activated_at=clock_timestamp()-interval '121 hours'");
    await expect(chat(a)).rejects.toThrow("SHARED_FENCED");
    expect((await central.pool.query("SELECT state FROM external_alpha_cohort_dispatch")).rows).toEqual([{state:"UNKNOWN"}]);
  });
  it("cannot replay or dispatch retained pre-upgrade Work, while retaining authenticated cleanup",async()=>{
    const {central,a,raw,call,upgrade}=await make(true,false);
    const request=raw(a,{kind:"WORK"});
    const work=await call(request);
    const allowanceId=randomUUID(),operationSha256=digest("old-work");
    await call(raw(a,{mode:"bind",id:work.id,allowanceId}));
    await call(raw(a,{mode:"dispatch",id:work.id,allowanceId,operationSha256}));
    const before=(await central.pool.query("SELECT * FROM external_alpha_cohort_admission")).rows;
    await upgrade();
    await expect(call(request)).rejects.toThrow("CHAT_ONLY");
    for(const mode of ["bind","assert","dispatch","running_work"])
      await expect(call(raw(a,{mode,id:work.id,allowanceId,operationSha256}))).rejects.toThrow(/CHAT_ONLY|SHARED_DENIED/);
    await call(raw(a,{mode:"hold_work",id:work.id,allowanceId,operationSha256}));
    await call(raw(a,{mode:"settle",id:work.id,allowanceId,operationSha256}));
    expect((await central.pool.query("SELECT * FROM external_alpha_cohort_admission")).rows).toEqual(before);
    expect((await central.pool.query("SELECT state FROM external_alpha_cohort_dispatch")).rows).toEqual([{state:"SETTLED"}]);
  });
});
