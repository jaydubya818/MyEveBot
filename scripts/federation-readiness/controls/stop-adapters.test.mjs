import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {relayRevocationAdapters} from './stop-adapters.mjs';
const {Pool}=createRequire('/Users/jaywest/relay/package.json')('pg');
test('real SQL revokes synthetic credentials/grants and denies every nonterminal request',async()=>{
 const url=process.env.FQ_TEST_DATABASE_URL;if(!url||new URL(url).hostname!=='127.0.0.1')throw Error('LOCAL_DATABASE_REQUIRED');
 const database='fq_relay_'+randomBytes(6).toString('hex'),admin=new Pool({connectionString:url});let pool;
 try{
  await admin.query(`CREATE DATABASE "${database}"`);const target=new URL(url);target.pathname=database;pool=new Pool({connectionString:target.href});
  await pool.query(`CREATE TABLE agent_credentials(account_id text,revoked_at timestamptz);CREATE TABLE federation_grants(account_id text,grantee_account_id text,status text,updated_at timestamptz);CREATE TABLE federation_requests(account_id text,target_account_id text,status text,inbox_status text,encrypted_payload jsonb,encrypted_result jsonb,updated_at timestamptz);`);
  await pool.query("INSERT INTO agent_credentials VALUES ('fq-a',NULL),('unrelated',NULL);INSERT INTO federation_grants VALUES('fq-a','fq-b','ACTIVE',NULL),('unrelated','other','ACTIVE',NULL);INSERT INTO federation_requests(account_id,target_account_id,status) SELECT 'fq-a','fq-b',unnest(ARRAY['CREATED','AUTHORIZED','DELIVERED','WAITING','ACCEPTED','RUNNING','COMPLETED']);");
  const adapters=relayRevocationAdapters(pool,{database,ownerIds:['fq-a','fq-b']});for(const action of Object.values(adapters))assert.equal(await action(),true);
  assert.equal((await pool.query("SELECT count(*) FROM federation_requests WHERE status='DENIED'")).rows[0].count,'6');assert.equal((await pool.query("SELECT count(*) FROM federation_requests WHERE status='COMPLETED'")).rows[0].count,'1');assert.equal((await pool.query("SELECT revoked_at FROM agent_credentials WHERE account_id='unrelated'")).rows[0].revoked_at,null);
 }finally{await pool?.end();await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH(FORCE)`);await admin.end();}
});
test('scope requires exact synthetic DB and synthetic owner IDs',()=>{assert.throws(()=>relayRevocationAdapters({}, {database:'production',ownerIds:['fq-a','fq-b']}));assert.throws(()=>relayRevocationAdapters({}, {database:'fq_relay_0123456789ab',ownerIds:['real-owner','fq-b']}));});
