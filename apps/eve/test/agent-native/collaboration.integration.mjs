import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {readCollaboration} from '../../lib/product/collaboration.ts';
const url=process.env.MYEVE_PRODUCT_TEST_DATABASE;
if(url!=='postgresql://postgres@127.0.0.1:55509/myeve_beta_publication')throw Error('Task-owned disposable database required');
const pool=new Pool({connectionString:url});const client=await pool.connect();const schema=`collaboration_${Date.now()}`;
try{
 await client.query(`CREATE SCHEMA ${schema}`);await client.query(`SET search_path TO ${schema}`);
 const dir=new URL('../../migrations/',import.meta.url);for(const file of(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await client.query(await readFile(new URL(file,dir),'utf8'));
 for(const owner of ['one','two']){
  await client.query(`INSERT INTO agents(id,owner_id,slug,name,role,instructions) VALUES($1,$2,'sofie','Sofie','Coordinator','Coordinate bounded work')`,['agent-'+owner,owner]);
  await client.query(`INSERT INTO myeve_relay_connections(owner_id,local_agent_id,relay_owner_id,relay_agent_id,address,issuer,signing_key_id,signing_public_key,agent_credential_encrypted,owner_session_encrypted) VALUES($1,$2,$1,'sofie',$3,'fixture','fixture','fixture','SECRET-CREDENTIAL','SECRET-SESSION')`,[owner,'agent-'+owner,'relay://'+owner+'/sofie']);
  for(const id of ['request-1','request-2'])await client.query(`INSERT INTO myeve_relay_requests(owner_id,request_id,direction,capability,conversation_id,sender_owner_id,sender_agent_id,envelope_hash,envelope_encrypted,result_encrypted,expires_at,state) VALUES($1,$2,'incoming','message.send','shared-correlation-name',$1,$3,'fixture','PRIVATE-MEMORY','PRIVATE-RESULT',now()+interval '1 day','completed')`,[owner,id,'sender-'+owner]);
 }
 const db={query:async(sql,params)=>{assert.ok(sql.trim().startsWith('SELECT'),'projection cannot mutate');return(await client.query(sql,params)).rows;}};
 const one=await readCollaboration(db,'one');assert.equal(one.connection.agentId,'agent-one');assert.equal(one.conversations.length,1);assert.equal(one.conversations[0].requests.length,2);assert.equal(one.groupExecutionQualified,false);
 assert.ok(one.conversations[0].requests.every(r=>r.sender==='relay://one/sender-one'));
 const serialized=JSON.stringify(one);for(const forbidden of ['PRIVATE-MEMORY','PRIVATE-RESULT','SECRET-CREDENTIAL','SECRET-SESSION','sender-two'])assert.ok(!serialized.includes(forbidden));
 const absent=await readCollaboration(db,'absent');assert.equal(absent.connection,null);assert.equal(absent.conversations.length,0);
 await client.query(`INSERT INTO myeve_relay_requests(owner_id,request_id,direction,capability,sender_owner_id,sender_agent_id,envelope_hash,expires_at) VALUES('one','uncorrelated','incoming','message.send','one','sender-one','fixture',now())`);
 const next=await readCollaboration(db,'one');assert.equal(next.conversations.length,2);assert.ok(next.conversations.some(c=>!c.correlated&&c.requests.length===1));
 console.log(JSON.stringify({category:'DETERMINISTIC',assertions:14,groupExecution:'NOT_QUALIFIED',liveRelay:'NOT_RUN',privatePayloadSelected:false}));
}finally{await client.query('SET search_path TO public');await client.query(`DROP SCHEMA ${schema} CASCADE`);client.release();await pool.end();}
