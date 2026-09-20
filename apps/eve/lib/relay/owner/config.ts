import { z } from "zod";
import type { OwnerChannelTrust } from "./handoff.ts";
// Local transport/control tests do not qualify model execution or live Telegram.
export const OWNER_CHANNEL_RELEASE_QUALIFIED:boolean=false;
const mapping=z.object({relayAccountId:z.string().min(1),relayOwnerPrincipalId:z.string().min(1),relayAgentId:z.string().min(1),sourceIdentity:z.string().min(1),ownerId:z.string().min(1),agentId:z.string().min(1),enabled:z.boolean()}).strict();
export function ownerChannelConfiguration(env:NodeJS.ProcessEnv=process.env){
 const issues:string[]=[];let trust:OwnerChannelTrust|null=null;
 try{trust=z.object({environment:z.enum(["development","preview","production"]),audience:z.string().min(1),keys:z.record(z.string(),z.string().min(1)),mappings:z.array(mapping).min(1)}).strict().parse(JSON.parse(env.MYEVE_RELAY_OWNER_TRUST??""));}catch{issues.push("MYEVE_RELAY_OWNER_TRUST");}
 const enabled=OWNER_CHANNEL_RELEASE_QUALIFIED&&env.MYEVE_RELAY_OWNER_ENABLED==="true";
 return {enabled,trust,issues};
}
