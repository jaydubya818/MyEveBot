import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {Groups} from '../../lib/product/groups.ts';
import {PostgresGroups} from '../../lib/product/group-repository.ts';
if(process.env.MYEVE_PRODUCT_TEST_PORT && !/^[0-9]{1,5}$/.test(process.env.MYEVE_PRODUCT_TEST_PORT))throw Error('Numeric disposable loopback port required');
const url=process.env.MYEVE_PRODUCT_TEST_DATABASE;
if(url!==`postgresql://postgres@127.0.0.1:${process.env.MYEVE_PRODUCT_TEST_PORT??'55509'}/myeve_beta_publication`)throw Error('Task-owned database required');
const pool=new Pool({connectionString:url}),c=await pool.connect(),schema='group_journey_'+Date.now();
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
try{
 await c.query(`CREATE SCHEMA ${schema}`);await c.query(`SET search_path TO ${schema}`);
 await c.query(await readFile(new URL('../../../../docs/product/schema-proposals/agent-groups.sql',import.meta.url),'utf8'));
 const db={query:async(s,p)=>(await c.query(s,p)).rows},repo=new PostgresGroups(db);
 // Distinct deterministic identities and canonical source-adapter fixtures.
 // No live registration, model response, network delivery or new Result authority.
 const identities=new Map(['sofie','designer','engineer','reviewer'].map(id=>[id,{active:true,relayAddress:'relay://fixture-owner/'+id}]));
 const references=new Set(),receipts=new Map();let revoked=false;
 const sources={attention:async(owner,id)=>({id,ownerId:owner,workId:'implementation-work',needsYou:true}),agent:async(owner,id)=>{assert.equal(owner,'owner');return identities.get(id)??{active:false,relayAddress:null};},canRead:async(owner,agent,ref)=>owner==='owner'&&identities.has(agent)&&references.has(ref.kind+':'+ref.id+':'+ref.revision)&&!revoked,relay:async(_owner,id)=>{const r=receipts.get(id);if(!r)throw Error('Canonical Relay receipt unavailable');return r;}};
 let domain=new Groups(repo,sources);
 let g=await domain.create('owner',{id:'design-engineering',ownerId:'owner',name:'Design delivery',objective:'Improve the owner review experience',version:1,members:[{agentId:'sofie',role:'coordinator'},{agentId:'designer',role:'member'},{agentId:'engineer',role:'member'},{agentId:'reviewer',role:'reviewer'}],links:[],handoffs:[],attentionId:null});
 await assert.rejects(()=>domain.view('foreign',g.id));checks++;
 await assert.rejects(()=>domain.create('foreign',{...g,id:'forged'}));checks++;
 async function share(agent,kind,id){const ref={agentId:agent,kind,id,revision:'v1'};references.add(kind+':'+id+':v1');g=await domain.share('owner',g.id,g.version,ref);return ref;}
 async function handoff(from,to,refs,key){
  const proposal=await domain.propose('owner',g.id,g.version,from,to,refs,'Review the shared result; do not publish or deploy.',key);
  eq(proposal.draft.target,identities.get(to).relayAddress);eq(proposal.draft.capability,'message.send');
  const requestId='fixture-'+key;
  receipts.set(requestId,{envelope:{id:requestId,protocol:'relay.federation',version:'1.0',caller:{ownerId:'fixture-owner',agentId:from},target:{ownerId:'fixture-owner',agentId:to,address:identities.get(to).relayAddress},capability:'message.send',resource:identities.get(to).relayAddress,createdAt:new Date().toISOString(),expiresAt:proposal.draft.expiresAt,idempotencyKey:proposal.draft.idempotencyKey,conversationId:proposal.draft.conversationId,payload:proposal.draft.payload,publication:null,authorizationContext:{grantId:'fixture-exact-peer',policyDecisionId:'fixture-policy',localAuthorizationRequired:true}},response:{requestId,status:'COMPLETED',result:{acknowledged:true,reply:{body:'Controlled peer acknowledgement',replyTo:requestId}}}});
  g=await domain.retainHandoff('owner',g.id,g.version,from,to,requestId);
  eq((await domain.retainHandoff('owner',g.id,g.version,from,to,requestId)).version,g.version);
 }
 const design=await share('designer','result','design-result'),artifact=await share('designer','artifact','design-artifact');
 await handoff('designer','engineer',[design,artifact],'design-to-engineer');
 const work=await share('engineer','work','implementation-work'),result=await share('engineer','result','implementation-result'),visual=await share('engineer','artifact','visual-evidence');
 await handoff('engineer','reviewer',[work,result,visual],'implementation-to-reviewer');
 const review=await share('reviewer','result','visual-review');
 await handoff('reviewer','sofie',[review],'review-to-sofie');
 await share('sofie','result','synthesis-result');
 g=await domain.attachAttention('owner',g.id,g.version,'fixture-canonical-work-attention');
 await handoff('sofie','reviewer',[review],'synthesis-review');
 domain=new Groups(new PostgresGroups(db),sources);const recovered=await domain.view('owner',g.id);eq(recovered,{...g,needsYou:true});eq(recovered.handoffs.length,4);eq(recovered.links.length,7);
 eq((await db.query('SELECT count(*)::int AS n FROM agent_group_audit'))[0].n,g.version);
 const staleVersion=g.version-1;await assert.rejects(()=>domain.attachAttention('owner',g.id,staleVersion,'fixture-stale'));checks++;
 await assert.rejects(()=>domain.propose('owner',g.id,g.version,'sofie','sofie',[],'Self impersonation','bad'));checks++;
 revoked=true;eq((await domain.view('owner',g.id)).links.length,0);await assert.rejects(()=>domain.propose('owner',g.id,g.version,'designer','engineer',[design],'Share revoked reference','bad'));checks++;revoked=false;
 identities.set('engineer',{active:true,relayAddress:identities.get('sofie').relayAddress});await assert.rejects(()=>domain.propose('owner',g.id,g.version,'sofie','engineer',[],'Duplicate identity','bad'));checks++;
 identities.set('engineer',{active:true,relayAddress:'relay://fixture-owner/engineer'});
 const race=await Promise.allSettled([domain.attachAttention('owner',g.id,g.version,'fixture-choice-one'),domain.attachAttention('owner',g.id,g.version,'fixture-choice-two')]);eq(race.filter(r=>r.status==='fulfilled').length,1);
 g=await repo.read('owner',g.id);g=await domain.removeMember('owner',g.id,g.version,'designer');await assert.rejects(()=>domain.propose('owner',g.id,g.version,'designer','engineer',[],'Revoked member','bad'));checks++;
 console.log(JSON.stringify({category:'DETERMINISTIC',checks,persistentDomain:'PostgreSQL proposed schema only',journey:'Designer → Engineer → Reviewer → Sofie → Needs You',distinctFixtureIdentities:4,relayContracts:'canonical draft/envelope/result schemas',realRegisteredPeers:'NOT_RUN',liveExecution:'NOT_RUN',productionSchema:'NOT_ALLOCATED',newMessagingPlane:false}));
}finally{await c.query('SET search_path TO public');await c.query(`DROP SCHEMA ${schema} CASCADE`);c.release();await pool.end();}
