import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,readdir,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {neonConfig} from '@neondatabase/serverless';
import {executeEnterpriseTool} from '../agent/lib/missioncontrol.ts';
import {enterpriseConfig,signedCommand} from '../lib/missioncontrol/consumer.ts';
const source=resolve(process.env.MISSIONCONTROL_SOURCE_ROOT??'');
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim(),'c559a209e7e724e7a9e0f4b9871c5233f750ae6c','Use the exact pinned MC owner-review candidate');
const mcDirty=!!execFileSync('git',['status','--porcelain'],{cwd:source,encoding:'utf8'}).trim();
assert.equal(mcDirty,false,'Pinned MC source must be clean');
const output=resolve(process.argv[2]??'/tmp/myeve-enterprise-'+randomUUID());await mkdir(output,{recursive:true});
const checks=[],receipt={schema:'myeve-enterprise-consumer-qualification/v1',checks,missionControlSha:'c559a209e7e724e7a9e0f4b9871c5233f750ae6c',
  missionControlDirty:mcDirty,myeveDirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),myeveSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),paidOperations:0,productionIntegration:'NOT_RUN',externalAlphaChanges:0,executableProductionGrants:0};
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
const pgName='mc-sofie-'+randomUUID(),port=55519;
let db,pool,container=false;
const originalTransport=neonConfig.fetchFunction;
try {
  execFileSync('docker',['run','--detach','--name',pgName,'--pull=never','--memory=768m','--cpus=2','-p',`127.0.0.1:${port}:5432`,
    '--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','pgvector/pgvector@sha256:7b822b0aac60967beb1ea5e576b8602c94c300a157d187f385ae3e0da199b90a'],{stdio:'pipe'});container=true;
  pool=new Pool({host:'127.0.0.1',port,user:'postgres',database:'postgres',max:8});
  let ready=false;for(let i=0;i<60;i++){try{await pool.query('SELECT 1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,200));}}assert.ok(ready);
  const dir=new URL('../migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await pool.query(await readFile(new URL(file,dir),'utf8'));
  process.env.DATABASE_URL='postgresql://postgres@missioncontrol-fixture.invalid/postgres';
  // Canonical Neon serialization to an actual disposable PostgreSQL server; no query/result mocks.
  neonConfig.fetchFunction=async(_url,options)=>{
    const body=JSON.parse(options.body),client=await pool.connect();
    const query=async({query,params})=>{const r=await client.query({text:query,values:params,rowMode:'array',types:{getTypeParser:()=>value=>value}});
      return {fields:r.fields.map(f=>({name:f.name,dataTypeID:f.dataTypeID})),rows:r.rows,rowCount:r.rowCount,command:r.command,rowAsArray:true};};
    try{if(!body.queries)return Response.json(await query(body));await client.query('BEGIN');const results=[];for(const q of body.queries)results.push(await query(q));await client.query('COMMIT');return Response.json({results});}
    catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  };
  process.env.MC_COMPATIBILITY_PORT='3404';
  const {startFixtureDatabase}=await import(pathToFileURL(join(source,'scripts/enterprise-compatibility/database.mjs')));
  db=await startFixtureDatabase(source,{nativeExecution:true,canonicalAccounting:true});
  const s=db.seed,secret=randomBytes(32).toString('hex'),owner='synthetic-sofie-owner',agent='synthetic-sofie-primary';
  db.setEnvironment('MC_SOFIE_READINESS_ENVIRONMENT_ID',s.environmentId);db.setEnvironment('MC_SOFIE_APPLICATION_SECRET',secret);
  db.setEnvironment('MC_SOFIE_APPLICATION_OWNER_ID',s.operatorId);db.setEnvironment('MC_SOFIE_APPLICATION_KEY_ID','consumer-fixture-1');
  const mutate=(name,args,client=db.owner)=>client.mutation(name,args,{skipQueue:true});
  const connection=await mutate('sofieEnterprise:connect',{projectId:s.projectId,ownerMemberId:s.memberId,owningTeamId:s.teamId,expiresAt:Date.now()+600000});
  Object.assign(process.env,{EVE_ENABLED_FEATURES:'missioncontrol-readiness',MYEVE_MISSIONCONTROL_MODE:'ISOLATED_DETERMINISTIC',MYEVE_MISSIONCONTROL_URL:'http://127.0.0.1:3404',
    MYEVE_MISSIONCONTROL_SECRET:secret,MYEVE_MISSIONCONTROL_OWNER_ID:owner,MYEVE_MISSIONCONTROL_OPERATOR_ID:s.operatorId,MYEVE_MISSIONCONTROL_TENANT_ID:s.tenantId,
    MYEVE_MISSIONCONTROL_PROJECT_ID:s.projectId,MYEVE_MISSIONCONTROL_CONNECTION_ID:connection.connectionId});
  await pool.query("INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,risk_ceiling,max_steps,max_runtime_seconds,max_estimated_cost_usd) VALUES($1,$2,'sofie','Sofie','Primary','Synthetic integration',true,'active','high',100,3600,1)",[agent,owner]);
  const principal={authenticator:'myeve-web-session',principalId:owner,principalType:'user',attributes:{owner:'true',myeveAgentId:agent}};
  const context=()=>({callId:randomUUID(),session:{id:'synthetic-enterprise-session',auth:{current:principal,initiator:principal}}});
  const call=(input,ctx=context())=>executeEnterpriseTool(input,ctx);
  const proposal={title:'Agentic HR platform',objective:'Govern recruiting, onboarding, employee operations and audit.',workstreams:['Recruiting','Onboarding','Employee operations','Audit'],milestones:['Review scope','Approve Plan','Independent verification'],stopCondition:'Stop after draft inspection.',budgetMicrousd:0};
  const propose={operation:'enterprise.propose',intentKey:'owner-hr-platform-1',proposal};
  const config=enterpriseConfig();
  const {canonicalServiceCommand}=await import(pathToFileURL(join(source,'packages/shared/src/serviceCommandEnvelope.ts')));
  const {enterpriseDigest,validateEnterpriseRequest}=await import(pathToFileURL(join(source,'packages/shared/src/sofieEnterprise.ts')));
  await check('exact-pinned-protocol-parity',async()=>{const p=signedCommand(config,propose);assert.equal(validateEnterpriseRequest(JSON.parse(p.payloadJson)).operation,propose.operation);
    const {createHmac}=await import('node:crypto');assert.equal(p.envelope.signature,'sha256='+createHmac('sha256',secret).update(canonicalServiceCommand(p.envelope)).digest('hex'));});
  let prepared;await check('actual-Sofie-tool-and-Action-Gateway-proposal',async()=>{prepared=await call(propose);assert.equal(prepared.receipt.response.proposal.title,proposal.title);});
  if(process.env.MYEVE_CHECKPOINT_H_BROWSER === '1') {
    const {qualifySofieBrowser}=await import('./browser/enterprise-browser.mjs');
    receipt.browser=await qualifySofieBrowser({source:fileURLToPath(new URL('../../../',import.meta.url)),pool,input:propose,owner,db,databaseUrl:'postgresql://postgres@localhost:55519/postgres'});
    assert.equal(receipt.browser.status,'PASS');
  }
  const proposalId=prepared.receipt.response.proposalId,proposalDigest=prepared.receipt.response.digest;
  assert.equal(proposalDigest,enterpriseDigest({connectionId:connection.connectionId,tenantId:s.tenantId,projectId:s.projectId,ownerId:s.operatorId,intentKey:propose.intentKey,proposal}));
  const submit={operation:'enterprise.submit',proposalId,proposalDigest};
  await check('application-cannot-self-authorize',async()=>{await assert.rejects(()=>call(submit));await assert.rejects(()=>mutate('sofieEnterprise:decide',{projectId:s.projectId,connectionId:connection.connectionId,proposalId,expectedDigest:proposalDigest,decision:'AUTHORIZE_DRAFT'},db.anonymous));});
  const decision={projectId:s.projectId,connectionId:connection.connectionId,proposalId,expectedDigest:proposalDigest,decision:'AUTHORIZE_DRAFT'};
  await check('cross-owner-and-cross-tenant-decision-denial',async()=>{for(const client of [db.peer,db.other])await assert.rejects(()=>mutate('sofieEnterprise:decide',decision,client));});
  await mutate('sofieEnterprise:decide',decision);
  let missionId;await check('concurrent-actual-tool-submissions-create-one-Mission',async()=>{const attempts=await Promise.allSettled(Array.from({length:4},()=>call(submit)));const results=attempts.filter(r=>r.status==='fulfilled').map(r=>r.value);assert.ok(results.length>=1);for(const r of attempts.filter(r=>r.status==='rejected'))assert.ok(['denied','result_unknown'].includes(r.reason.status));assert.equal(new Set(results.map(r=>r.receipt.response.missionId)).size,1);missionId=results[0].receipt.response.missionId;assert.equal((await db.owner.query('missions:list',{projectId:s.projectId})).length,1);});
  const read={operation:'enterprise.read',proposalId,missionId,expectedPlanDigest:null};
  let status;await check('actual-tool-status-and-honest-Result-unavailability',async()=>{status=await call(read);assert.equal(status.receipt.response.mission.state,'DRAFT');assert.equal(status.receipt.response.resultProof.status,'NOT_AVAILABLE');});
  await mutate('missions:savePlanDraft',{projectId:s.projectId,missionId,idempotencyKey:'sofie-consumer-plan',summary:'HR platform decomposition',rollbackApproach:'No execution.',estimatedCostUsd:0,assertions:[],workOrderBlueprints:proposal.workstreams.map((title,i)=>({id:'hr-'+i,title,desiredOutcome:title,sequence:i,role:'WORKER',isMutating:false,priority:3,riskLevel:'LOW',constraints:['Draft only'],requiredApprovals:[],dependsOnBlueprintIds:[],assertionIds:[]}))});
  await check('Plan-milestones-Needs-You-consumed',async()=>{status=await call(read);assert.equal(status.receipt.response.plan.milestones.length,4);assert.equal(status.receipt.response.plan.status,'DRAFT');assert.ok(status.receipt.response.needsYou);});
  await check('stale-Plan-denied',()=>assert.rejects(()=>call({...read,expectedPlanDigest:'sha256:'+'0'.repeat(64)})));
  await check('restart-no-additional-Mission',async()=>{await db.restart();assert.equal((await call(submit)).receipt.response.missionId,missionId);});
  const sameContext=context();await call(read,sameContext);
  await check('duplicate-tool-delivery-durable-receipt',async()=>{const before=await pool.query('SELECT count(*)::int AS n FROM action_requests');await call(read,sameContext);assert.equal((await pool.query('SELECT count(*)::int AS n FROM action_requests')).rows[0].n,before.rows[0].n);});
  await check('cached-receipt-expiry-and-tamper-denied-without-redispatch',async()=>{
    const ctx=context(),completed=await call(read,ctx),id=completed.actionId;
    const original=(await pool.query('SELECT provider_receipt FROM action_requests WHERE id=$1',[id])).rows[0].provider_receipt;
    await pool.query("UPDATE action_requests SET provider_receipt=jsonb_set(provider_receipt,'{observedAt}','1'::jsonb) WHERE id=$1",[id]);
    await assert.rejects(()=>call(read,ctx),/ENTERPRISE_RESPONSE_BINDING/);
    await pool.query('UPDATE action_requests SET provider_receipt=$2::jsonb WHERE id=$1',[id,JSON.stringify({...original,responseDigest:'sha256:'+'0'.repeat(64)})]);
    await assert.rejects(()=>call(read,ctx),/ENTERPRISE_RESPONSE_BINDING/);
    assert.equal((await pool.query('SELECT attempt_count FROM action_requests WHERE id=$1',[id])).rows[0].attempt_count,1);
    await pool.query('UPDATE action_requests SET provider_receipt=$2::jsonb WHERE id=$1',[id,JSON.stringify(original)]);
  });
  await check('cross-owner-Sofie-session-denied',()=>assert.rejects(()=>call(read,{...context(),session:{id:'foreign',auth:{current:{...principal,principalId:'foreign'},initiator:principal}}}),e=>e.status==='denied'));
  await check('lost-submit-ack-read-only-reconciliation-after-restart',async()=>{
    const second=await call({...propose,intentKey:'lost-ack-owner-intent'}),p=second.receipt.response;
    await mutate('sofieEnterprise:decide',{...decision,proposalId:p.proposalId,expectedDigest:p.digest});
    const request={operation:'enterprise.submit',proposalId:p.proposalId,proposalDigest:p.digest},ctx=context();
    const originalFetch=globalThis.fetch;let submissions=0;
    globalThis.fetch=async(url,options)=>{const reply=await originalFetch(url,options);
      if(String(url)==='http://127.0.0.1:3404/api/action' && JSON.parse(options.body).args[0].envelope.capability==='enterprise.submit'){
        submissions++;await reply.arrayBuffer();throw Error('Injected lost acknowledgment');}return reply;};
    try{await assert.rejects(()=>call(request,ctx),e=>e.status==='result_unknown');await db.restart();await assert.rejects(()=>call(request,ctx),e=>e.status==='result_unknown');assert.equal(submissions,1);}
    finally{globalThis.fetch=originalFetch;}
    const observation=await call({operation:'enterprise.inspect',proposalId:p.proposalId,intentKey:null});
    assert.ok(observation.receipt.response.proposal.missionId);
    const observedMission=await call({operation:'enterprise.read',proposalId:p.proposalId,missionId:observation.receipt.response.proposal.missionId,expectedPlanDigest:null});
    assert.equal(observedMission.receipt.response.mission.state,'DRAFT');
  });
  await mutate('sofieEnterprise:decide',{...decision,decision:'REVOKE'});
  await check('revocation-denies-fresh-status-cached-replay-and-submit',async()=>{await assert.rejects(()=>call(read,sameContext));await assert.rejects(()=>call(read));await assert.rejects(()=>call(submit));});
  await check('no-execution-accounting-or-delegation-created',async()=>{for(const table of ['workflowRuns','workOrders','inferenceReservations','factoryProviderReservations','factoryDelegationTrials'])assert.deepEqual(await db.owner.query('nativeFixture:inspect',{table}),[]);});
  receipt.status='PASS';receipt.finalObservation=status.receipt;receipt.completedResultConsumption='NOT_EXERCISED_DRAFT_REGRESSION_ONLY';receipt.ownerDecisionSurface='Canonical MissionControl authenticated mutation; MyEve browser handoff remains unqualified';
  receipt.actions=(await pool.query('SELECT status,count(*)::int AS count FROM action_requests GROUP BY status ORDER BY status')).rows;
  console.log(JSON.stringify({status:'PASS',checks:checks.length,output}));
} catch(e){receipt.status='FAIL';receipt.failure=String(e.message);throw e;}
finally {
  neonConfig.fetchFunction=originalTransport;
  if(db)await db.destroy();
  if(pool)await pool.end();if(container)execFileSync('docker',['rm','-f',pgName],{stdio:'pipe'});
  receipt.cleanup='VERIFIED';await writeFile(join(output,'qualification.json'),JSON.stringify(receipt,null,2)+'\n');
}
process.exit(0);
