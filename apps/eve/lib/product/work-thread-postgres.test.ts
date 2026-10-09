import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Env, connection } from "../external-alpha/work-test-fixture.ts";
import { ExternalAlphaAllowance } from "../external-alpha/allowance.ts";
import { BetaIntegration } from "../beta-integration/runtime.ts";
import { readWorkThread } from "./work-thread.ts";

it.skipIf(!connection)("associates completed tool-created Work only through the exact owner, Agent, session and thread", async () => {
  const e = await Env.create();
  try {
    const work = await e.seedWork();
    const foreign = await e.seedWork({}, randomUUID());
    const unrelated = await e.seedWork();
    await e.pool.query("INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary) VALUES('agent-a',$1,'Sofie','sofie','Primary','Owner policy',true)", [e.owner]);
    await e.pool.query("INSERT INTO web_chat_threads(id,owner_id,title,updated_at) VALUES('thread-a',$1,'Private',1),('thread-b','foreign-owner','Foreign',1)", [e.owner]);
    await e.pool.query("INSERT INTO agent_runs(id,session_id,owner_id,agent_id,thread_id) VALUES('run-a','session-a',$1,'agent-a','thread-a')", [e.owner]);
    const allowance = await new ExternalAlphaAllowance(e.db, e.policy).admit({kind:"CHAT",bindingId:"thread-association",requestSha256:"a".repeat(64)});
    for (const [call, session, agent, state, id] of [
      ["valid", "session-a", "agent-a", "COMPLETED", work.id],
      ["duplicate", "session-a", "agent-a", "COMPLETED", work.id],
      ["foreign-work", "session-a", "agent-a", "COMPLETED", foreign.id],
      ["wrong-session", "other-session", "agent-a", "COMPLETED", unrelated.id],
      ["wrong-agent", "session-a", "other-agent", "COMPLETED", unrelated.id],
      ["pending", "session-a", "agent-a", "ACCEPTED", unrelated.id],
      ["unknown", "session-a", "agent-a", "UNKNOWN", unrelated.id],
    ]) await e.pool.query("INSERT INTO external_alpha_tool_effect(owner_id,session_id,call_id,allowance_id,agent_id,tool_name,input_sha256,state,result) VALUES($1,$2,$3,$4,$5,'engineering_work',$6,$7,$8)", [e.owner,session,call,allowance.id,agent,"b".repeat(64),state,{work:{id}}]);
    const beta = new BetaIntegration(e.pool, {repository:e.policy.repository,maxCostUsd:1.3,maxDurationSeconds:180});
    const result = await readWorkThread(beta,e.owner,"thread-a");
    expect(result.works).toHaveLength(1);
    expect(result.works[0].projection.workId).toBe(work.id);
    await expect(readWorkThread(beta,e.owner,"thread-b")).rejects.toMatchObject({status:404});
    await expect(readWorkThread(beta,"foreign-owner","thread-a")).rejects.toMatchObject({status:404});
  } finally { await e.close(); }
}, 60000);
