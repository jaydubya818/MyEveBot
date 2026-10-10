import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {neonConfig} from '@neondatabase/serverless';
import {executeEnterpriseTool} from '../agent/lib/missioncontrol.ts';
import {enterpriseConfig,sendEnterpriseCommand,validateResponse,contentDigest,signedCommand} from '../lib/missioncontrol/consumer.ts';

/** Called by the canonical native-successor hybrid runner while its actual evidence is current. */
export async function prepareCompletedResultConsumer(db) {
  const sourceRoot=fileURLToPath(new URL('../../../',import.meta.url));
  const checks=[],result={schema:'sofie-completed-result-qualification/v1',checks,
    myeveSourceSha:execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'}).trim(),myeveDirty:!!execFileSync('git',['status','--porcelain'],{cwd:sourceRoot,encoding:'utf8'}).trim(),paidOperations:0,productionIntegration:'NOT_RUN',executableProductionGrants:0};
  const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS result '+name);};
  const name='mc-sofie-result-'+randomUUID(),port=55529,originalTransport=neonConfig.fetchFunction;
  let pool,container=false;
  async function stop(){neonConfig.fetchFunction=originalTransport;if(pool){await pool.end();pool=null;}if(container){execFileSync('docker',['rm','-f',name],{stdio:'pipe'});container=false;}result.cleanup='VERIFIED';}
  try {
    execFileSync('docker',['run','--detach','--name',name,'--pull=never','--memory=768m','--cpus=2','-p',`127.0.0.1:${port}:5432`,'--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','pgvector/pgvector@sha256:7b822b0aac60967beb1ea5e576b8602c94c300a157d187f385ae3e0da199b90a'],{stdio:'pipe'});container=true;
    pool=new Pool({host:'127.0.0.1',port,user:'postgres',database:'postgres',max:8});
    let ready=false;for(let i=0;i<60;i++){try{await pool.query('SELECT 1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,200));}}assert.ok(ready);
    const dir=new URL('../migrations/',import.meta.url);
    for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await pool.query(await readFile(new URL(file,dir),'utf8'));
    process.env.DATABASE_URL='postgresql://postgres@missioncontrol-fixture.invalid/postgres';
    neonConfig.fetchFunction=async(_url,options)=>{
      const body=JSON.parse(options.body),client=await pool.connect();
      const query=async({query,params})=>{const r=await client.query({text:query,values:params,rowMode:'array',types:{getTypeParser:()=>v=>v}});
        return {fields:r.fields.map(f=>({name:f.name,dataTypeID:f.dataTypeID})),rows:r.rows,rowCount:r.rowCount,command:r.command,rowAsArray:true};};
      try{if(!body.queries)return Response.json(await query(body));await client.query('BEGIN');const results=[];for(const q of body.queries)results.push(await query(q));await client.query('COMMIT');return Response.json({results});}
      catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    };
    const s=db.seed,secret=randomBytes(32).toString('hex'),owner='synthetic-result-owner',agent='synthetic-result-primary';
    db.setEnvironment('MC_SOFIE_READINESS_ENVIRONMENT_ID',s.environmentId);db.setEnvironment('MC_SOFIE_APPLICATION_SECRET',secret);
    db.setEnvironment('MC_SOFIE_APPLICATION_OWNER_ID',s.operatorId);db.setEnvironment('MC_SOFIE_APPLICATION_KEY_ID','result-fixture-1');
    await pool.query("INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,risk_ceiling,max_steps,max_runtime_seconds,max_estimated_cost_usd) VALUES($1,$2,'sofie','Sofie','Primary','Synthetic Result consumer',true,'active','high',100,3600,1)",[agent,owner]);
    if(process.env.MYEVE_CHECKPOINT_H_BROWSER === '1') {
      const {warmSofieBrowser}=await import('./browser/enterprise-browser.mjs');
      await warmSofieBrowser({source:sourceRoot,owner});
    }
    return { stop, qualify: async(missionId)=>{
    const mutate=(name,args,client=db.owner)=>client.mutation(name,args,{skipQueue:true});
    const inspect=id=>db.owner.query('nativeFixture:inspectRecord',{id});
    const fault=(id,patch,unset=[])=>mutate('nativeFixture:fault',{id,patch,unset});
    const connectionArgs={projectId:s.projectId,ownerMemberId:s.memberId,owningTeamId:s.teamId,expiresAt:Date.now()+600000,missionId};
    await check('owner-and-tenant-connection-isolation',async()=>{for(const client of [db.anonymous,db.peer,db.other])await assert.rejects(()=>mutate('sofieEnterprise:connect',connectionArgs,client));});
    const connection=await mutate('sofieEnterprise:connect',connectionArgs);
    Object.assign(process.env,{EVE_ENABLED_FEATURES:'missioncontrol-readiness',MYEVE_MISSIONCONTROL_MODE:'ISOLATED_DETERMINISTIC',MYEVE_MISSIONCONTROL_URL:`http://127.0.0.1:${process.env.MC_COMPATIBILITY_PORT??3390}`,
      MYEVE_MISSIONCONTROL_SECRET:secret,MYEVE_MISSIONCONTROL_OWNER_ID:owner,MYEVE_MISSIONCONTROL_OPERATOR_ID:s.operatorId,MYEVE_MISSIONCONTROL_TENANT_ID:s.tenantId,
      MYEVE_MISSIONCONTROL_PROJECT_ID:s.projectId,MYEVE_MISSIONCONTROL_CONNECTION_ID:connection.connectionId});
    const principal={authenticator:'myeve-web-session',principalId:owner,principalType:'user',attributes:{owner:'true',myeveAgentId:agent}};
    const context=()=>({callId:randomUUID(),session:{id:'synthetic-result-session',auth:{current:principal,initiator:principal}}});
    const input={operation:'enterprise.result',missionId,expectedPlanDigest:connection.resultScope.planDigest},config=enterpriseConfig();
    const call=(ctx=context())=>executeEnterpriseTool(input,ctx);
    const beforeRuns=await db.owner.query('nativeFixture:inspect',{table:'workflowRuns'});
    await check('authenticated-transport-reads-real-Result',async()=>assert.equal((await sendEnterpriseCommand(config,input)).response.status,'AVAILABLE'));
    let completed;
    await check('actual-tool-consumes-executed-hybrid-Result',async()=>{completed=await call();assert.equal(completed.receipt.response.status,'AVAILABLE',JSON.stringify(completed.receipt.response));assert.equal(completed.receipt.response.workOrders.length,3);assert.equal(completed.receipt.response.ownerAcceptance,'PENDING');assert.match(completed.explanation,/Quality Gate is PASS/);});
    result.completed=completed;
    if(process.env.MYEVE_CHECKPOINT_H_BROWSER === '1') {
      const {qualifySofieBrowser}=await import('./browser/enterprise-browser.mjs');
      result.browser=await qualifySofieBrowser({source:sourceRoot,pool,input,owner,db});
      result.status=result.browser.status;
      result.boundary='Authenticated browser Result qualification; security fault controls retained in the separate completed consumer suite.';
      return result;
    }
    await check('authenticated-response-tamper-denied',async()=>{
      const changed=structuredClone(completed.receipt);changed.response.ownerAcceptance='ACCEPTED';changed.responseDigest=contentDigest(changed.response);
      assert.throws(()=>validateResponse(config,input,changed),/AUTHENTICATION/);
      assert.throws(()=>validateResponse({...config,secret:'x'.repeat(64)},input,completed.receipt),/AUTHENTICATION/);
      assert.throws(()=>validateResponse(config,input,completed.receipt,completed.receipt.authentication.expiresAt+1));
    });
    await check('request-bound-response-replay-denied',async()=>{
      const original=globalThis.fetch;globalThis.fetch=async(url,options)=>String(url).endsWith('/api/action')?Response.json({status:'success',value:completed.receipt}):original(url,options);
      try{await assert.rejects(()=>sendEnterpriseCommand(config,input),/REQUEST_MISMATCH/);}finally{globalThis.fetch=original;}
    });
    await check('foreign-session-and-Mission-denied',async()=>{
      await assert.rejects(()=>call({...context(),session:{id:'foreign',auth:{current:{...principal,principalId:'foreign'},initiator:principal}}}));
      await assert.rejects(()=>sendEnterpriseCommand(config,{...input,missionId:s.otherProjectId}));
      await assert.rejects(()=>sendEnterpriseCommand(config,{...input,expectedPlanDigest:'sha256:'+'0'.repeat(64)}));
    });
    const sameContext=context();const first=await call(sameContext);
    await check('concurrent-reconnect-always-observes-current-Result',async()=>{
      const replies=await Promise.all([call(sameContext),call(sameContext)]);assert.ok(replies.every(r=>r.receipt.response.status==='AVAILABLE'));
      assert.equal(new Set([first,...replies].map(r=>r.receipt.authentication.commandId)).size,3);
    });
    const binding=completed.receipt.response.workOrders[0],wo=await inspect(binding.workOrderId),evidence=await inspect(binding.evidenceIds[0]),source=await inspect(binding.sourceAttemptId);
    async function changedRecord(label,id,patch,restore,denial=false){
      await fault(id,patch);
      try{await check(label,async()=>{if(denial){try{assert.equal((await call(sameContext)).receipt.response.status,'NOT_AVAILABLE');}catch(e){assert.ok(['denied','result_unknown'].includes(e.status),String(e));}}else assert.equal((await call(sameContext)).receipt.response.status,'NOT_AVAILABLE');});}
      finally{await fault(id,restore);assert.equal((await call()).receipt.response.status,'AVAILABLE','Fault restoration must recover the actual current Result');}
    }
    await changedRecord('stale-revision-never-replays-cached-PASS',wo._id,{currentRevisionNumber:wo.currentRevisionNumber+1},{currentRevisionNumber:wo.currentRevisionNumber});
    await changedRecord('wrong-candidate-denied',source._id,{verificationSubject:{...source.verificationSubject,candidateSha:'f'.repeat(40)}},{verificationSubject:source.verificationSubject});
    await changedRecord('expired-custody-denied',evidence._id,{metadata:{...evidence.metadata,nativeCandidateObservation:{...evidence.metadata.nativeCandidateObservation,expiresAt:Date.now()-1}}},{metadata:evidence.metadata});
    const version=await inspect(source.factoryDefinitionVersionId);
    await changedRecord('FactoryVersion-substitution-denied',version._id,{configurationDigest:'sha256:'+'0'.repeat(64)},{configurationDigest:version.configurationDigest});
    const delegated=completed.receipt.response.workOrders.find(w=>w.runtimeImage===null),delegatedSource=await inspect(delegated.sourceAttemptId);
    for(const [label,patch] of [['wrong-executed-settlement-proof',{proofDigest:'sha256:'+'0'.repeat(64)}],['not-dispatched-settlement-cannot-prove-execution',{basis:'PROVEN_NOT_DISPATCHED'}]]) {
      const {digest:oldDigest,...body}=delegatedSource.enterpriseSettlement,changed={...body,...patch};
      await changedRecord(label,delegatedSource._id,{enterpriseSettlement:{...changed,digest:contentDigest(changed).slice(7)}},{enterpriseSettlement:delegatedSource.enterpriseSettlement});
    }
    const artifact=await inspect(binding.artifactIds[0]);
    await changedRecord('wrong-source-Attempt-artifact-denied',artifact._id,{workflowRunId:delegatedSource._id},{workflowRunId:artifact.workflowRunId},true);
    await changedRecord('cross-tenant-artifact-denied',artifact._id,{tenantId:(await inspect(s.otherProjectId)).tenantId},{tenantId:artifact.tenantId},true);
    const handoff=await inspect(binding.handoffId);
    await changedRecord('missing-artifact-denied',handoff._id,{artifactIds:[]},{artifactIds:handoff.artifactIds},true);
    const trialEvidence=await inspect(delegated.evidenceIds[0]),trial=await inspect(trialEvidence.metadata.trialId);
    await changedRecord('revoked-delegation-denies-Result',trial._id,{cancelRequested:true},{cancelRequested:trial.cancelRequested??false});
    await check('anonymous-delegation-admission-denied',()=>assert.rejects(()=>mutate('factory/enterpriseCompatibility:admitTrial',{projectId:s.projectId,missionId,factoryDefinitionId:trial.factoryDefinitionId,binding:trial.binding},db.anonymous)));
    await check('anonymous-owner-gate-evaluation-denied',()=>assert.rejects(()=>mutate('factory/enterpriseQualification:evaluate',{workOrderId:delegated.workOrderId,idempotencyKey:'anonymous-result-no-execution'},db.anonymous)));
    await changedRecord('production-environment-denied',s.environmentId,{type:'prod'},{type:'dev'},true);
    const mission=await inspect(missionId);
    await fault(missionId,{ownerOperatorId:s.peerId});
    try{await check('same-tenant-Mission-owner-change-denied',()=>assert.rejects(()=>call(sameContext)));}
    finally{await fault(missionId,{ownerOperatorId:mission.ownerOperatorId});}
    const plan=await inspect(connection.resultScope.planId);
    await changedRecord('changed-approved-Plan-denied',plan._id,{summary:plan.summary+' changed'},{summary:plan.summary},true);
    await changedRecord('changed-Quality-Contract-denied',wo._id,{qualityContractDigest:'sha256:'+'0'.repeat(64)},{qualityContractDigest:wo.qualityContractDigest});
    await check('restart-durable-readback-without-redispatch',async()=>{await db.restart();assert.equal((await call()).receipt.response.status,'AVAILABLE');});
    await check('lost-read-ack-reconciles-with-new-read-only-observation',async()=>{
      const original=globalThis.fetch,ctx=context();let lose=true;
      globalThis.fetch=async(url,options)=>{const reply=await original(url,options);if(lose&&String(url).endsWith('/api/action')){lose=false;await reply.arrayBuffer();throw Error('LOST_RESULT_ACK');}return reply;};
      try{await assert.rejects(()=>call(ctx));assert.equal((await call(ctx)).receipt.response.status,'AVAILABLE');}finally{globalThis.fetch=original;}
    });
    await mutate('sofieEnterprise:decide',{projectId:s.projectId,connectionId:connection.connectionId,decision:'REVOKE'});
    await check('revocation-denies-reconnect',()=>assert.rejects(()=>call(sameContext)));
    await check('consumer-never-dispatches-or-settles',async()=>assert.deepEqual(await db.owner.query('nativeFixture:inspect',{table:'workflowRuns'}),beforeRuns));
    result.actions=(await pool.query('SELECT status,count(*)::int AS count FROM action_requests GROUP BY status ORDER BY status')).rows;
    result.status='PASS';return result;
    }};
  } catch(error) {await stop();throw error;}
}
