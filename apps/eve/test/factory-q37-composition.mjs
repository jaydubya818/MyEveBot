import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {prepareRelayCollaboration,observeRelayCollaboration,relayDisclosureHash} from '../lib/engineering/relay-collaboration.ts';
import {GitHubAdapter,treeObjects,workBranch,publicationCommit,createCandidate} from '../lib/engineering/github.ts';
import {makeContract,digest} from '../lib/engineering/contract.ts';
import {initialExecution,readiness,invalidateEvidence} from '../lib/engineering/execution.ts';
import {draftLearningCandidate,prepareLearningPromotion,learningAppliesToWork} from '../lib/digital-worker/learning.ts';
import {EngineeringWorker} from '../lib/engineering/worker.ts';
import {DockerProtectedVerifier} from '../lib/engineering/docker-executor.ts';
import {EngineeringLearningDraftStore} from '../lib/engineering/learning-drafts.ts';
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
 * real publication or learning promotion is persisted by this local preparation check. */
export async function composeFactoryResult({work,agentId,profile,source,workspace,result,relay,store}){
 const originalCandidate=workspace.candidates.at(-1);let candidate=originalCandidate;const contract=makeContract(work,{scopeId:work.scopeId,scopeKind:'personal',actorId:work.scopeId},profile,{number:1,url:'https://github.com/fixture/golden/issues/1',body:work.objective},source.sha,agentId);
 assert.equal(relay.binding.workId,work.id);assert.equal(result.proof.resultRevision,candidate.sha);assert.equal(result.proof.outcome,'PARTIAL');
 const sourceTree=treeObjects(source.files),calls=[],snapshots=new Map([[source.sha,source.files]]);let head=null,pr=null,ci='failure',reviews=[];
 function identity(person){const m=person.date.match(/([+-]\d\d):(\d\d)$/);return `${person.name} <${person.email}> ${Date.parse(person.date)/1000} ${m?m[1]+m[2]:'+0000'}`;}
 const transport=async(url,init)=>{
  const u=new URL(url),path=u.pathname.replace('/repos/'+work.repository+'/',''),method=init?.method??'GET',body=init?.body?JSON.parse(init.body):null;calls.push({path,method});let value=null;
  if(u.pathname==='/repos/'+work.repository)value={private:true,full_name:work.repository,permissions:{push:true}};
  else if(path==='commits/main')value={sha:source.sha,commit:{tree:{sha:sourceTree.sha}}};
  else if(path.startsWith('commits/')&&!path.endsWith('/check-runs')){const id=path.slice(8),files=snapshots.get(id);assert(files);value={sha:id,commit:{tree:{sha:treeObjects(files).sha}}};}
  else if(path.startsWith('git/trees/')&&method==='GET'){const files=[...snapshots.values()].find(f=>treeObjects(f).sha===path.slice(10));assert(files);value={truncated:false,tree:Object.entries(files).map(([path,content])=>({path,sha:sha('blob',content),size:Buffer.byteLength(content),mode:'100644',type:'blob'}))};}
  else if(path.startsWith('git/blobs/')&&method==='GET'){const content=[...snapshots.values()].flatMap(f=>Object.values(f)).find(c=>sha('blob',c)===path.slice(10));assert.notEqual(content,undefined);value={content:Buffer.from(content).toString('base64'),encoding:'base64'};}
  else if(path.startsWith('git/ref/heads/'))value=head?{object:{sha:head}}:null;
  else if(path==='pulls'&&method==='GET')value=pr?[pr]:[];
  else if(path.endsWith('/check-runs'))value={total_count:1,check_runs:[{id:1,name:profile.requiredCI[0],head_sha:head,status:'completed',conclusion:ci,started_at:new Date().toISOString()}]};
  else if(path.endsWith('/reviews'))value=reviews;
  else if(path==='git/blobs'&&method==='POST')value={sha:sha('blob',body.content)};
  else if(path==='git/trees'&&method==='POST')value={sha:treeObjects(candidate.files).objects.find(t=>JSON.stringify(t.entries)===JSON.stringify(body.tree))?.sha};
  else if(path==='git/commits'&&method==='POST'){
   const raw=`tree ${body.tree}\nparent ${body.parents[0]}\nauthor ${identity(body.author)}\ncommitter ${identity(body.committer)}\n\n${body.message}`;
   if(candidate.rawCommit)assert.equal(raw,candidate.rawCommit);assert.equal(sha('commit',raw),candidate.sha);snapshots.set(candidate.sha,candidate.files);value={sha:candidate.sha};
  }else if(path.startsWith('git/refs/heads/')&&method==='PATCH'){assert.equal(body.force,false);assert.equal(candidate.parentSha,head);head=body.sha;pr.head.sha=head;value={object:{sha:head}};
  }else if(path==='git/refs'&&method==='POST'){assert.equal(body.sha,candidate.sha);head=body.sha;value={object:{sha:head}};}
  else if(path==='pulls'&&method==='POST'){assert.equal(body.draft,true);pr={number:1,html_url:'https://github.com/fixture/golden/pull/1',draft:true,state:'open',head:{repo:{full_name:work.repository},sha:head},base:{ref:profile.baseBranch}};value=pr;}
  else throw Error('Unexpected synthetic GitHub operation '+method+' '+path);
  return value===null?new Response('{}',{status:404}):Response.json(value);
 };
 const adapter=new GitHubAdapter(work.repository,'synthetic-trusted-publisher',transport);
 assert.equal(publicationCommit(candidate).message,candidate.rawCommit.split('\n\n').slice(1).join('\n\n'));
 const published=await adapter.publish(contract,candidate,workBranch(work.id),null);assert.equal(published.number,1);assert.equal(head,candidate.sha);
 const state=initialExecution(contract,work.generation);state.candidates=[candidate];state.evidence=workspace.evidence;state.phase='observing';
 state.approval={id:randomUUID(),candidate:candidate.sha,actor:work.scopeId,generation:work.generation,at:new Date().toISOString(),boundedUpdates:false};state.effects=[{id:randomUUID(),candidate:candidate.sha,expectedHead:null,status:'CONFIRMED',pr:1,createdAt:new Date().toISOString()}];
 state.truth=await adapter.observe(contract,workBranch(work.id));assert(readiness(work,state).reasons.some(r=>r.includes('CI')));
 ci='success';reviews=[{id:1,user:{login:profile.reviewerLogins[0]},commit_id:candidate.sha,state:'CHANGES_REQUESTED',body:'Add an edge case.',submitted_at:new Date().toISOString()}];state.truth=await adapter.observe(contract,workBranch(work.id));assert(readiness(work,state).reasons.some(r=>r.includes('unaddressed')));
 // The existing controller runs locally with a synthetic GitHub transport.
 // Its Runs below are contract fixtures, not new database writers or paid executors.
 const transitions=[];
 const controllerStore={workStore:{get:async()=>work},get:async()=>state,claim:async()=>({token:'fixture-lease',state}),renew:async()=>{},release:async()=>{},save:async(_work,_state,kind)=>{transitions.push(kind);return state;}};
 const controller=new EngineeringWorker(controllerStore,adapter,{requestStop:async()=>{},cleanup:async()=>{}},new DockerProtectedVerifier(),()=>contract.profileHash,async()=>true);
 // Re-observe a failure using the same Factory-produced head; the real controller queues continuation.
 ci='failure';reviews=[];state.phase='observing';await controller.tick(work.id);
 assert(transitions.includes('ci_continuation'));assert.equal(state.runs.at(-1).parentSha,originalCandidate.sha);
 async function qualifyUpdate(reason){
  const run=state.runs.at(-1),prior=candidate;
  invalidateEvidence(state);assert(state.evidence.every(e=>e.result==='STALE'));
  candidate=createCandidate(contract,run,{sha:prior.sha,files:prior.files},{...prior.files,'quantity.mjs':prior.files['quantity.mjs']+'\n// '+reason+'\n'});
  state.candidates.push(candidate);assert(!readiness(work,state).ready);
  const verifierContract={...contract,profile:{...contract.profile,checks:[...contract.profile.checks,...state.reviewChecks.map(r=>r.check)]}};
  const fresh=await new DockerProtectedVerifier().verify(verifierContract,candidate);assert(fresh.length);assert(fresh.every(e=>e.result==='PASS'));state.evidence.push(...fresh);
  run.status='completed';run.candidate=candidate.sha;run.resourceReleasedAt=new Date().toISOString();
  await adapter.publish(contract,candidate,workBranch(work.id),prior.sha);
  state.effects.push({id:randomUUID(),candidate:candidate.sha,expectedHead:prior.sha,status:'CONFIRMED',pr:1,createdAt:new Date().toISOString()});state.phase='observing';
  return candidate.sha;
 }
 const ciCandidate=await qualifyUpdate('local CI continuation');
 ci='success';reviews=[{id:2,user:{login:profile.reviewerLogins[0]},commit_id:ciCandidate,state:'CHANGES_REQUESTED',body:JSON.stringify({scope:'within-existing-criteria',criterionId:work.criteria[0].id,instruction:'Retain explicit fractional coverage',check:{program:'quantity.mjs',input:'1.5',expectedOutput:'{"error":"invalid_quantity"}\n',expectedExitCode:0}}),submitted_at:new Date().toISOString()}];
 await controller.tick(work.id);assert(transitions.includes('review_continuation'));assert.equal(state.runs.at(-1).parentSha,ciCandidate);assert.equal(state.reviewChecks.length,1);
 const reviewCandidate=await qualifyUpdate('local authorized review continuation');
 assert.notEqual(reviewCandidate,ciCandidate);assert.equal(state.candidates[0].rawCommit,originalCandidate.rawCommit);
 // Contract observations cannot change the actual durable PARTIAL result.
 assert.equal(result.proof.outcome,'PARTIAL');
 const now=Date.now(),at=new Date(now).toISOString(),scope={kind:'personal',id:work.scopeId};
 const feedback={feedbackId:randomUUID(),workId:work.id,workVersion:work.version,scope,ownerId:work.scopeId,agentId,repository:work.repository,workShape:'bounded parser',source:{kind:'TRUSTED_VERIFIER',sourceRef:'result:'+result.id,actorId:agentId,observedAt:at},summary:'Keep fractional and whitespace cases in the protected verifier.',evidence:[{sourceRef:'result:'+result.id,contentHash:'sha256:'+digest(result.proof),observedAt:at}],supervision:{interventions:0,cost:{status:'KNOWN',humanMinutes:0}},recordedAt:at};
 const proposal={candidateId:randomUUID(),subject:'QUALITY_CHECK',recommendation:'Include fractional and whitespace input checks.',rationale:'Protected tests cover parser edge cases.',createdAt:at};
 const staged=await new EngineeringLearningDraftStore(store).stage(feedback,proposal);
 const restartedDrafts=await new EngineeringLearningDraftStore(store).list(work.id);assert.equal(restartedDrafts[0].candidate.contentHash,staged.candidate.contentHash);
 const learning=draftLearningCandidate(feedback,proposal,now);assert.equal(learning.contentHash,staged.candidate.contentHash);
 const qualification={qualificationRef:'local-composition:learning',candidateId:learning.candidateId,candidateHash:learning.contentHash,scope,status:'PASS',conflictState:'NONE',scopeLeakState:'NONE',independentEvidenceRefs:['local-eval:scope-bound'],qualifiedAt:at};
 const review={reviewRef:'local-fixture:owner-review',reviewerOwnerId:work.scopeId,candidateId:learning.candidateId,candidateHash:learning.contentHash,qualificationRef:qualification.qualificationRef,decision:'APPROVED',reviewedAt:at};
 const promoted=prepareLearningPromotion(feedback,learning,qualification,review,now);assert.equal(promoted.trust,'ADVISORY_ONLY');assert(learningAppliesToWork(promoted,{scope,repository:work.repository,workShape:'bounded parser'}));assert(!learningAppliesToWork(promoted,{scope:{kind:'personal',id:'foreign'},repository:work.repository,workShape:'bounded parser'}));
 const comparable=(await store.create({title:'Later comparable parser Work',objective:work.objective,repository:work.repository,criteria:work.criteria,maxCostUsd:1,maxDurationSeconds:120,idempotencyKey:randomUUID()})).work;assert.notEqual(comparable.id,work.id);assert(learningAppliesToWork(promoted,{scope:{kind:'personal',id:comparable.scopeId},repository:comparable.repository,workShape:'bounded parser'}));assert(!learningAppliesToWork(promoted,{scope,repository:'foreign/repository',workShape:'bounded parser'}));
 assert.throws(()=>prepareLearningPromotion(feedback,learning,qualification,{...review,decision:'DENIED'},now));
 return {status:'PASS_LOCAL_CONTRACT',workId:work.id,candidate:originalCandidate.sha,ciCandidate,reviewCandidate,continuationTransitions:transitions,staleEvidenceInvalidated:true,freshProtectedChecks:true,durableLearningDraft:'PASS',laterComparableWork:comparable.id,relayTrust:relay.trust,publisherIdentity:'SYNTHETIC',rawCommitPreserved:true,publicationMutations:calls.filter(c=>['POST','PATCH'].includes(c.method)).length,ciFailureBlocks:true,reviewFeedbackBlocks:true,learningTrust:promoted.trust,livePublication:'NOT_RUN',durableLearningPromotion:'NOT_IMPLEMENTED'};
}
