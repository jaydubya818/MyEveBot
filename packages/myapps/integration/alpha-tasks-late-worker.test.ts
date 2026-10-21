import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {Env,connection} from '../../../apps/eve/lib/external-alpha/work-test-fixture.ts';
import {AlphaTasksApps,type AlphaTasksHost} from '../../../apps/eve/lib/myapps/alpha-tasks.ts';
import {digest} from '../src/alpha-tasks/contracts.ts';
// Synthetic source and an explicitly controlled worker, not installed execution evidence.
// @ts-ignore Pure Node test fixture independently hashes its source tree.
import {fixture} from '../test/alpha-tasks/fixtures.mjs';

describe.skipIf(!connection)('late MyApps worker cannot supersede durable recovery',()=>{
 let env:Env,role:string,appPool:pg.Pool,apps:AlphaTasksApps;
 let started:Promise<void>,release:()=>void;
 const f=fixture(),owner=f.pkg.origin.ownerId,id=f.pkg.appId;
 const human={ownerId:owner,actorId:owner,kind:'human' as const,allowedOperations:['apps.read','apps.manage','apps.install','apps.run']};
 beforeEach(async()=>{
  env=await Env.create();role='myapps_late_'+env.name.slice(8);
  const password=randomUUID();
  await env.pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  await env.pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  for(const {tablename} of (await env.pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'myapps_%'")).rows)
   await env.pool.query(`GRANT SELECT,INSERT,UPDATE ON ${tablename} TO ${role}`);
  await env.pool.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  const url=new URL(connection!);url.pathname='/'+env.name;url.username=role;url.password=password;
  appPool=new pg.Pool({connectionString:url.href});
  let announce!:()=>void;started=new Promise(resolve=>{announce=resolve;});
  const held=new Promise<void>(resolve=>{release=resolve;});
  const host:AlphaTasksHost={runtimeId:'controlled-worker-fixture',target:'synthetic',enabled:()=>true,
   assertProfile:()=>{},authorize:async()=>({workVersion:1,workGeneration:1,policyRevision:1}),source:async()=>f.closure,
   execute:async(pkg,_source,operation,_input,data,operationId)=>{
    announce();await held;
    const next=operation==='create'?{next:2,tasks:[{id:1,title:'Late task must not commit',done:false,priority:'Low' as const}]}:data;
    return {operationId,cleanup:'CONFIRMED',sourceClosureDigest:pkg.sourceClosureDigest,runtimeDigest:digest(pkg.runtime),data:next,output:next.tasks};
   }};
  apps=new AlphaTasksApps(appPool as any,host);await apps.prepare(human,f.pkg);
  // Only the pre-existing installed state is seeded. The race runs real admission/commit transactions.
  await env.pool.query(`UPDATE myapps_installations SET state=state||$1::jsonb WHERE owner_id=$2 AND app_id=$3`,
   [JSON.stringify({enabled:true,installedVersion:1,installedDigest:digest(f.pkg)}),owner,id]);
 });
 afterEach(async()=>{
  release?.();await appPool?.end();
  if(env){if(role){await env.pool.query('DROP OWNED BY '+role);await env.pool.query('DROP ROLE '+role);}await env.close();}
 });
 for(const operation of ['preview','create'] as const)for(const fence of ['recovery','unknown','replacement'] as const){
  it(`${operation} success rolls back after ${fence} fences the original worker`,async()=>{
   const before=(await env.pool.query('SELECT state FROM myapps_installations')).rows[0].state;
   const auditBefore=(await env.pool.query('SELECT count(*) FROM myapps_audit')).rows[0].count;
   const pending=(operation==='preview'?apps.preview(human,id,1):apps.operate(human,id,1,digest(f.pkg),'create',
    {title:'Late task must not commit',priority:'Low'},'late-worker')).then(value=>({value,error:null}),error=>({value:null,error}));
   await started;
   const receipt=(await env.pool.query("SELECT * FROM myapps_receipts WHERE response->>'status'='RUNNING'")).rows[0];
   expect(receipt).toBeDefined();
   if(fence==='recovery'){
    const inputs:Record<string,string>={owner,app:id,receipt:receipt.id,operation:receipt.response.operationId,
     request_hash:receipt.request_hash,evidence_sha256:'b'.repeat(64),authorization:'synthetic-late-worker-race'};
    const sql=(await readFile(new URL('../../../scripts/unified-beta/recover-myapps-running.sql',import.meta.url),'utf8'))
     .replace(/^\\set ON_ERROR_STOP on\n/,'').replace(/:'([a-z_][a-z0-9_]*)'/g,(_,name:string)=>"'"+inputs[name].replaceAll("'","''")+"'");
    const client=await env.pool.connect();
    try{await client.query(sql);}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
   }else{
    const response=fence==='unknown'?{status:'UNKNOWN',operationId:receipt.response.operationId,cleanup:'UNKNOWN'}:
     {status:'RUNNING',operationId:randomUUID()};
    await env.pool.query('UPDATE myapps_receipts SET response=$2 WHERE id=$1',[receipt.id,response]);
   }
   const fenced=(await env.pool.query('SELECT response FROM myapps_receipts WHERE id=$1',[receipt.id])).rows[0].response;
   release();const result=await pending;
   expect(result.error?.message).toBe('APP_OPERATION_FENCED');
   expect((await env.pool.query('SELECT response FROM myapps_receipts WHERE id=$1',[receipt.id])).rows[0].response).toEqual(fenced);
   expect((await env.pool.query('SELECT state FROM myapps_installations')).rows[0].state).toEqual(before);
   expect((await env.pool.query('SELECT count(*) FROM myapps_previews')).rows[0].count).toBe('0');
   expect(Number((await env.pool.query('SELECT count(*) FROM myapps_audit')).rows[0].count)).toBe(Number(auditBefore)+(fence==='recovery'?1:0));
  });
 }
});
