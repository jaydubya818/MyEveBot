import type { ExecutionDatabase } from "../execution-types.ts";
import { WorkStore } from "../engineering/store.ts";
import { readExternalAlphaWork } from "./work-readback.ts";
import type { gateway } from "ai";
type Options=Parameters<ReturnType<typeof gateway>["doGenerate"]>[0];

/** Read-only replies from canonical custody. Never a fallback for arbitrary
 * model errors, never a provider/tool call, and never transcript-based authority. */
export async function canonicalConversationReply(database:ExecutionDatabase,input:{ownerId:string;agentId:string;sessionId:string;threadId?:unknown;turnId:string},prompt:Options["prompt"]):Promise<string|null>{
 const last=prompt.at(-1);
 if(last?.role==='tool') {
  const calls=last.content.flatMap(part=>part.type==='tool-result'&&part.toolName==='engineering_factory'?[part.toolCallId]:[]);
  if(calls.length!==1)return null;
  const [effect]=await database.query(`SELECT au.state FROM external_alpha_tool_effect e
    JOIN external_alpha_allowance a ON a.id=e.allowance_id AND a.owner_id=e.owner_id
    JOIN external_alpha_work_authority au ON au.owner_id=e.owner_id AND au.request_id::text=e.result->'receipt'->>'requestId'
    WHERE e.owner_id=$1 AND e.agent_id=$2 AND e.session_id=$3 AND e.call_id=$4 AND a.binding_id=$5
      AND e.tool_name='engineering_factory' AND e.state='COMPLETED' AND e.result->'receipt'->>'state'='STARTED'`,
    [input.ownerId,input.agentId,input.sessionId,calls[0],input.sessionId+':'+input.turnId]);
  if(effect && ['CONSUMED','COMPLETED'].includes(String(effect.state)))return 'Your Work request is acknowledged. Open Work to follow its saved progress.';
  return null;
 }
 const user=prompt.findLast(message=>message.role==='user');
 if(!user || user.content.some(part=>part.type!=='text') || !/^\s*what did you change\?\s*$/i.test(user.content.map(part=>part.type==='text'?part.text:'').join('\n')) || typeof input.threadId!=='string')return null;
 const works=await database.query(`WITH associated AS (
   SELECT w.id FROM external_alpha_tool_effect e JOIN agent_runs r ON r.owner_id=e.owner_id AND r.agent_id=e.agent_id AND r.session_id=e.session_id
   JOIN web_chat_threads t ON t.owner_id=e.owner_id AND t.id=r.thread_id
   JOIN engineering_work w ON w.scope_id=e.owner_id AND w.scope_kind='personal' AND w.id::text=e.result->'work'->>'id'
   WHERE e.owner_id=$1 AND e.agent_id=$2 AND e.session_id=$3 AND r.thread_id=$4 AND e.tool_name='engineering_work' AND e.state='COMPLETED'
   UNION
   SELECT w.id FROM context_assemblies c JOIN agent_runs r ON r.id=c.agent_run_id AND r.owner_id=c.owner_id AND r.agent_id=c.agent_id AND r.session_id=c.session_id AND r.thread_id=c.thread_id
   JOIN web_chat_threads t ON t.owner_id=c.owner_id AND t.id=c.thread_id
   JOIN engineering_work w ON w.scope_id=c.owner_id AND w.scope_kind='personal' AND c.source_refs @> jsonb_build_array('engineering-work:'||w.id::text)
   WHERE c.owner_id=$1 AND c.agent_id=$2 AND c.session_id=$3 AND c.thread_id=$4
 ) SELECT id FROM associated LIMIT 2`,[input.ownerId,input.agentId,input.sessionId,input.threadId]);
 if(works.length!==1)return null;
 const store=new WorkStore({scopeId:input.ownerId,scopeKind:'personal',actorId:input.ownerId},database),work=await store.get(String(works[0].id));
 const readback=await readExternalAlphaWork(store,work),result=readback?.result;
 if(!result)return 'No canonical Result is retained for this Work yet. Open Work to check its current progress.';
 const files=result.proof.artifactRefs.filter(ref=>ref.startsWith('changed-source:')).map(ref=>ref.slice('changed-source:'.length));
 const checks=result.proof.evidence.filter(e=>e.state==='PASS'&&e.resultRevision===result.candidateSha).length;
 return [`Work objective: ${work.objective}`,`The retained candidate changed: ${files.join(', ')||'see the retained patch'}.`,
  `Independent verification: ${result.verdict}; ${checks} of ${result.proof.evidence.length} recorded checks passed.`,
  readback?.acceptance ? 'You accepted this verified private Result. This Work is completed.' : 'Owner acceptance is not recorded. This Work is not completed.',
  `The original Proof remains ${result.proof.outcome} as historical evidence. Nothing was published.`,
  `[View Result and Proof](/work?kind=work&id=${work.id})`].join('\n\n');
}
