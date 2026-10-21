import {expect,it,vi} from "vitest";
import {Env,connection} from "../../lib/external-alpha/work-test-fixture.ts";
import type {AgentView} from "../../lib/agents.ts";
const runtime=vi.hoisted(()=>({database:null as any}));
vi.mock("./receipts-db.ts",()=>({db:()=>runtime.database}));
import {bindExecutorRun} from "./session-settings.ts";

it.skipIf(!connection)("first-message binding creates a missing thread and rejects conflicting owner, Agent or Role",async()=>{
 const e=await Env.create();runtime.database=e.db;
 try{
  await e.pool.query("INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary) VALUES('agent-a',$1,'Sofie','sofie','Primary','Owner policy',true),('agent-b',$1,'Other','other','Other','Other policy',false)",[e.owner]);
  const agent={id:"agent-a",isPrimary:true} as AgentView;
  // No client metadata write is required before the first authenticated turn.
  await bindExecutorRun("session-a","turn-a",e.owner,agent,"fresh-thread");
  await bindExecutorRun("session-a","turn-a",e.owner,agent,"fresh-thread");
  expect((await e.pool.query("SELECT owner_id,agent_id FROM web_chat_threads WHERE id='fresh-thread'")).rows).toEqual([{owner_id:e.owner,agent_id:"agent-a"}]);
  expect((await e.pool.query("SELECT count(*)::int AS n FROM agent_runs WHERE session_id='session-a'")).rows[0].n).toBe(1);
  await e.pool.query("INSERT INTO web_chat_threads(id,owner_id,title,updated_at,agent_id,role_id) VALUES('foreign','foreign-owner','Foreign',1,NULL,NULL),('other-agent',$1,'Other',1,'agent-b',NULL),('role-thread',$1,'Role',1,NULL,'test-role')",[e.owner]);
  for(const thread of ["foreign","other-agent","role-thread"])
   await expect(bindExecutorRun("rejected-"+thread,"turn-a",e.owner,agent,thread)).rejects.toThrow(/owner|binding/);
  const retained=await e.pool.query("SELECT id,owner_id,agent_id,role_id FROM web_chat_threads WHERE id<>'fresh-thread' ORDER BY id");
  expect(retained.rows).toEqual([
   {id:"foreign",owner_id:"foreign-owner",agent_id:null,role_id:null},
   {id:"other-agent",owner_id:e.owner,agent_id:"agent-b",role_id:null},
   {id:"role-thread",owner_id:e.owner,agent_id:null,role_id:"test-role"},
  ]);
  expect((await e.pool.query("SELECT count(*)::int AS n FROM agent_runs WHERE session_id LIKE 'rejected-%'")).rows[0].n).toBe(0);
 }finally{runtime.database=null;await e.close();}
},60000);
