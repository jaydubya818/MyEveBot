import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Env,connection} from '../../../apps/eve/lib/external-alpha/work-test-fixture.ts';

describe.skipIf(!connection)('operator-only exact RUNNING receipt recovery',()=>{
 let env:Env,role:string,operation:string,state:Record<string,unknown>;
 const app='synthetic-recovery-app',receipt='mutation:synthetic-recovery',requestHash='sha256:'+'a'.repeat(64);
 beforeEach(async()=>{
  env=await Env.create();role='myapps_recovery_'+env.name.slice(8);operation=randomUUID();
  state={profile:'alpha-tasks-node-json-v1',ownerId:env.owner,appId:app,revision:3,dataRevision:2,
   enabled:false,data:{next:2,tasks:[{id:1,title:'Saved before crash',done:false}]}};
  await env.pool.query('INSERT INTO myapps_installations(owner_id,app_id,creation_intent,state) VALUES($1,$2,$3,$4)',[env.owner,app,'synthetic-recovery',state]);
  await env.pool.query('INSERT INTO myapps_receipts(owner_id,app_id,id,request_hash,response) VALUES($1,$2,$3,$4,$5)',[env.owner,app,receipt,requestHash,{status:'RUNNING',operationId:operation}]);
  await env.pool.query(`CREATE ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  await env.pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await env.pool.query(`GRANT SELECT ON myapps_receipts,myapps_installations TO ${role}`);
  await env.pool.query(`GRANT UPDATE(response) ON myapps_receipts TO ${role}`);
  await env.pool.query(`GRANT UPDATE(owner_id) ON myapps_installations TO ${role}`);
  await env.pool.query(`GRANT INSERT ON myapps_audit TO ${role}`);
  await env.pool.query(`GRANT USAGE ON SEQUENCE myapps_audit_sequence_seq TO ${role}`);
 });
 afterEach(async()=>{
  if(env){if(role){await env.pool.query('DROP OWNED BY '+role);await env.pool.query('DROP ROLE '+role);}await env.close();}
 });
 async function recover(overrides:Record<string,string>={}){
  const inputs={owner:env.owner,app,receipt,operation,request_hash:requestHash,evidence_sha256:'b'.repeat(64),authorization:'synthetic-exact-incident-approval',...overrides};
  const sql=(await readFile(new URL('../../../scripts/unified-beta/recover-myapps-running.sql',import.meta.url),'utf8'))
   .replace(/^\\set ON_ERROR_STOP on\n/,'').replace(/:'([a-z_][a-z0-9_]*)'/g,(_,name:string)=>{
    if(!(name in inputs))throw Error('Unknown SQL parameter');return "'"+inputs[name as keyof typeof inputs].replaceAll("'","''")+"'";
   });
  const client=await env.pool.connect();
  try{await client.query('SET ROLE '+role);await client.query(sql);}
  catch(error){await client.query('ROLLBACK');throw error;}
  finally{await client.query('RESET ROLE');client.release();}
 }
 it('records cleanup evidence and prior response without changing data, then denies a repeated recovery',async()=>{
  await recover();
  expect((await env.pool.query('SELECT state FROM myapps_installations')).rows[0].state).toEqual(state);
  expect((await env.pool.query('SELECT response FROM myapps_receipts')).rows[0].response).toMatchObject({status:'DENIED',operationId:operation,cleanup:'CONFIRMED'});
  const audit=(await env.pool.query('SELECT actor,evidence FROM myapps_audit')).rows;
  expect(audit).toHaveLength(1);expect(audit[0]).toMatchObject({actor:role,evidence:{previousResponse:{status:'RUNNING',operationId:operation},evidenceSha256:'b'.repeat(64)}});
  await expect(recover()).rejects.toThrow('MYAPPS_RECOVERY_BINDING_DENIED');
  expect((await env.pool.query('SELECT count(*) FROM myapps_audit')).rows[0].count).toBe('1');
 });
 it.each(['COMPLETED','UNKNOWN'])('never clears a %s receipt',async status=>{
  await env.pool.query('UPDATE myapps_receipts SET response=$1',[{status,operationId:operation}]);
  await expect(recover()).rejects.toThrow('MYAPPS_RECOVERY_BINDING_DENIED');
  expect((await env.pool.query('SELECT response FROM myapps_receipts')).rows[0].response.status).toBe(status);
  expect((await env.pool.query('SELECT count(*) FROM myapps_audit')).rows[0].count).toBe('0');
 });
 it.each(['operation','request_hash','owner','evidence_sha256'])('rejects a mismatched %s before audit or mutation',async field=>{
  await expect(recover({[field]:'wrong'})).rejects.toThrow(/MYAPPS_RECOVERY/);
  expect((await env.pool.query('SELECT response FROM myapps_receipts')).rows[0].response.status).toBe('RUNNING');
  expect((await env.pool.query('SELECT count(*) FROM myapps_audit')).rows[0].count).toBe('0');
 });
});
