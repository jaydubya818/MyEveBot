import {z} from "zod";
import {capabilitySchema} from "./contracts.ts";
const address=z.string().max(520).regex(/^relay:\/\/[^/?#\s]+\/[^/?#\s]+$/);
const advertised=z.object({name:z.string().min(1).max(100),version:z.string().min(1).max(30)});
const peer=z.object({address,name:z.string().max(100),description:z.string().max(2000),
  topics:z.array(z.string().max(100)).max(30),capabilities:z.array(advertised).max(6),
  verification:z.literal("OWNER_REGISTERED"),views:z.array(z.object({id:z.string().max(255),name:z.string().max(200),description:z.string().max(2000),topics:z.array(z.string().max(100)).max(30),version:z.number().int().nonnegative()})).max(50)});
const discovery=z.object({agents:z.array(peer).max(50),next:z.string().max(255).nullable().optional()});
/** Discovery is informational: exact local + Relay + recipient authority is rechecked on every effect. */
export function peerDiscovery(value:unknown,relayOrigin:string) {
  const parsed=discovery.parse(value);
  const addresses=new Set<string>();
  const peers=parsed.agents.map(agent=>{
    if(addresses.has(agent.address))throw new Error("Ambiguous peer identity in discovery.");
    addresses.add(agent.address);
    const [ownerId,agentId]=agent.address.slice(8).split("/");
    const supported=agent.capabilities.filter(cap=>cap.version==="1.0"&&capabilitySchema.safeParse(cap.name).success);
    const names=new Set(supported.map(cap=>cap.name));
    const requestCapabilities=[...(names.has("message.receive")?["message.send"]:[]),...(names.has("knowledge.query")?["knowledge.query"]:[]),...(names.has("work.request")?["work.request"]:[]),...(names.has("artifact.receive")?["artifact.share"]:[])];
    return {address:agent.address,agentId,ownerId,name:agent.name,capabilities:supported,requestCapabilities,
      unsupportedCapabilities:agent.capabilities.filter(cap=>!supported.includes(cap)),
      provenance:{source:"Relay owner registration",relayOrigin,verification:agent.verification},
      authority:"NOT_GRANTED",executionRecheckRequired:true};
  });
  return {...parsed,peers,discoveryGrantsAuthority:false};
}
