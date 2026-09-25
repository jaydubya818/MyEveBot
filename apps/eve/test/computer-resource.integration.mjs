import {localSqlFixture} from './local-sql-fixture.mjs';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {neonConfig} from '@neondatabase/serverless';
import {Sandbox,Snapshot} from '@vercel/sandbox';
import {stopComputerSession} from '../lib/computer-sessions.ts';
import {bindPreparedComputer,withPreparedComputer,computerSandboxBackend} from '../lib/computer-sandbox-backend.ts';
import {resourceTags} from '../lib/computer-resource-store.ts';
import {SqlComputerTemplateStore} from '../lib/computer-template-store.ts';
process.env.DATABASE_URL='postgresql://myeve_test@resource.invalid/postgres';
import {ActionGateway,consumeComputerLifecycleAuthority,consumeActionAuthority,consumeProviderAuthority} from '../lib/action-gateway.ts';
import {ComputerResourceStore,computerResourceEnvironment,resourceBinding} from '../lib/computer-resource-store.ts';
process.env.VERCEL_TOKEN='fixture';process.env.VERCEL_TEAM_ID='team_fixture';process.env.VERCEL_PROJECT_ID='project_fixture';process.env.VERCEL_ENV='test';delete process.env.VERCEL;
globalThis.fetch=async()=>{throw new Error('Real providers forbidden');};
const pool=new Pool(localSqlFixture({host:'127.0.0.1',port:55442,user:'myeve_test',database:'postgres'}));
const client=await pool.connect();const schema=`resource_qualification_${Date.now()}`;
neonConfig.fetchFunction=async(_url,options)=>{
  const body=JSON.parse(options.body);
  const query=async({query,params})=>{const r=await client.query({text:query,values:params,rowMode:'array',types:{getTypeParser:()=>v=>v}});return {fields:r.fields.map(f=>({name:f.name,dataTypeID:f.dataTypeID})),rows:r.rows,rowCount:r.rowCount,command:r.command,rowAsArray:true};};
  if(!body.queries)return Response.json(await query(body));
  await client.query('BEGIN');try{const results=[];for(const q of body.queries)results.push(await query(q));await client.query('COMMIT');return Response.json({results});}catch(e){await client.query('ROLLBACK');throw e;}
};
const database={query:async(sql,args)=>(await client.query(sql,args)).rows};
const store=new ComputerResourceStore(database), gateway=new ActionGateway(database);
const environment=computerResourceEnvironment();let checks=0,effects=0,seq=0;
const check=async(name,work)=>{await work();checks++;console.log(`PASS ${name}`);};
const denied=error=>error.status==='denied';
const resources=new Map();let lastAuthority,lastRow;
const provider={async execute(operation,row,authority,s){
  await consumeComputerLifecycleAuthority(authority,operation,row);lastAuthority=authority;lastRow=row;
  assert.equal(await s.validClaim(row),true);
  const control=(await database.query('SELECT controller,owner_input_enabled FROM computer_control_leases WHERE computer_session_id=$1',[row.computer_session_id]))[0];
  const newer=(await database.query("SELECT id FROM computer_resource_lifecycles WHERE computer_session_id=$1 AND generation>$2 AND state='active'",[row.computer_session_id,row.generation])).length;
  if(control&&!newer){assert.equal(control.controller,'NONE');assert.equal(control.owner_input_enabled,false);}
  if(operation==='stop'){effects++;if(resources.has(row.resource_name))resources.set(row.resource_name,'stopped');}
  if(operation==='delete'){effects++;resources.delete(row.resource_name);}
  return operation!=='verify'||!resources.has(row.resource_name);
}};
async function fixture({owner='owner',session=`session_${++seq}`,controller='AGENT',active=true,preparationId='preparation',snapshotId='shared_snapshot'}={}){
  const run=`run_${++seq}`;
  await client.query(`INSERT INTO task_runs(id,owner_id,kind,title,agent_id,status,max_duration_seconds,max_specialists,max_model_steps,max_retries_per_specialist,max_estimated_cost_usd)
    VALUES($1,$2,'delegated_work','Lifecycle','agent_'||$2,'running',600,0,30,0,1)`,[run,owner]);
  await client.query(`INSERT INTO computer_sessions(id,owner_id,agent_id,run_id,runtime_session_id,expires_at)
    VALUES($1,$2,'agent_'||$2,$3,$1,now()+interval '10 minutes')`,[session,owner,run]);
  await client.query(`INSERT INTO computer_control_leases(computer_session_id,owner_id,agent_id,run_id,controller) VALUES($1,$2,'agent_'||$2,$3,'AGENT')`,[session,owner,run]);
  await client.query(`INSERT INTO browser_sessions(id,computer_session_id) VALUES($1,$2)`,[`browser_${session}`,session]);
  let row=await store.establish({ownerId:owner,sessionId:session,runId:run,environment,provisionId:`provision_${seq}`,preparationId,snapshotId});
  if(active){row=await store.activate(row,`vm_${seq}`);await client.query("UPDATE computer_sessions SET status='ready',sandbox_id=$2 WHERE id=$1",[session,row.resource_name]);resources.set(row.resource_name,'running');}
  if(controller!=='AGENT')await client.query(`UPDATE computer_control_leases SET controller=$2,claimed_by=CASE WHEN $2='OWNER' THEN owner_id ELSE NULL END,
    expires_at=CASE WHEN $2='OWNER' THEN now()+interval '5 minutes' ELSE NULL END,owner_input_enabled=($2='OWNER') WHERE computer_session_id=$1`,[session,controller]);
  return row;
}
try {
  await client.query(`CREATE SCHEMA ${schema}`);await client.query(`SET search_path TO ${schema}`);
  const directory=new URL('../migrations/',import.meta.url);const files=(await readdir(directory)).filter(f=>f.endsWith('.sql')).sort();
  for(const file of files.filter(f=>f<'0032'))await client.query(await readFile(new URL(file,directory),'utf8'));
  for(const owner of ['owner','other','coldowner'])await client.query(`INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,max_steps,max_runtime_seconds,max_estimated_cost_usd)
    VALUES('agent_'||$1,$1,$1,'Fixture','Test','Test',false,'active',30,600,1)`,[owner]);
  await client.query(`INSERT INTO computer_sessions(id,owner_id,agent_id,runtime_session_id,status,expires_at) VALUES('legacy','owner','agent_owner','legacy','ready',now()+interval '5 minutes')`);
  await client.query(`INSERT INTO computer_control_leases(computer_session_id,owner_id,agent_id,controller) VALUES('legacy','owner','agent_owner','AGENT')`);
  await client.query(await readFile(new URL('0032_computer_resource_lifecycles.sql',directory),'utf8'));
  await client.query(await readFile(new URL('0034_conversation_runs.sql',directory),'utf8'));
  await check('upgrade fences unbound legacy without false ownership',async()=>{
    assert.equal((await client.query("SELECT status FROM computer_sessions WHERE id='legacy'")).rows[0].status,'lost');
    assert.equal((await client.query('SELECT count(*) FROM computer_resource_lifecycles')).rows[0].count,'0');
    assert.equal((await client.query("SELECT controller FROM computer_control_leases WHERE computer_session_id='legacy'")).rows[0].controller,'NONE');
  });
  await client.query(`INSERT INTO computer_template_preparations(id,scope,fingerprint,provider,state,deadline,template_id) VALUES('preparation','fixture','fixture','vercel','READY',now()+interval '5 minutes','shared_snapshot')`);
  const row=await fixture({controller:'OWNER'});const binding=resourceBinding(row);
  await check('canonical creation and exact lookup',async()=>{assert.equal((await store.exact(binding)).id,row.id);assert.equal(row.generation,1);});
  for(const [field,value] of [['ownerId','other'],['environment','production'],['sessionId','wrong'],['resourceName','forged'],['generation',2],['id','missing'],['version',22]]){
    await check(`${field} mismatch DENY / zero provider calls`,async()=>{const before=effects;await assert.rejects(gateway.terminateOwnedComputer({binding:{...binding,[field]:value},initiator:'owner',controlVersion:1},provider),denied);assert.equal(effects,before);});
  }
  for(const column of ['owner_id','environment','resource_name','computer_session_id','provision_id'])await check(`${column} immutable in PostgreSQL`,async()=>{
    await assert.rejects(client.query(`UPDATE computer_resource_lifecycles SET ${column}='forged' WHERE id=$1`,[row.id]),/immutable/);
  });
  await check('active resource cannot claim automatic reason',async()=>{const before=effects;await assert.rejects(gateway.terminateOwnedComputer({binding,initiator:'system'},provider),denied);assert.equal(effects,before);});
  await check('forged Agent authority denied during OWNER control',async()=>{const before=effects;await assert.rejects(gateway.terminateOwnedComputer({binding,initiator:'agent',controlVersion:1,agentAuthority:{}},provider),denied);assert.equal(effects,before);});
  await check('OWNER Stop fences input and terminates exact resource',async()=>{assert.equal((await gateway.terminateOwnedComputer({binding,initiator:'owner',controlVersion:1},provider)).verified,true);assert.equal(resources.has(row.resource_name),false);assert.equal((await client.query('SELECT status FROM computer_sessions WHERE id=$1',[row.computer_session_id])).rows[0].status,'stopped');});
  await check('consumed lifecycle handle replay denies',async()=>{await assert.rejects(consumeComputerLifecycleAuthority(lastAuthority,'verify',lastRow),denied);});
  for(const capability of ['computer.session.create','browser.navigate','browser.type','file.write','email.send','messaging.send','phone.call','connected_app.write']){
    await check(`cleanup authority cannot execute ${capability}`,async()=>{await assert.rejects(consumeActionAuthority(lastAuthority,{},capability),denied);await assert.rejects(consumeProviderAuthority(lastAuthority,{},capability),denied);});
  }
  const tombstone=(await database.query('SELECT * FROM computer_resource_lifecycles WHERE id=$1',[row.id]))[0];
  await check('terminal tombstone repeated owner cleanup no provider effects',async()=>{const before=effects;await gateway.terminateOwnedComputer({binding:resourceBinding(tombstone),initiator:'owner',controlVersion:2},provider);assert.equal(effects,before);});
  for(const mode of ['cancelled','completed','timeout','expired','orphan','revocation','failure'])await check(`automatic ${mode} cleanup`,async()=>{
    const resource=await fixture();
    if(mode==='orphan')await client.query('DELETE FROM computer_sessions WHERE id=$1',[resource.computer_session_id]);
    else if(mode==='revocation')await client.query("UPDATE agents SET status='paused' WHERE id='agent_owner'");
    else if(mode==='timeout')await client.query("UPDATE task_runs SET deadline_at=now()-interval '1 second' WHERE id=$1",[resource.run_id]);
    else if(mode==='expired')await client.query("UPDATE computer_sessions SET expires_at=now()-interval '1 second' WHERE id=$1",[resource.computer_session_id]);
    else if(mode==='failure')await client.query("UPDATE computer_sessions SET status='failed',failure_code='fixture',completed_at=now() WHERE id=$1",[resource.computer_session_id]);
    else await client.query('UPDATE task_runs SET status=$2 WHERE id=$1',[resource.run_id,mode]);
    await gateway.terminateOwnedComputer({binding:resourceBinding(resource),initiator:'system'},provider);
    assert.equal(resources.has(resource.resource_name),false);
    assert.equal((await client.query('SELECT state FROM computer_resource_lifecycles WHERE id=$1',[resource.id])).rows[0].state,'cleaned');
    await client.query("UPDATE agents SET status='active' WHERE id='agent_owner'");
  });
  await check('late cleanup N cannot fence or terminate replacement N+1',async()=>{
    const old=await fixture();const claim=await store.claim(resourceBinding(old),'owner',1);assert.ok(claim);
    await store.finish(claim,false);
    await client.query("UPDATE computer_sessions SET status='provisioning',sandbox_id=NULL WHERE id=$1",[old.computer_session_id]);
    await client.query("UPDATE computer_control_leases SET controller='AGENT' WHERE computer_session_id=$1",[old.computer_session_id]);
    let next=await store.establish({ownerId:'owner',sessionId:old.computer_session_id,runId:old.run_id,environment,provisionId:'replacement',preparationId:'preparation',snapshotId:'shared_snapshot'});
    next=await store.activate(next,'new_vm');resources.set(next.resource_name,'running');
    await client.query("UPDATE computer_sessions SET status='ready',sandbox_id=$2 WHERE id=$1",[old.computer_session_id,next.resource_name]);
    await assert.rejects(gateway.terminateOwnedComputer({binding:resourceBinding(old),initiator:'system'},provider),denied);
    const currentOld=(await database.query('SELECT * FROM computer_resource_lifecycles WHERE id=$1',[old.id]))[0];
    await gateway.terminateOwnedComputer({binding:resourceBinding(currentOld),initiator:'system'},provider);
    assert.equal(resources.get(next.resource_name),'running');assert.equal(next.generation,2);
    assert.equal((await client.query('SELECT controller FROM computer_control_leases WHERE computer_session_id=$1',[old.computer_session_id])).rows[0].controller,'AGENT');
  });
  await check('failure persists pending claim and retry succeeds',async()=>{
    const row=await fixture();await assert.rejects(gateway.terminateOwnedComputer({binding:resourceBinding(row),initiator:'owner',controlVersion:1},{execute:async()=>{throw Error('fake failure');}}));
    const pending=(await database.query('SELECT * FROM computer_resource_lifecycles WHERE id=$1',[row.id]))[0];assert.equal(pending.state,'cleanup_pending');
    await gateway.terminateOwnedComputer({binding:resourceBinding(pending),initiator:'system'},provider);
  });
  await check('tombstone remains after ComputerSession deletion',async()=>{await client.query('DELETE FROM computer_sessions WHERE id=$1',[row.computer_session_id]);assert.equal((await database.query('SELECT state FROM computer_resource_lifecycles WHERE id=$1',[row.id]))[0].state,'cleaned');});
  await check('recovery lookup environment isolation',async()=>{assert.equal((await store.recoverable('production')).length,0);const due=await fixture();await client.query("UPDATE computer_sessions SET expires_at=now()-interval '1 second' WHERE id=$1",[due.computer_session_id]);assert.ok((await store.recoverable(environment)).some(r=>r.id===due.id));});
  await check('stale cleanup claim cannot consume provider authority',async()=>{
    const row=await fixture();let captured,claimed;
    const stalled={async execute(op,r,a){captured=a;claimed=r;await client.query("UPDATE computer_resource_lifecycles SET claimed_until=now()-interval '1 second' WHERE id=$1",[r.id]);await assert.rejects(consumeComputerLifecycleAuthority(a,op,r),denied);return false;}};
    await assert.rejects(gateway.terminateOwnedComputer({binding:resourceBinding(row),initiator:'owner',controlVersion:1},stalled));
    assert.ok(captured);assert.equal(resources.get(row.resource_name),'running');
  });
  await check('shared preparation cannot retire while an owned resource remains',async()=>{
    assert.equal(await new SqlComputerTemplateStore(database).cleaning('preparation','invalid_template'),null);
  });
  await check('bound approvals invalidated while unrelated approval and Run outcome remain',async()=>{
    const row=await fixture({controller:'OWNER'});
    for(const [id,target] of [['bound',row.resource_name],['unrelated','other_environment']]){
      await client.query(`INSERT INTO task_approval_decisions(id,task_id,owner_id,prompt,requested_by,action,action_class,binding_hash,risk,expires_at,status)
        VALUES($1,$2,'owner','Fixture','agent','Fixture','write',$1,'medium',now()+interval '1 hour','approved')`,[id,row.run_id]);
      await client.query(`INSERT INTO action_requests(id,owner_id,run_id,action_key,executor,trigger,capability_id,action_class,target,parameter_hash,safe_summary,decision,authority_source,status,computer_session_id,control_version,approval_id)
        VALUES($1,'owner',$2,$1,'{}','{}','browser.click','write',$3::jsonb,$1,'{}','REQUIRE_APPROVAL','fixture','awaiting_approval',$4,1,$1)`,[id,row.run_id,JSON.stringify({provider:'browser',account:row.computer_session_id,resource:'https://example.invalid/',environment:target}),row.computer_session_id]);
    }
    await gateway.terminateOwnedComputer({binding:resourceBinding(row),initiator:'owner',controlVersion:1},provider);
    assert.equal((await client.query("SELECT status FROM task_approval_decisions WHERE id='bound'")).rows[0].status,'invalidated');
    assert.equal((await client.query("SELECT status FROM task_approval_decisions WHERE id='unrelated'")).rows[0].status,'approved');
    assert.equal((await client.query('SELECT status FROM task_runs WHERE id=$1',[row.run_id])).rows[0].status,'running');
  });
  await check('application Owner Stop uses governed provider adapter and is idempotent',async()=>{
    const row=await fixture({controller:'OWNER'});const originalGet=Sandbox.get;
    Sandbox.get=async({name})=>{
      if(name!==row.resource_name||!resources.has(name))throw Object.assign(Error('missing'),{response:{status:404}});
      return {name,tags:resourceTags(row),get status(){return resources.get(name);},currentSnapshotId:row.source_snapshot_id,
        currentSession:()=>({sessionId:row.provider_session_id,status:resources.get(name)}),async stop(){effects++;resources.set(name,'stopped');},async delete(){effects++;resources.delete(name);}};
    };
    try{const stopped=await stopComputerSession('owner',row.computer_session_id);assert.equal(stopped.status,'stopped');assert.equal(stopped.control.controller,'NONE');
      const before=effects;await stopComputerSession('owner',row.computer_session_id);assert.equal(effects,before);
    }finally{Sandbox.get=originalGet;}
  });
  await check('canonical Gateway creation persists ownership before SDK create, then reconnects without create',async()=>{
    const fixtureRow=await fixture({active:false});
    // This row only reserved a name; canonical binding must be minted by its own consumed creation grant.
    await client.query('DELETE FROM computer_resource_lifecycles WHERE id=$1',[fixtureRow.id]);
    const originalCreate=Sandbox.create,originalGet=Sandbox.get;let created=0,remote,handle;
    Sandbox.create=async options=>{
      created++;const durable=(await database.query('SELECT * FROM computer_resource_lifecycles WHERE resource_name=$1',[options.name]))[0];assert.ok(durable);assert.equal(durable.run_id,fixtureRow.run_id);
      remote={name:options.name,tags:options.tags,status:'running',currentSession:()=>({sessionId:'canonical_vm'}),async update(){}};return remote;
    };
    Sandbox.get=async({name,resume})=>{assert.equal(name,remote.name);assert.equal(resume,false);return remote;};
    await client.query("INSERT INTO task_run_sessions(task_id,session_id,role) VALUES($1,$2,'orchestrator') ON CONFLICT DO NOTHING",[fixtureRow.run_id,fixtureRow.runtime_session_id]);
    const authorizedGateway=new ActionGateway(database,{evaluate:async()=>({decision:'ALLOW',source:'fixture',reason:'fixture'})});
    const request={ownerId:'owner',runId:fixtureRow.run_id,actionKey:'canonical-create',capabilityId:'computer.session.create',actionClass:'create',executor:{kind:'persistent-agent',agentId:'agent_owner'},trigger:{kind:'owner_chat',id:fixtureRow.runtime_session_id},parameters:{}};
    try{
      await authorizedGateway.execute(request,{resolveTarget:async()=>({provider:'sandbox',account:'owner',resource:fixtureRow.runtime_session_id}),
        async execute(params,authority){await consumeActionAuthority(authority,params,'computer.session.create');return withPreparedComputer({id:'preparation',state:'READY',templateId:'shared_snapshot'},authority,params,async()=>{
          const row=await bindPreparedComputer('owner',fixtureRow.computer_session_id,fixtureRow.run_id);
          handle=await computerSandboxBackend.create({sessionKey:fixtureRow.runtime_session_id,templateKey:null,runtimeContext:{appRoot:'.'}});
          await client.query("UPDATE computer_sessions SET sandbox_id=$2,status='ready' WHERE id=$1",[row.computer_session_id,row.resource_name]);
          return row;
        });},verify:async()=>({verified:true,receipt:{}})});
      assert.equal(created,1);const state=await handle.captureState();const reconnect=await computerSandboxBackend.create({sessionKey:fixtureRow.runtime_session_id,existingMetadata:state.metadata,templateKey:null,runtimeContext:{appRoot:'.'}});
      assert.equal(reconnect.session.id,handle.session.id);assert.equal(created,1);
      await client.query("UPDATE computer_control_leases SET controller='NONE',version=version+1 WHERE computer_session_id=$1",[fixtureRow.computer_session_id]);
      await assert.rejects(reconnect.session.setNetworkPolicy('deny-all'),/no longer executable/);
    }finally{Sandbox.create=originalCreate;Sandbox.get=originalGet;}
  });
  await check('actual Agent Stop retains capability denial and exact approval policy',async()=>{
    const {default:stopTool}=await import('../agent/tools/stop_computer_session.ts');
    const {decideApproval}=await import('../lib/approvals.ts');
    const row=await fixture();await client.query("INSERT INTO task_run_sessions(task_id,session_id,role) VALUES($1,$2,'orchestrator')",[row.run_id,row.runtime_session_id]);
    const principal={principalId:'owner',principalType:'user',attributes:{owner:'true',myeveAgentId:'agent_owner'}};
    const ctx={session:{id:row.runtime_session_id,auth:{current:principal,initiator:principal}},callId:'stop-policy'};
    const before=effects;await assert.rejects(stopTool.execute({},ctx),denied);assert.equal(effects,before);
    await client.query("INSERT INTO agent_capabilities(owner_id,agent_id,capability_id) VALUES('owner','agent_owner','computer.session.stop')");
    // A denied action is terminal; a newly authorized call gets a distinct action identity.
    ctx.callId='stop-authorized';
    await assert.rejects(stopTool.execute({},ctx),error=>error.status==='awaiting_approval');assert.equal(effects,before);
    const approval=(await database.query("SELECT id,binding_hash FROM task_approval_decisions WHERE task_id=$1 AND status='pending'",[row.run_id]))[0];assert.ok(approval);
    await decideApproval({ownerId:'owner',id:approval.id,bindingHash:approval.binding_hash,decision:'approved',decidedBy:'owner'});
    await client.query("UPDATE computer_control_leases SET controller='OWNER',claimed_by='owner',expires_at=now()+interval '5 minutes',owner_input_enabled=true WHERE computer_session_id=$1",[row.computer_session_id]);
    await assert.rejects(stopTool.execute({},ctx),/unavailable/);assert.equal(effects,before);
    await client.query("UPDATE computer_control_leases SET controller='AGENT',claimed_by=NULL,expires_at=NULL,owner_input_enabled=false WHERE computer_session_id=$1",[row.computer_session_id]);
    const originalGet=Sandbox.get;Sandbox.get=async({name})=>{if(name!==row.resource_name||!resources.has(name))throw Object.assign(Error('missing'),{response:{status:404}});
      return {name,tags:resourceTags(row),currentSnapshotId:row.source_snapshot_id,currentSession:()=>({sessionId:row.provider_session_id,status:resources.get(name)}),async stop(){effects++;resources.set(name,'stopped');},async delete(){effects++;resources.delete(name);}};};
    try{assert.equal((await stopTool.execute({},ctx)).session.status,'stopped');}finally{Sandbox.get=originalGet;}
  });
  await check('late provider creation is removed using retained tombstone',async()=>{
    const row=await fixture({active:false});await client.query("UPDATE computer_sessions SET status='failed',failure_code='fixture',completed_at=now() WHERE id=$1",[row.computer_session_id]);
    await gateway.terminateOwnedComputer({binding:resourceBinding(row),initiator:'system'},provider);
    resources.set(row.resource_name,'running');
    const tombstone=(await database.query('SELECT * FROM computer_resource_lifecycles WHERE id=$1',[row.id]))[0];
    await gateway.terminateOwnedComputer({binding:resourceBinding(tombstone),initiator:'system'},provider);assert.equal(resources.has(row.resource_name),false);
  });
  await check('two independent PostgreSQL workers cannot claim the same generation',async()=>{
    const row=await fixture();const second=await pool.connect();await second.query(`SET search_path TO ${schema}`);
    try{const other=new ComputerResourceStore({query:async(sql,args)=>(await second.query(sql,args)).rows});
      const results=await Promise.all([store.claim(resourceBinding(row),'owner',1),other.claim(resourceBinding(row),'owner',1)]);
      assert.equal(results.filter(Boolean).length,1);await store.finish(results.find(Boolean),false);
    }finally{second.release();}
  });
  await check('last-session application Stop retires owned template and reports Cold',async()=>{
    const {computerTemplateKey,computerRuntimeReadiness}=await import('../lib/computer-runtime.ts');
    const key=computerTemplateKey('coldowner');
    await client.query(`INSERT INTO computer_template_preparations(id,scope,fingerprint,provider,state,deadline,template_id) VALUES('coldprep',$1,$2,'vercel','READY',now()+interval '5 minutes','cold_snapshot')`,[key.scope,key.fingerprint]);
    const row=await fixture({owner:'coldowner',controller:'OWNER',preparationId:'coldprep',snapshotId:'cold_snapshot'});
    const originalGet=Sandbox.get,originalSnapshotGet=Snapshot.get;let parent=true,snapshot=true;
    Sandbox.get=async({name})=>{
      if(name==='myeve-preparation-coldprep'&&parent)return {name,status:'stopped',tags:{application:'myeve-template-v1',preparation:'coldprep',scope:key.scope,fingerprint:key.fingerprint},currentSnapshotId:'cold_snapshot',async stop(){},async delete(){parent=false;}};
      if(name!==row.resource_name||!resources.has(name))throw Object.assign(Error('missing'),{response:{status:404}});
      return {name,tags:resourceTags(row),currentSnapshotId:'cold_snapshot',currentSession:()=>({sessionId:row.provider_session_id,status:resources.get(name)}),async stop(){resources.set(name,'stopped');},async delete(){resources.delete(name);}};
    };
    Snapshot.get=async({snapshotId})=>{assert.equal(snapshotId,'cold_snapshot');return {status:snapshot?'created':'deleted',async delete(){snapshot=false;}};};
    try{assert.equal((await computerRuntimeReadiness('coldowner')).state,'READY');
      const stopped=await stopComputerSession('coldowner',row.computer_session_id);assert.equal(stopped.control.controller,'NONE');assert.equal((await computerRuntimeReadiness('coldowner')).state,'COLD');assert.equal(parent,false);assert.equal(snapshot,false);
    }finally{Sandbox.get=originalGet;Snapshot.get=originalSnapshotGet;}
  });
  // Each scenario exercises the actual Stop/Gateway and preparation provider adapter.
  // Named Sandbox deletion deliberately leaves the snapshot, matching Vercel.
  for (const mode of ['single','multiple','waiter','process-loss','delete-failure','already-absent','stop-failure','visibility-delay','cleanup-wins','reuse-wins']) {
    await check(`automatic post-stop template cleanup: ${mode}`, async()=>{
      const {computerTemplateKey,computerRuntimeReadiness}=await import('../lib/computer-runtime.ts');
      const {recoverComputerResources,retireUnusedComputerTemplate}=await import('../lib/computer-resource-recovery.ts');
      const owner=`cleanup-${mode}`, prep=`prep_${mode}`, snap=`snapshot_${mode}`;
      await client.query(`INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,max_steps,max_runtime_seconds,max_estimated_cost_usd)
        VALUES('agent_'||$1,$1,$1,'Fixture','Test','Test',false,'active',30,600,1)`,[owner]);
      const key=computerTemplateKey(owner),templates=new SqlComputerTemplateStore(database);
      await client.query(`INSERT INTO computer_template_preparations(id,scope,fingerprint,provider,state,deadline,template_id)
        VALUES($1,$2,$3,'vercel','READY',now()+interval '5 minutes',$4)`,[prep,key.scope,key.fingerprint,snap]);
      const first=await fixture({owner,controller:'OWNER',preparationId:prep,snapshotId:snap});
      const second=mode==='multiple'?await fixture({owner,controller:'OWNER',preparationId:prep,snapshotId:snap}):null;
      let parent=true,snapshot=mode!=='already-absent',failDelete=mode==='delete-failure',staleVisibility=mode==='visibility-delay',deletes=0;
      const get=Sandbox.get,snapshotGet=Snapshot.get;
      Sandbox.get=async({name})=>{
        if(name===`myeve-preparation-${prep}`&&parent)return {name,status:'stopped',tags:{application:'myeve-template-v1',preparation:prep,scope:key.scope,fingerprint:key.fingerprint},currentSnapshotId:snap,
          async stop(){if(mode==='stop-failure')throw Error('deterministic stop failure');},async delete(){parent=false;}};
        const owned=(await database.query('SELECT * FROM computer_resource_lifecycles WHERE resource_name=$1 AND owner_id=$2',[name,owner]))[0];
        if(!owned||!resources.has(name))throw {response:{status:404}};
        return {name,tags:resourceTags(owned),currentSnapshotId:snap,currentSession:()=>({sessionId:owned.provider_session_id,status:resources.get(name)}),async stop(){resources.set(name,'stopped');},async delete(){resources.delete(name);}};
      };
      Snapshot.get=async({snapshotId})=>{
        assert.equal(snapshotId,snap,'only exact persisted snapshot identity');
        return {status:snapshot||staleVisibility?'created':'deleted',async delete(){deletes++;if(failDelete)throw Error('deterministic snapshot delete failure');snapshot=false;}};
      };
      try {
        if(mode==='waiter')await templates.enter(key,'pending-waiter',Date.now()+60_000);
        if(mode==='process-loss'||mode==='reuse-wins'||mode==='cleanup-wins') {
          await gateway.terminateOwnedComputer({binding:resourceBinding(first),initiator:'owner',controlVersion:1},provider);
          assert.equal((await templates.current(key)).state,'READY','Stop committed before template callback');
          if(mode==='process-loss') {
            await client.query("UPDATE computer_resource_lifecycles SET created_at=now()-interval '2 days' WHERE id=$1",[first.id]);
            await recoverComputerResources(owner);
          } else if(mode==='reuse-wins') {
            const replacement=await fixture({owner,controller:'OWNER',preparationId:prep,snapshotId:snap});
            await retireUnusedComputerTemplate(owner);assert.equal(parent,true);assert.equal(snapshot,true);assert.equal(deletes,0);
            await stopComputerSession(owner,replacement.computer_session_id);
          } else {
            const token=await templates.cleaning(prep,'invalid_template');assert.ok(token);
            await assert.rejects(fixture({owner,preparationId:prep,snapshotId:snap}),/ownership could not be established/);
            await client.query("UPDATE computer_template_preparations SET deadline=now()-interval '1 second' WHERE id=$1",[prep]);
            await recoverComputerResources(owner);
            const next=await templates.claim(key,Date.now()+60_000);assert.ok(next);assert.notEqual(next.id,prep);
            await templates.enter(key,'replacement-waiter',Date.now()+60_000);
            assert.equal(await templates.ready(next.id,'replacement_snapshot'),true);
            // A stale worker can only address the old immutable preparation/snapshot.
            await templates.cleaned(prep,token,true,Date.now());
            assert.equal((await templates.current(key)).templateId,'replacement_snapshot');
            await templates.leave('replacement-waiter');
          }
        } else await stopComputerSession(owner,first.computer_session_id);
        assert.equal(resources.has(first.resource_name),false);
        assert.equal((await client.query('SELECT controller FROM computer_control_leases WHERE computer_session_id=$1',[first.computer_session_id])).rows[0].controller,'NONE');
        if(second||mode==='waiter') {
          assert.equal((await computerRuntimeReadiness(owner)).state,'READY');assert.equal(snapshot,true);assert.equal(deletes,0);
          if(second)await stopComputerSession(owner,second.computer_session_id);
          else {
            await templates.leave('pending-waiter');
            await client.query("UPDATE computer_resource_lifecycles SET created_at=now()-interval '2 days' WHERE id=$1",[first.id]);
            await recoverComputerResources(owner);
          }
        }
        if(mode==='delete-failure'||mode==='visibility-delay') {
          assert.equal((await computerRuntimeReadiness(owner)).state,'UNAVAILABLE');
          assert.equal((await templates.current(key)).state,'CLEANING');
          const before=deletes;await recoverComputerResources(owner);assert.equal(deletes,before,'cooldown prevents retry spin');
          failDelete=false;staleVisibility=false;
          await client.query("UPDATE computer_template_preparations SET deadline=now()-interval '1 second' WHERE id=$1",[prep]);
          await recoverComputerResources(owner);
        }
        assert.equal(parent,false);assert.equal(snapshot,false);
        if(mode!=='cleanup-wins') {
          assert.equal((await computerRuntimeReadiness(owner)).state,'COLD');
          const before=deletes;await stopComputerSession(owner,first.computer_session_id);await recoverComputerResources(owner);assert.equal(deletes,before);
        }
      } finally {Sandbox.get=get;Snapshot.get=snapshotGet;}
    });
  }
  await check('template retirement isolates owner, environment and deployment',async()=>{
    const {computerTemplateKey}=await import('../lib/computer-runtime.ts');
    const {retireUnusedComputerTemplate}=await import('../lib/computer-resource-recovery.ts');
    for(const [name,key] of [
      ['other-owner',computerTemplateKey('never-retire-other')],
      ['production',computerTemplateKey('never-retire',{...process.env,VERCEL_ENV:'production'})],
      ['new-deployment',computerTemplateKey('never-retire',{...process.env,VERCEL_DEPLOYMENT_ID:'new-deployment'})],
    ])await client.query(`INSERT INTO computer_template_preparations(id,scope,fingerprint,provider,state,deadline,template_id)
      VALUES($1,$2,$3,'vercel','READY',now()+interval '5 minutes',$1)`,[name,key.scope,key.fingerprint]);
    const get=Sandbox.get;let calls=0;Sandbox.get=async()=>{calls++;throw Error('foreign resource touched');};
    try {await retireUnusedComputerTemplate('never-retire');assert.equal(calls,0);
      assert.equal((await client.query("SELECT count(*) FROM computer_template_preparations WHERE id IN ('other-owner','production','new-deployment') AND state='READY'")).rows[0].count,'3');
    }finally{Sandbox.get=get;}
  });
  await check('global recovery survives removal of session, Run and Agent rows',async()=>{
    const row=await fixture({owner:'other'});
    await client.query('DELETE FROM computer_sessions WHERE id=$1',[row.computer_session_id]);
    await client.query('DELETE FROM task_runs WHERE id=$1',[row.run_id]);
    await client.query('DELETE FROM agents WHERE id=$1',[row.agent_id]);
    const originalGet=Sandbox.get;Sandbox.get=async({name})=>{if(name!==row.resource_name||!resources.has(name))throw Object.assign(Error('missing'),{response:{status:404}});
      return {name,tags:resourceTags(row),currentSnapshotId:row.source_snapshot_id,currentSession:()=>({sessionId:row.provider_session_id,status:resources.get(name)}),async stop(){resources.set(name,'stopped');},async delete(){resources.delete(name);}};};
    try{const {recoverComputerResources}=await import('../lib/computer-resource-recovery.ts');await recoverComputerResources();
      assert.equal(resources.has(row.resource_name),false);assert.equal((await client.query('SELECT state FROM computer_resource_lifecycles WHERE id=$1',[row.id])).rows[0].state,'cleaned');
    }finally{Sandbox.get=originalGet;}
  });
  console.log(`PASS ${checks} checks; real provider creations 0`);
} finally {await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);client.release();await pool.end();}
