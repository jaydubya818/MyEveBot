import { z } from "zod";
import type { OwnerChannelTrust } from "./handoff.ts";
import { qualificationEmailPin } from "./qualification-email.ts";
// Local transport/control tests do not qualify model execution or live Telegram.
export const OWNER_CHANNEL_RELEASE_QUALIFIED:boolean=false;
// Explicit, expiring local qualification only. The reserved .invalid database
// endpoint is serviced by the qualification harness against isolated PostgreSQL.
// It cannot address owner data or operate in a hosted Vercel deployment.
export function localOwnerQualification(env:NodeJS.ProcessEnv,trust:OwnerChannelTrust|null){
 const until=Number(env.MYEVE_OWNER_LOCAL_QUALIFICATION_UNTIL);
 if(env.VERCEL || env.VERCEL_URL || env.HOSTNAME!=="127.0.0.1" || env.MYEVE_OWNER_LOCAL_ORIGIN!=="http://127.0.0.1:3228" ||
   env.DATABASE_URL!=="postgresql://qualification:local@qualification.invalid/owner_qualification" ||
   !Number.isSafeInteger(until)||until<=Date.now()||until>Date.now()+3600000 ||
   trust?.environment!=="development"||trust.audience!=="myeve-local-qualification"||trust.mappings.length!==1)return false;
 const m=trust.mappings[0];
 // Exactly one of two pinned Relay identity sets. The harness set (direct signed
 // transport, recorded campaign Runs) uses the constant source. The live set uses
 // canonical Relay IDs and the Relay pairing binding, pinned exactly per session.
 const pinnedBinding=env.MYEVE_OWNER_LOCAL_SOURCE_IDENTITY;
 const harness=m.relayAccountId==="qualification-relay"&&m.relayOwnerPrincipalId==="qualification-principal"&&
  m.relayAgentId==="qualification-relay-agent"&&m.sourceIdentity==="qualification-source";
 const live=m.relayAccountId==="acct_qualificationrelay"&&m.relayOwnerPrincipalId==="prn_qualificationowner"&&
  m.relayAgentId==="agt_qualificationsofie"&&typeof pinnedBinding==="string"&&/^tgb_[0-9a-f]{32}$/.test(pinnedBinding)&&
  m.sourceIdentity===pinnedBinding;
 const caps=m.allowedCapabilities??[];
 const readOnly=caps.length===1&&caps[0]==="web.read";
 // The live set may add exactly one pinned, owner-authorized email (see qualification-email.ts).
 const withPinnedEmail=live&&caps.length===2&&caps[0]==="web.read"&&caps[1]==="tool.send_email"&&validEmailPin(env);
 return m.enabled&&m.ownerId==="qualification-owner"&&m.agentId==="qualification-agent"&&(harness||live)&&(readOnly||withPinnedEmail);
}
function validEmailPin(env:NodeJS.ProcessEnv){try{return qualificationEmailPin(env)!==null;}catch{return false;}}
const mapping=z.object({relayAccountId:z.string().min(1),relayOwnerPrincipalId:z.string().min(1),relayAgentId:z.string().min(1),sourceIdentity:z.string().min(1),ownerId:z.string().min(1),agentId:z.string().min(1),enabled:z.boolean(),allowedCapabilities:z.array(z.enum(["web.search","web.read","tool.send_email"])).optional()}).strict();
export function ownerChannelConfiguration(env:NodeJS.ProcessEnv=process.env){
 const issues:string[]=[];let trust:OwnerChannelTrust|null=null;
 try{trust=z.object({environment:z.enum(["development","preview","production"]),audience:z.string().min(1),keys:z.record(z.string(),z.string().min(1)),mappings:z.array(mapping).min(1)}).strict().parse(JSON.parse(env.MYEVE_RELAY_OWNER_TRUST??""));}catch{issues.push("MYEVE_RELAY_OWNER_TRUST");}
 const enabled=(OWNER_CHANNEL_RELEASE_QUALIFIED&&env.MYEVE_RELAY_OWNER_ENABLED==="true")||localOwnerQualification(env,trust);
 return {enabled,trust,issues};
}
