import {z} from 'zod';
import type {AttentionView} from '../universal-inbox/contracts.ts';
import {peerMessageDraft} from '../relay/message-draft.ts';
import {envelopeSchema,digest,type Envelope} from '../relay/transport.ts';
import {projectPeerMessageResult} from '../relay/message-result.ts';
const id=z.string().min(1).max(200);
const link=z.object({kind:z.enum(['work','result','artifact']),id,revision:id,agentId:id}).strict();
export const groupSchema=z.object({id,ownerId:id,name:z.string().trim().min(1).max(120),objective:z.string().trim().min(1).max(2000),version:z.number().int().positive(),
 members:z.array(z.object({agentId:id,role:z.enum(['coordinator','member','reviewer'])}).strict()).min(2).max(12),
 links:z.array(link).max(100),handoffs:z.array(z.object({requestId:id,from:id,to:id,conversationId:id}).strict()).max(100),
 attentionId:id.nullable(),
}).strict().superRefine((g,ctx)=>{if(new Set(g.members.map(m=>m.agentId)).size!==g.members.length||g.members.filter(m=>m.role==='coordinator').length!==1)ctx.addIssue({code:'custom',message:'Distinct members and exactly one coordinator required.'});});
export type AgentGroup=z.infer<typeof groupSchema>;
export type GroupLink=z.infer<typeof link>;
export interface GroupRepository {
 read(owner:string,id:string):Promise<AgentGroup|null>;
 save(group:AgentGroup,expectedVersion:number|null,event:string):Promise<void>;
}
/** Trusted server adapters only. A browser/model cannot provide these receipts.
 * References stay in canonical systems and are reauthorized on every read. */
export interface GroupSources {
 agent(owner:string,id:string):Promise<{active:boolean;relayAddress:string|null}>;
 canRead(owner:string,agentId:string,reference:GroupLink):Promise<boolean>;
 attention(owner:string,id:string):Promise<Pick<AttentionView,'id'|'ownerId'|'workId'|'needsYou'>|null>;
 relay(owner:string,requestId:string):Promise<{envelope:Envelope;response:unknown}>;
}
const conversation=(g:AgentGroup)=>`group:${digest([g.ownerId,g.id,g.version])}`;
export class Groups {
 constructor(readonly repository:GroupRepository,readonly sources:GroupSources){}
 private async load(owner:string,id:string){const g=await this.repository.read(owner,id);if(!g||g.ownerId!==owner)throw Error('Group not found.');return groupSchema.parse(g);}
 private async member(g:AgentGroup,id:string){if(!g.members.some(m=>m.agentId===id))throw Error('Current Group membership required.');const agent=await this.sources.agent(g.ownerId,id);if(!agent.active)throw Error('Active owned agent required.');return agent;}
 async create(owner:string,input:unknown){const g=groupSchema.parse(input);if(g.ownerId!==owner)throw Error('Group owner mismatch.');if(g.version!==1||g.links.length||g.handoffs.length||g.attentionId)throw Error('New Group must have no imported history.');for(const m of g.members)await this.member(g,m.agentId);await this.repository.save(g,null,'created');return g;}
 async view(owner:string,id:string){const g=await this.load(owner,id);const links=[];for(const ref of g.links)if(await this.sources.canRead(owner,ref.agentId,ref))links.push(ref);const attention=g.attentionId?await this.sources.attention(owner,g.attentionId):null;
  const needsYou=!!attention&&attention.ownerId===owner&&attention.needsYou&&links.some(r=>r.kind==='work'&&r.id===attention.workId);return {...g,links,needsYou};}
 async share(owner:string,id:string,version:number,input:unknown){const g=await this.load(owner,id),ref=link.parse(input);if(g.version!==version)throw Error('Group changed.');await this.member(g,ref.agentId);if(!await this.sources.canRead(owner,ref.agentId,ref))throw Error('Canonical reference access required.');
  if(g.links.some(x=>x.kind===ref.kind&&x.id===ref.id&&x.revision===ref.revision&&x.agentId===ref.agentId))return g;
  const next=groupSchema.parse({...g,version:version+1,links:[...g.links,ref]});await this.repository.save(next,version,'reference_shared');return next;
 }
 async removeMember(owner:string,id:string,version:number,agentId:string){const g=await this.load(owner,id);if(g.version!==version)throw Error('Group changed.');if(g.members.find(m=>m.agentId===agentId)?.role==='coordinator')throw Error('Coordinator replacement requires a reviewed Group revision.');
  const next=groupSchema.parse({...g,version:version+1,members:g.members.filter(m=>m.agentId!==agentId),links:g.links.filter(r=>r.agentId!==agentId)});await this.repository.save(next,version,'membership_revoked');return next;
 }
 async propose(owner:string,id:string,version:number,from:string,to:string,references:GroupLink[],task:string,key:string){const g=await this.load(owner,id);if(g.version!==version)throw Error('Group changed.');const sender=await this.member(g,from),recipient=await this.member(g,to);
  if(from===to||!sender.relayAddress||!recipient.relayAddress||sender.relayAddress===recipient.relayAddress)throw Error('WAITING_FOR_DISTINCT_RELAY_IDENTITIES');
  if(!task.trim()||task.length>2000||references.length>10||!key.trim()||key.length>100)throw Error('Bounded task, key and references required.');
  for(const ref of references){link.parse(ref);if(!g.links.some(r=>r.kind===ref.kind&&r.id===ref.id&&r.revision===ref.revision&&r.agentId===ref.agentId)||!await this.sources.canRead(owner,from,ref)||!await this.sources.canRead(owner,to,ref))throw Error('Explicit shared reference access required.');}
  // Contains references only. The canonical peer tool resolves its resource and
  // asks for existing Relay authority; this method never sends or grants access.
  const conversationId=conversation(g);
  return {groupId:g.id,groupVersion:g.version,from,to,sender:sender.relayAddress,
   draft:peerMessageDraft({target:recipient.relayAddress,conversationId,body:JSON.stringify({objective:g.objective,task,references})},`group:${digest([g.ownerId,g.id,g.version,key])}`),needsYou:'Review this bounded Relay handoff.'};
 }
 async retainHandoff(owner:string,id:string,version:number,from:string,to:string,requestId:string){const g=await this.load(owner,id);if(g.version!==version)throw Error('Group changed.');const sender=await this.member(g,from),recipient=await this.member(g,to);const receipt=await this.sources.relay(owner,requestId),e=envelopeSchema.parse(receipt.envelope);
  const prior=g.handoffs.find(h=>h.requestId===requestId);
  if(prior&&(prior.from!==from||prior.to!==to))throw Error('Relay request already belongs to another handoff.');
  if(from===to||!sender.relayAddress||!recipient.relayAddress||sender.relayAddress===recipient.relayAddress||e.id!==requestId||e.capability!=='message.send'||`relay://${e.caller.ownerId}/${e.caller.agentId}`!==sender.relayAddress||e.target.address!==recipient.relayAddress||e.conversationId!==(prior?.conversationId??conversation(g)))throw Error('Exact canonical Relay correlation required.');
  const response=projectPeerMessageResult(receipt.response,requestId,recipient.relayAddress);
  if(response.status!=='COMPLETED')throw Error('Relay handoff is not completed.');
  if(g.handoffs.some(h=>h.requestId===requestId))return g;
  const next=groupSchema.parse({...g,version:version+1,handoffs:[...g.handoffs,{requestId,from,to,conversationId:e.conversationId}]});await this.repository.save(next,version,'relay_handoff_retained');return next;
 }
 async attachAttention(owner:string,id:string,version:number,attentionId:string){const g=await this.load(owner,id);if(g.version!==version)throw Error('Group changed.');
  const attention=await this.sources.attention(owner,attentionId);
  const work=g.links.find(r=>r.kind==='work'&&r.id===attention?.workId);
  if(!attention||attention.ownerId!==owner||!attention.needsYou||!work||!await this.sources.canRead(owner,work.agentId,work))throw Error('Current canonical Work attention required.');
  const next=groupSchema.parse({...g,version:version+1,attentionId:attention.id});await this.repository.save(next,version,'canonical_attention_linked');return next;
 }
}
