import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Pool} from 'pg';
const pool=new Pool({host:'127.0.0.1',port:55441,database:'postgres',user:process.env.USER});
const schema=`action_upgrade_${Date.now()}`;
const client=await pool.connect();
try {
  await client.query(`CREATE SCHEMA ${schema}`);await client.query(`SET search_path TO ${schema}`);
  const directory=new URL('../migrations/',import.meta.url);
  for(const name of (await readdir(directory)).filter(n=>n.endsWith('.sql')&&n<'0026').sort())await client.query(await readFile(new URL(name,directory),'utf8'));
  await client.query(`INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,max_steps,max_runtime_seconds,max_estimated_cost_usd) VALUES('upgrade-agent','upgrade-owner','primary','Agent','Research','Research',true,'active',30,600,1)`);
  await client.query(`INSERT INTO task_runs(id,owner_id,kind,title,agent_id,status,max_duration_seconds,max_specialists,max_model_steps,max_retries_per_specialist,max_estimated_cost_usd) VALUES('upgrade-run','upgrade-owner','delegated_work','Upgrade fixture','upgrade-agent','running',600,0,30,0,1)`);
  await client.query(`INSERT INTO action_requests(id,owner_id,run_id,action_key,executor,trigger,capability_id,action_class,target,parameter_hash,decision,authority_source,status,provider_receipt,attempt_count) VALUES('action_upgrade','upgrade-owner','upgrade-run','one','{}','{}','tool.send_email','send','{}','original-hash','ALLOW','local','result_unknown','{"messageId":"preserved"}',1)`);
  await client.query(await readFile(new URL('0026_action_recovery_qualification.sql',directory),'utf8'));
  await client.query(await readFile(new URL('0027_relay_federation.sql',directory),'utf8'));
  await client.query(`INSERT INTO myeve_relay_grants(id,owner_id,document) VALUES('preserved-grant','upgrade-owner','{"capability":"knowledge.query"}')`);
  await client.query(await readFile(new URL('0028_routine_pending_send.sql',directory),'utf8'));
  assert.deepEqual((await client.query("SELECT document,status FROM myeve_relay_grants WHERE id='preserved-grant'")).rows[0],{document:{capability:'knowledge.query'},status:'active'});
  await client.query(await readFile(new URL('0029_routine_admission.sql',directory),'utf8'));
  assert.equal((await client.query('SELECT count(*) FROM routine_pending_sends')).rows[0].count,'0');
  const row=(await client.query("SELECT * FROM action_requests WHERE id='action_upgrade'")).rows[0];
  assert.equal(row.status,'result_unknown');assert.equal(row.parameter_hash,'original-hash');assert.equal(row.provider_receipt.messageId,'preserved');assert.equal(row.attempt_count,1);assert.equal(row.recovery_token,null);
  await client.query("UPDATE action_requests SET status='needs_you' WHERE id='action_upgrade'");
  await assert.rejects(client.query("UPDATE action_requests SET status='unknown_unsafe' WHERE id='action_upgrade'"));
  console.log('PASS: upgrade 0025 -> 0029 preserves action identity, receipt, binding and attempt; new recovery states accepted and unknown status rejected');
}finally {await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);client.release();await pool.end();}
