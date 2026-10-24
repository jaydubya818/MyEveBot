// Child of the selected Relay wire fixture. Uses only disposable local SQL/TLS.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile,readdir} from 'node:fs/promises';
import {Client} from 'pg';
import {neonConfig} from '@neondatabase/serverless';
import {relayMemoryRequest,relayMemoryAdapter,executeRelayMemory} from '../lib/relay/mcp-memory.ts';
import {ActionGateway} from '../lib/action-gateway.ts';
import {encryptSecret} from '../lib/relay/transport.ts';

assert(process.send,'Must run under the isolated selected-Relay fixture');
process.send({type:'ready'});
const [fixture]=await once(process,'message');
const adminUrl=new URL(process.env.RELAY_TEST_DATABASE_URL??'');
assert.equal(adminUrl.hostname,'127.0.0.1');assert.equal(adminUrl.port,'55482');
assert.equal(new URL(fixture.origin).protocol,'https:');assert.equal(new URL(fixture.origin).hostname,'127.0.0.1');
const admin=new Client({connectionString:adminUrl.href});await admin.connect();
const databaseName=`myeve_mcp_test_${process.pid}_${Date.now()}`;
await admin.query(`CREATE DATABASE ${databaseName}`);
const local=new URL(adminUrl);local.pathname=`/${databaseName}`;
const client=new Client({connectionString:local.href});await client.connect();
const database={query:async(sql,params)=>(await client.query(sql,params)).rows};
const previousNeon=neonConfig.fetchFunction;
let currentAction,currentAbort,lastMemoryId,fixturePolicy=true,checks=0;
const allCredentials=[fixture.a.credential,fixture.b.credential];
const ownerA='mcp-owner-a',ownerB='mcp-owner-b',agentA='mcp-agent-a',agentB='mcp-agent-b';
const context=(id,owner=ownerA,agent=agentA)=>{
  const principal={authenticator:'myeve-web-session',issuer:'myeve',principalId:owner,principalType:'user',subject:owner,
    attributes:{owner:'true',myeveAgentId:agent}};
  return {callId:id,session:{id:`mcp-session-${id}`,auth:{current:principal,initiator:principal}}};
};
let sequence=0;
async function mode(name){const id=++sequence;const response=once(process,'message');process.send({type:'mode',name,id});const[ack]=await response;assert.equal(ack.id,id);}
async function execute(id,input,owner=ownerA,agent=agentA,abortController=new AbortController()){
  currentAbort=abortController;
  currentAction=await relayMemoryRequest(context(id,owner,agent),input);
  return new ActionGateway(database,{evaluate:async()=>({decision:fixturePolicy?'ALLOW':'DENY',source:'isolated-test-only',reason:'Synthetic fixture authority; never runtime configuration'})})
    .execute(currentAction,relayMemoryAdapter(currentAction),abortController.signal);
}
async function check(name,work){await work();checks++;console.log(`PASS: ${name}`);}
const unknown=error=>error.status==='result_unknown';
async function restore(){
  fixturePolicy=true;
  await client.query("UPDATE myeve_relay_connections SET status='active',issuer=$1,address='relay://'||relay_owner_id||'/'||relay_agent_id WHERE owner_id=$2",[fixture.origin,ownerA]);
}
const onBoundary=async message=>{
  if(message?.type==='memory-created'){lastMemoryId=message.id;return;}
  if(message?.type!=='boundary')return;
  try{
    if(message.name==='rotate'){
      allCredentials.push(message.credential);
      await client.query("UPDATE myeve_relay_connections SET signing_key_id=signing_key_id||'-rotated',agent_credential_encrypted=$2 WHERE owner_id=$1",[ownerA,encryptSecret(ownerA,message.credential)]);
    }
    if(message.name==='revoke')await client.query("UPDATE myeve_relay_connections SET status='revoked' WHERE owner_id=$1",[ownerA]);
    if(message.name==='cancel-run')await client.query("UPDATE task_runs SET status='failed' WHERE owner_id=$1 AND id=$2",[ownerA,currentAction.runId]);
    if(message.name==='policy-denied')fixturePolicy=false;
    if(message.name==='abort-before-call')currentAbort.abort();
    process.send({type:'boundary-done',id:message.id});
  }catch{process.send({type:'boundary-failed',id:message.id});}
};
process.on('message',onBoundary);
try{
  process.env.DATABASE_URL='postgresql://fixture@mcp-memory-fixture.invalid/postgres';
  process.env.MYEVE_RELAY_ENABLED='true';process.env.MYEVE_RELAY_ORIGIN=fixture.origin;
  process.env.MYEVE_RELAY_ENCRYPTION_KEY='9'.repeat(64);
  neonConfig.fetchFunction=async(_url,options)=>{
    const body=JSON.parse(options.body);
    const query=async item=>{
      const result=await client.query({text:item.query,values:item.params,rowMode:'array',types:{getTypeParser:()=>v=>v}});
      return {fields:result.fields.map(f=>({name:f.name,dataTypeID:f.dataTypeID})),rows:result.rows,rowCount:result.rowCount,command:result.command,rowAsArray:true};
    };
    if(!body.queries)return Response.json(await query(body));
    const results=[];for(const item of body.queries)results.push(await query(item));return Response.json({results});
  };
  const migrations=new URL('../migrations/',import.meta.url);
  for(const file of(await readdir(migrations)).filter(f=>f.endsWith('.sql')).sort())await client.query(await readFile(new URL(file,migrations),'utf8'));
  for(const[owner,agent,remote]of[[ownerA,agentA,fixture.a],[ownerB,agentB,fixture.b]]){
    await client.query("INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,max_steps,max_runtime_seconds,max_estimated_cost_usd) VALUES($1,$2,'sofie','Fixture','Test','Test',true,'active',30,600,1)",[agent,owner]);
    await client.query(`INSERT INTO myeve_relay_connections(owner_id,local_agent_id,relay_owner_id,relay_agent_id,address,issuer,signing_key_id,signing_public_key,agent_credential_encrypted,owner_session_encrypted)
      VALUES($1,$2,$3,$4,$5,$6,'fixture-key','fixture-public-key',$7,$8)`,[owner,agent,remote.accountId,remote.agentId,`relay://${remote.accountId}/${remote.agentId}`,fixture.origin,
      encryptSecret(owner,remote.credential),encryptSecret(owner,'OWNER_COOKIE_MUST_NEVER_LEAVE')]);
  }
  await mode('real');
  await check('canonical owner/Agent resolver and real selected Relay add complete',async()=>{
    const outcome=await execute('positive-add',{operation:'add',content:'Disposable canonical resolver memory.'});
    assert.equal(outcome.receipt.status,'completed');assert.equal(outcome.receipt.operation,'add');
    assert.equal(JSON.stringify(outcome).includes('Disposable canonical'),false);
  });
  await check('second owner uses its own credential and private memory scope',async()=>{
    await execute('owner-b-list',{operation:'list',limit:10},ownerB,agentB);
  });
  await check('get uses the private memory identifier; completed read does not resend',async()=>{
    await mode('real');assert(lastMemoryId);
    const first=await execute('positive-get',{operation:'get',id:lastMemoryId});
    const second=await execute('positive-get',{operation:'get',id:lastMemoryId});
    assert.equal(first.actionId,second.actionId);assert.deepEqual(first.receipt,second.receipt);
  });
  await check('unregistered canonical capability denies without network authority',async()=>{
    await assert.rejects(executeRelayMemory(context('default-deny'),{operation:'list',limit:10}),e=>e.status==='denied');
  });
  await check('foreign Agent and conflicting signed Agent fail before transport',async()=>{
    await assert.rejects(relayMemoryRequest(context('foreign',ownerA,agentB),{operation:'list',limit:10}));
    const ctx=context('conflicting');ctx.session.auth.initiator={...ctx.session.auth.initiator,attributes:{owner:'true',myeveAgentId:agentB}};
    await assert.rejects(relayMemoryRequest(ctx,{operation:'list',limit:10}));
  });
  await check('unknown operation, owner override and caller authenticator fail closed',async()=>{
    await assert.rejects(relayMemoryRequest(context('unknown'),{operation:'search',query:'no'}));
    await assert.rejects(relayMemoryRequest(context('override'),{operation:'list',limit:10,ownerId:ownerB}));
    const ctx=context('unsigned');ctx.session.auth.current.authenticator='untrusted';
    await assert.rejects(relayMemoryRequest(ctx,{operation:'list',limit:10}));
  });
  await check('issuer, Relay address/account and inactive connection mismatch deny',async()=>{
    for(const sql of["issuer='https://wrong.invalid'","address='relay://foreign/agent'","local_agent_id='mcp-agent-b'"]){
      await client.query(`UPDATE myeve_relay_connections SET ${sql} WHERE owner_id=$1`,[ownerA]);
      await assert.rejects(execute('mismatch-'+checks+'-'+sql,{operation:'list',limit:10}),e=>e.status==='denied');
      await client.query("UPDATE myeve_relay_connections SET local_agent_id=$1 WHERE owner_id=$2",[agentA,ownerA]);await restore();
    }
  });
  for(const name of['rotate','revoke','cancel-run','policy-denied','abort-before-call'])await check(`fresh ${name} after discovery prevents tool transmission`,async()=>{
    await mode(name);await assert.rejects(execute(name,{operation:'list',limit:10}),unknown);await restore();
  });
  for(const name of['rpc-error','tool-error','redirect','too-large','drop-response','hold-initialize','hold-list','init-202','init-wrong-id'])await check(`${name} is bounded and remains UNKNOWN without automatic resend`,async()=>{
    await mode(name);const start=Date.now();await assert.rejects(execute(name,{operation:'list',limit:10}),unknown);assert(Date.now()-start<12000);
    const row=(await client.query('SELECT status,attempt_count FROM action_requests WHERE owner_id=$1 AND action_key=$2',[ownerA,`tool:${name}`])).rows[0];
    assert.deepEqual(row,{status:'result_unknown',attempt_count:1});
  });
  await check('caller cancellation aborts initializing TLS request',async()=>{
    await mode('hold-initialize');const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),200);
    const start=Date.now();try{await assert.rejects(execute('caller-cancel',{operation:'list',limit:10},ownerA,agentA,abort),unknown);assert(Date.now()-start<2000);}finally{clearTimeout(timer);}
  });
  await mode('real');
  await check('fresh operation reconnects after credential/key rotation',async()=>{
    await execute('after-rotation',{operation:'list',limit:10});
  });
  await check('both external alpha installation names deny before resolver/network',async()=>{
    for(const slot of[1,2]){
      process.env.EVE_PROJECT_NAME=`myeve-alpha-tester-${slot}`;
      await assert.rejects(executeRelayMemory(context('alpha-'+slot),{operation:'list',limit:10}),/EXTERNAL_ALPHA_PAID_PATH_DENIED/);
    }delete process.env.EVE_PROJECT_NAME;
  });
  const receipts=(await client.query('SELECT provider_receipt,safe_summary FROM action_requests')).rows;
  assert.equal(JSON.stringify(receipts).includes('OWNER_COOKIE_MUST_NEVER_LEAVE'),false);
  for(const credential of allCredentials)assert.equal(JSON.stringify(receipts).includes(credential),false);
  process.send({type:'result',checks,status:'PASS_SCOPED_CANONICAL_MCP'});
}finally{
  process.off('message',onBoundary);neonConfig.fetchFunction=previousNeon;
  await client.end();await admin.query(`DROP DATABASE ${databaseName} WITH (FORCE)`);await admin.end();
  process.disconnect();
}
