import { createHmac,timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "../../../agent/lib/receipts-db.ts";
import type { ExecutionDatabase } from "../../execution-types.ts";
import { ownerChannelConfiguration } from "./config.ts";

export const OWNER_RUNTIME_HEADER="x-myeve-owner-run";
const claimSchema=z.object({ownerId:z.string().min(1),agentId:z.string().min(1),runId:z.string().min(1),dispatchId:z.string().uuid(),expiresAt:z.number().int(),purpose:z.enum(["execute","observe","cancel"]).default("execute")}).strict();
export type OwnerRuntimeClaim=z.infer<typeof claimSchema>;
function runtimeKey(){const key=process.env.MYEVE_SESSION_SECRET?.trim();if(!key||key.length<32)throw new Error("Owner runtime authentication unavailable.");return key;}
export function signOwnerRuntime(claim:z.input<typeof claimSchema>,key=runtimeKey()){
 const payload=Buffer.from(JSON.stringify(claimSchema.parse(claim))).toString("base64url");
 return `${payload}.${createHmac("sha256",key).update(`owner-channel-runtime:${payload}`).digest("base64url")}`;
}
export function verifyOwnerRuntime(token:string,key=runtimeKey()):OwnerRuntimeClaim{
 if(token.length>2048)throw new Error("Invalid owner runtime claim.");
 const [payload,signature,...extra]=token.split(".");const expected=createHmac("sha256",key).update(`owner-channel-runtime:${payload}`).digest();const actual=Buffer.from(signature??"","base64url");
 if(extra.length||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error("Invalid owner runtime claim.");
 const claim=claimSchema.parse(JSON.parse(Buffer.from(payload,"base64url").toString("utf8")));
 if(claim.expiresAt<=Date.now()||claim.expiresAt>Date.now()+65000)throw new Error("Expired owner runtime claim.");return claim;
}
export function ownerRuntimeFromAuth(auth:{current?:{attributes?:Record<string,unknown>}|null;initiator?:{attributes?:Record<string,unknown>}|null}):OwnerRuntimeClaim|null{
 const a=auth.initiator?.attributes?.ownerChannelRun?auth.initiator.attributes:auth.current?.attributes;
 if(!a?.ownerChannelRun)return null;
 return claimSchema.parse({ownerId:a.ownerChannelOwner,agentId:a.myeveAgentId,runId:a.ownerChannelRun,dispatchId:a.ownerChannelDispatch,expiresAt:Number(a.ownerChannelExpiry),purpose:a.ownerChannelPurpose??"execute"});
}
export async function resolveOwnerRuntime(claim:OwnerRuntimeClaim,database:ExecutionDatabase=db() as ExecutionDatabase,configuration=ownerChannelConfiguration()){
 if(!configuration.enabled||!configuration.trust||claim.expiresAt<=Date.now())throw new Error("Owner runtime disabled or expired.");
 const [row]=await database.query(`SELECT w.*,r.status FROM owner_channel_requests w
 JOIN task_runs r ON r.owner_id=w.owner_id AND r.id=w.run_id
 JOIN agents a ON a.owner_id=w.owner_id AND a.id=w.agent_id
 WHERE w.owner_id=$1 AND w.run_id=$2 AND w.agent_id=$3 AND w.dispatch_id=$4
 AND ($5='cancel' OR (w.revoked_at IS NULL AND w.expires_at>now() AND a.status='active'))
 AND ($5<>'execute' OR (r.status='running' AND r.deadline_at>now() AND r.model_steps<r.max_model_steps
 AND r.estimated_cost_usd<r.max_estimated_cost_usd AND w.tokens_used<12000 AND NOT w.usage_unknown))`,[claim.ownerId,claim.runId,claim.agentId,claim.dispatchId,claim.purpose]);
 if(!row)throw new Error("Owner runtime binding unavailable.");
 const request=row.request as {ownerPrincipalId:string;agentId:string};
 const mappings=configuration.trust.mappings.filter(m=>m.enabled&&m.ownerId===claim.ownerId&&m.agentId===claim.agentId&&m.sourceIdentity===row.source_identity&&m.relayAccountId===row.relay_account_id&&m.relayOwnerPrincipalId===request.ownerPrincipalId&&m.relayAgentId===request.agentId);
 if(claim.purpose!=="cancel"&&mappings.length!==1)throw new Error("Owner channel mapping revoked.");return {...row,channelCapabilities:mappings[0]?.allowedCapabilities??["web.search","web.read"]} as Record<string,unknown>&{channelCapabilities:string[];session_id?:unknown};
}
/** Bind at authenticated turn admission, before Context Assembly or any tool.
 * A second Eve session cannot claim the same canonical Run after a lost response.
 */
export async function bindOwnerRuntime(claim:OwnerRuntimeClaim,sessionId:string,turnId:string,database:ExecutionDatabase=db() as ExecutionDatabase,configuration=ownerChannelConfiguration()){
 if(claim.purpose!=="execute"||!turnId)throw new Error("Execution claim required.");
 await resolveOwnerRuntime(claim,database,configuration);
 const [row]=await database.query(`WITH bound AS (
 UPDATE owner_channel_requests SET session_id=$5,turn_id=$6 WHERE owner_id=$1 AND run_id=$2 AND agent_id=$3 AND dispatch_id=$4
 AND revoked_at IS NULL AND (session_id IS NULL OR session_id=$5) AND (turn_id IS NULL OR turn_id=$6) RETURNING run_id
 ) INSERT INTO task_run_sessions(task_id,session_id,role) SELECT run_id,$5,'orchestrator' FROM bound
 ON CONFLICT(session_id) DO UPDATE SET session_id=EXCLUDED.session_id WHERE task_run_sessions.task_id=EXCLUDED.task_id RETURNING task_id`,[claim.ownerId,claim.runId,claim.agentId,claim.dispatchId,sessionId,turnId]);
 if(row?.task_id!==claim.runId)throw new Error("Owner runtime session already bound.");
}

/** Narrow the Eve channel credential to one transport operation and session. */
export function assertOwnerRuntimeRoute(request:Request,claim:OwnerRuntimeClaim,binding:{session_id?:unknown}){
 const path=new URL(request.url).pathname;
 const session=typeof binding.session_id==='string'?encodeURIComponent(binding.session_id):null;
 const stream=request.method==='GET'&&session&&path===`/eve/v1/session/${session}/stream`;
 const cancel=request.method==='POST'&&session&&path===`/eve/v1/session/${session}/cancel`;
 const start=request.method==='POST'&&path==='/eve/v1/session'&&!session;
 if(claim.purpose==='cancel'?cancel:claim.purpose==='observe'?stream:(stream||start))return;
 throw new Error('Owner runtime route is outside the admitted Run.');
}
