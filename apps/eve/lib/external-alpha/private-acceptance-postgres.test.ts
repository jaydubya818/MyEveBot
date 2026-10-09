import {afterEach,describe,expect,it} from 'vitest';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {Env,connection,files} from './work-test-fixture.ts';
import {bindDispatch} from './dispatch-readback.ts';
import {prepareRequest} from './work-controller.ts';
import {buildSignedResult,type BuildOptions} from './result-test-fixture.ts';
import {ingestExternalAlphaResult,settleExternalAlphaResult} from './result-ingestion.ts';
import {BetaIntegration} from '../beta-integration/runtime.ts';
import {PrivateResultAcceptance,PRIVATE_ACCEPT} from './private-acceptance.ts';
import {readExternalAlphaWork} from './work-readback.ts';
import {digest} from '../engineering/contract.ts';

describe.skipIf(!connection)('canonical private acceptance (real PostgreSQL)',()=>{
 const envs:Env[]=[];
 afterEach(async()=>{await Promise.all(envs.splice(0).map(e=>e.close()));},60000);
 async function fixture(opts?:BuildOptions,unknown=false){
  const e=await Env.create();envs.push(e);const work=await e.seedWork();const issued=await e.svc.issue(work,files);await e.svc.claim(issued);
  const config=e.workConfig([{keyId:'b'.repeat(64),publicKey:generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}) as string}]);
  const binding=await bindDispatch(e.db,issued,prepareRequest(issued,work,config));const workOrderId=randomUUID();
  const authority=await e.svc.finish(issued.id,'CONSUMED',{receipt:{authorityId:issued.id,authoritySha256:issued.documentSha256,requestId:issued.requestId,workOrderId,consumedAt:new Date().toISOString()}});
  const {signed}=buildSignedResult({authority,work,workOrderId,keys:e.resultKeys,opts:{...opts,requestDigest:binding.requestDigest}});
  const retained=await ingestExternalAlphaResult({database:e.db,policy:e.policy,config,authority,work,envelope:signed,expectedRequestDigest:binding.requestDigest,expectedRunId:'00000000-0000-4000-8000-0000000000a1'});
  await settleExternalAlphaResult(e.db,e.policy,authority,{quiescent:true,operations:[{operationId:'fixture',phase:'productive',state:unknown?'unknown':'settled',actualMicrousd:unknown?null:0,reservedMicrousd:100,model:e.policy.model,pricingRevision:'fixture'}]});
  const beta=new BetaIntegration(e.pool,{repository:e.policy.repository,maxCostUsd:1.3,maxDurationSeconds:180});
  const service=new PrivateResultAcceptance(beta,e.policy,config);
  async function respond(){const item=await service.request(e.owner,work.id);return beta.inbox(e.owner).respond({itemId:item.id,actionId:item.action!.id,actionBinding:item.actionBinding!,expectedRevision:item.revision,idempotencyKey:'accept-once',answer:PRIVATE_ACCEPT});}
  return {e,work,authority,retained,beta,service,respond};
 }
 it('accepts once, completes the exact Work, and retains immutable PARTIAL Proof across restart and duplicate delivery',async()=>{
  const s=await fixture();const before=(await s.e.pool.query('SELECT proof,content_hash FROM engineering_native_results')).rows[0];
  const response=await s.respond();const receipts=await Promise.all(Array.from({length:8},()=>s.service.accept(response)));
  expect(new Set(receipts.map(r=>r.receipt)).size).toBe(1);
  const work=await s.e.store.get(s.work.id);expect(work).toMatchObject({lifecycle:'accepted',version:s.work.version+1,generation:s.work.generation+1});
  expect((await s.e.pool.query('SELECT proof,content_hash FROM engineering_native_results')).rows[0]).toEqual(before);expect(before.proof.outcome).toBe('PARTIAL');
  const saved=(await s.e.pool.query("SELECT * FROM engineering_owner_decisions WHERE action='accept_private'")).rows;
  expect(saved).toHaveLength(1);expect(saved[0].response_id).toBe(response.id);expect(saved[0].binding).toMatchObject({ownerId:s.e.owner,workId:s.work.id,resultId:s.retained.resultId,candidateSha:s.retained.candidateSha,factoryVersion:s.e.policy.factoryVersion,publication:false});
  expect(digest(saved[0].binding)).toBe(saved[0].binding_hash);
  await expect(s.e.pool.query("UPDATE engineering_owner_decisions SET action='open_pr' WHERE id=$1",[saved[0].id])).rejects.toThrow('immutable');
  const restarted=new PrivateResultAcceptance(s.beta,s.e.policy,s.service.config);expect(await restarted.accept(response)).toEqual(receipts[0]);
  const readback=await readExternalAlphaWork(s.e.store,work);expect(readback?.acceptance?.resultId).toBe(s.retained.resultId);expect(readback?.result?.current).toBe(true);
  for(const table of ['engineering_candidate_publications','engineering_factory_requests'])expect(await s.e.count(table)).toBe(0);
  expect(await s.e.count('external_alpha_work_authority')).toBe(1);expect(await s.e.count('external_alpha_work_result')).toBe(1);
 });
 it.each(['owner','work','generation','candidate','factory','proof','revoked','cancelled'] as const)('rejects %s mismatch without completion',async(change)=>{
  const s=await fixture();const response=await s.respond();
  if(change==='owner')response.ownerId=randomUUID();
  if(change==='work')response.workId=randomUUID();
  if(change==='generation')await s.e.pool.query('UPDATE engineering_work SET generation=generation+1 WHERE id=$1',[s.work.id]);
  if(change==='candidate'||change==='factory'||change==='proof')await s.e.pool.query(`UPDATE beta_work_decisions SET result_acceptance_binding=jsonb_set(result_acceptance_binding,$2::text[],$3::jsonb) WHERE work_id=$1`,[s.work.id,[change==='candidate'?'candidateSha':change==='factory'?'factoryVersion':'proofHash'],JSON.stringify('wrong')]);
  if(change==='revoked')await s.e.pool.query('UPDATE external_alpha_policy SET revoked_at=clock_timestamp()');
  if(change==='cancelled')await s.e.pool.query("UPDATE engineering_work SET lifecycle='cancelled',generation=generation+1 WHERE id=$1",[s.work.id]);
  if(['generation','revoked','cancelled'].includes(change))expect((await s.service.accept(response)).status).toBe('stale');
  else await expect(s.service.accept(response)).rejects.toThrow();
  expect(await s.e.count('engineering_owner_decisions')).toBe(0);
 });
 it('terminates an obsolete saved answer and continues delivering later decisions',async()=>{
  const s=await fixture();const response=await s.respond();
  await s.e.pool.query("UPDATE engineering_work SET lifecycle='cancelled',generation=generation+1 WHERE id=$1",[s.work.id]);
  const inbox=s.beta.inbox(s.e.owner);
  const next=await inbox.ingest({kind:'DECISION',title:'Choose grouping',summary:'Choose a grouping for private notes.',source:{system:'work',accountId:s.e.owner,eventId:'next-decision',sender:'Sofie',occurredAt:new Date().toISOString(),reference:s.work.id},correlationId:'next-decision',episode:1,sequence:1,action:{id:'next-decision',kind:'decision',reason:'choice',involvement:'NECESSARY_JUDGMENT',prompt:'Group notes?',options:['By topic']},priority:{blockingActiveWork:false}});
  const later=await inbox.respond({itemId:next.id,actionId:next.action!.id,actionBinding:next.actionBinding!,expectedRevision:next.revision,idempotencyKey:'later-decision',answer:'By topic'});
  expect(await inbox.deliver({accept:async r=>r.id===response.id?s.service.accept(r):{status:'accepted',receipt:'later-delivered'}})).toBe(2);
  expect((await s.beta.responses().read(s.e.owner,response.id))?.status).toBe('STALE');
  expect((await s.beta.responses().read(s.e.owner,later.id))?.status).toBe('DELIVERED');
  expect(await s.e.count('engineering_owner_decisions')).toBe(0);
 });
 it.each(['none','UNKNOWN','FAIL'] as const)('cannot accept verification %s or promote PARTIAL',async(verification)=>{
  const s=await fixture({verification});await expect(s.respond()).rejects.toThrow();expect((await s.e.store.get(s.work.id)).lifecycle).toBe('active');
 });
 it('refuses accounting UNKNOWN and preserves its exposure',async()=>{
  const s=await fixture(undefined,true);await expect(s.respond()).rejects.toThrow();expect((await s.e.pool.query('SELECT state FROM external_alpha_allowance')).rows[0].state).toBe('UNKNOWN');
 });
 it('denies fabricated, conflicting and cross-owner decisions through the canonical inbox',async()=>{
  const s=await fixture();const response=await s.respond();
  await expect(s.service.accept({...response,answer:'Publish'})).rejects.toThrow();
  await expect(s.service.accept({...response,id:'response_forged'})).rejects.toThrow();
  const item=await s.beta.inbox(s.e.owner).repository.get(s.e.owner,response.itemId);
  await expect(s.beta.inbox(randomUUID()).respond({itemId:response.itemId,actionId:response.action.id,actionBinding:response.actionBinding,expectedRevision:item!.revision,idempotencyKey:'foreign',answer:PRIVATE_ACCEPT})).rejects.toThrow();
  await expect(s.beta.inbox(s.e.owner).respond({itemId:response.itemId,actionId:response.action.id,actionBinding:response.actionBinding,expectedRevision:item!.revision,idempotencyKey:'accept-once',answer:'Publish'})).rejects.toThrow('RESPONSE_ID_CONFLICT');
  await expect(s.beta.inbox(s.e.owner).respond({itemId:response.itemId,actionId:response.action.id,actionBinding:response.actionBinding,expectedRevision:item!.revision,idempotencyKey:'other-decision',answer:PRIVATE_ACCEPT})).rejects.toThrow('STALE_ACTION');
 });
});
