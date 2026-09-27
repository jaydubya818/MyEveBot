import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {prepareRelayCollaboration,observeRelayCollaboration,relayDisclosureHash} from '../lib/engineering/relay-collaboration.ts';
import {GitHubAdapter,treeObjects,workBranch,publicationCommit} from '../lib/engineering/github.ts';
import {makeContract,digest} from '../lib/engineering/contract.ts';
import {initialExecution,readiness} from '../lib/engineering/execution.ts';
import {draftLearningCandidate,prepareLearningPromotion,learningAppliesToWork} from '../lib/digital-worker/learning.ts';
const sha=(kind,body)=>createHash('sha1').update(`${kind} ${Buffer.byteLength(body)}\0`).update(body).digest('hex');
export function localRelay(work,agentId){
 const now=Date.now(),iso=n=>new Date(now+n).toISOString();
 const bound={ownerId:work.scopeId,agentId,workId:work.id,workVersion:work.version,workGeneration:work.generation,lifecycle:work.lifecycle,control:work.control};
 const grant={ownerId:work.scopeId,agentId,peer:'relay://fixture-owner/research',grantId:'synthetic-only',grantRevision:1,capability:'message.send',status:'ACTIVE',qualified:true,checkedAt:iso(0),expiresAt:iso(60000)};
 const body='Investigate parser edge cases only. Return advisory findings.';
 const prepared=prepareRelayCollaboration({work:bound,grant,requestId:randomUUID(),body,approvedDisclosureHash:relayDisclosureHash(body),deadline:iso(50000)},now);
 const observed=observeRelayCollaboration({binding:prepared.binding,work:bound,grant,authenticatedPeer:grant.peer,response:{requestId:prepared.binding.requestId,status:'COMPLETED',result:{acknowledged:true,reply:{body:'Include zero, negative, fractional and whitespace cases.',replyTo:prepared.binding.requestId}}}},now);
 assert.equal(observed.status,'ATTACH');assert.equal(observed.receipt.trust,'ADVISORY_ONLY');return observed.receipt;
}
/** Real publisher API contract against an in-memory GitHub transport. No credentials,
 * publication or learning promotion is persisted by this local preparation check. */
export async function composeFactoryResult({work,agentId,profile,source,workspace,result,relay}){
 const candidate=workspace.candidates.at(-1),contract=makeContract(work,{scopeId:work.scopeId,scopeKind:'personal',actorId:work.scopeId},profile,{number:1,url:'https://github.com/fixture/golden/issues/1',body:work.objective},source.sha,agentId);
 assert.equal(relay.binding.workId,work.id);assert.equal(result.proof.resultRevision,candidate.sha);assert.equal(result.proof.outcome,'PARTIAL');
 const sourceTree=treeObjects(source.files),calls=[];let head=null,pr=null,ci='failure',reviews=[];
 const baseBlobs=Object.fromEntries(Object.entries(source.files).map(([path,content])=>[sha('blob',content),{content:Buffer.from(content).toString('base64'),path,size:Buffer.byteLength(content)}]));
 function identity(person){const m=person.date.match(/([+-]\d\d):(\d\d)$/);return `${person.name} <${person.email}> ${Date.parse(person.date)/1000} ${m?m[1]+m[2]:'+0000'}`;}
 const transport=async(url,init)=>{
  const u=new URL(url),path=u.pathname.replace('/repos/'+work.repository+'/',''),method=init?.method??'GET',body=init?.body?JSON.parse(init.body):null;calls.push({path,method});let value=null;
  if(u.pathname==='/repos/'+work.repository)value={private:true,full_name:work.repository,permissions:{push:true}};
  else if(path==='commits/main'||path==='commits/'+source.sha)value={sha:source.sha,commit:{tree:{sha:sourceTree.sha}}};
  else if(path==='git/trees/'+sourceTree.sha)value={truncated:false,tree:Object.entries(baseBlobs).map(([id,b])=>({path:b.path,sha:id,size:b.size,mode:'100644',type:'blob'}))};
  else if(path.startsWith('git/blobs/')&&method==='GET')value=baseBlobs[path.slice(10)];
  else if(path.startsWith('git/ref/heads/'))value=head?{object:{sha:head}}:null;
  else if(path==='pulls'&&method==='GET')value=pr?[pr]:[];
  else if(path.endsWith('/check-runs'))value={total_count:1,check_runs:[{id:1,name:profile.requiredCI[0],head_sha:head,status:'completed',conclusion:ci,started_at:new Date().toISOString()}]};
  else if(path.endsWith('/reviews'))value=reviews;
  else if(path==='git/blobs'&&method==='POST')value={sha:sha('blob',body.content)};
  else if(path==='git/trees'&&method==='POST')value={sha:treeObjects(candidate.files).objects.find(t=>JSON.stringify(t.entries)===JSON.stringify(body.tree))?.sha};
  else if(path==='git/commits'&&method==='POST'){
   const raw=`tree ${body.tree}\nparent ${body.parents[0]}\nauthor ${identity(body.author)}\ncommitter ${identity(body.committer)}\n\n${body.message}`;
   assert.equal(raw,candidate.rawCommit);value={sha:sha('commit',raw)};
  }else if(path==='git/refs'&&method==='POST'){assert.equal(body.sha,candidate.sha);head=body.sha;value={object:{sha:head}};}
  else if(path==='pulls'&&method==='POST'){assert.equal(body.draft,true);pr={number:1,html_url:'https://github.com/fixture/golden/pull/1',draft:true,state:'open',head:{repo:{full_name:work.repository},sha:head},base:{ref:profile.baseBranch}};value=pr;}
  else throw Error('Unexpected synthetic GitHub operation '+method+' '+path);
  return value===null?new Response('{}',{status:404}):Response.json(value);
 };
 const adapter=new GitHubAdapter(work.repository,'synthetic-trusted-publisher',transport);
 assert.equal(publicationCommit(candidate).message,candidate.rawCommit.split('\n\n').slice(1).join('\n\n'));
 const published=await adapter.publish(contract,candidate,workBranch(work.id),null);assert.equal(published.number,1);assert.equal(head,candidate.sha);
 const state=initialExecution(contract,work.generation);state.candidates=[candidate];state.evidence=workspace.evidence;state.phase='observing';
 state.approval={id:randomUUID(),candidate:candidate.sha,actor:work.scopeId,generation:work.generation,at:new Date().toISOString(),boundedUpdates:false};state.effects=[{id:randomUUID(),candidate:candidate.sha,expectedHead:null,status:'CONFIRMED',createdAt:new Date().toISOString()}];
 state.truth=await adapter.observe(contract,workBranch(work.id));assert(readiness(work,state).reasons.some(r=>r.includes('CI')));
 ci='success';reviews=[{id:1,user:{login:profile.reviewerLogins[0]},commit_id:candidate.sha,state:'CHANGES_REQUESTED',body:'Add an edge case.',submitted_at:new Date().toISOString()}];state.truth=await adapter.observe(contract,workBranch(work.id));assert(readiness(work,state).reasons.some(r=>r.includes('unaddressed')));
 // Contract observations cannot change the actual durable PARTIAL result.
 assert.equal(result.proof.outcome,'PARTIAL');
 const now=Date.now(),at=new Date(now).toISOString(),scope={kind:'personal',id:work.scopeId};
 const feedback={feedbackId:randomUUID(),workId:work.id,workVersion:work.version,scope,ownerId:work.scopeId,agentId,repository:work.repository,workShape:'bounded parser',source:{kind:'TRUSTED_VERIFIER',sourceRef:'result:'+result.id,actorId:agentId,observedAt:at},summary:'Keep fractional and whitespace cases in the protected verifier.',evidence:[{sourceRef:'result:'+result.id,contentHash:'sha256:'+digest(result.proof),observedAt:at}],supervision:{interventions:0,cost:{status:'KNOWN',humanMinutes:0}},recordedAt:at};
 const learning=draftLearningCandidate(feedback,{candidateId:randomUUID(),subject:'QUALITY_CHECK',recommendation:'Include fractional and whitespace input checks.',rationale:'Protected tests cover parser edge cases.',createdAt:at},now);
 const qualification={qualificationRef:'local-composition:learning',candidateId:learning.candidateId,candidateHash:learning.contentHash,scope,status:'PASS',conflictState:'NONE',scopeLeakState:'NONE',independentEvidenceRefs:['local-eval:scope-bound'],qualifiedAt:at};
 const review={reviewRef:'local-fixture:owner-review',reviewerOwnerId:work.scopeId,candidateId:learning.candidateId,candidateHash:learning.contentHash,qualificationRef:qualification.qualificationRef,decision:'APPROVED',reviewedAt:at};
 const promoted=prepareLearningPromotion(feedback,learning,qualification,review,now);assert.equal(promoted.trust,'ADVISORY_ONLY');assert(learningAppliesToWork(promoted,{scope,repository:work.repository,workShape:'bounded parser'}));assert(!learningAppliesToWork(promoted,{scope:{kind:'personal',id:'foreign'},repository:work.repository,workShape:'bounded parser'}));
 assert.throws(()=>prepareLearningPromotion(feedback,learning,qualification,{...review,decision:'DENIED'},now));
 return {status:'PASS_LOCAL_CONTRACT',workId:work.id,candidate:candidate.sha,relayTrust:relay.trust,publisherIdentity:'SYNTHETIC',rawCommitPreserved:true,publicationMutations:calls.filter(c=>c.method==='POST').length,ciFailureBlocks:true,reviewFeedbackBlocks:true,learningTrust:promoted.trust,livePublication:'NOT_RUN',durableLearningPromotion:'NOT_IMPLEMENTED'};
}
