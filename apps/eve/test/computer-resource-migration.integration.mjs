import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {neonConfig} from '@neondatabase/serverless';
process.env.DATABASE_URL='postgresql://myeve_test@migration.invalid/postgres';process.env.MYEVE_OWNER_ID='migration_owner';
globalThis.fetch=async()=>{throw Error('Providers forbidden during migration qualification');};
const pool=new Pool({host:'127.0.0.1',port:55442,user:'myeve_test',database:'postgres'});const client=await pool.connect();
neonConfig.fetchFunction=async(_url,options)=>{
  const body=JSON.parse(options.body);
  const query=async({query,params})=>{const r=await client.query({text:query,values:params,rowMode:'array',types:{getTypeParser:()=>v=>v}});return {fields:r.fields.map(f=>({name:f.name,dataTypeID:f.dataTypeID})),rows:r.rows,rowCount:r.rowCount,command:r.command,rowAsArray:true};};
  if(!body.queries)return Response.json(await query(body));
  await client.query('BEGIN');try{const results=[];for(const q of body.queries)results.push(await query(q));await client.query('COMMIT');return Response.json({results});}catch(e){await client.query('ROLLBACK');throw e;}
};
let checks=0;
try{
  for(const mode of ['fresh','upgrade-empty','upgrade-active']){
    const schema=`resource_migration_${Date.now()}_${checks}`;await client.query(`CREATE SCHEMA ${schema}`);await client.query(`SET search_path TO ${schema}`);
    try{
      if(mode!=='fresh'){
        await client.query('CREATE TABLE sofie_schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz DEFAULT now())');
        const dir=new URL('../migrations/',import.meta.url);
        for(const f of (await readdir(dir)).filter(f=>f.endsWith('.sql')&&f<'0032').sort()){
          const sql=await readFile(new URL(f,dir),'utf8');await client.query(sql);await client.query('INSERT INTO sofie_schema_migrations(name,checksum) VALUES($1,$2)',[f,createHash('sha256').update(sql).digest('hex')]);
        }
        if(mode==='upgrade-active'){
          await client.query("INSERT INTO agents(id,owner_id,slug,name,role,instructions) VALUES('agent','migration_owner','agent','Agent','Test','Test')");
          await client.query("INSERT INTO computer_sessions(id,owner_id,agent_id,runtime_session_id,status,expires_at) VALUES('legacy','migration_owner','agent','legacy','ready',now()+interval '1 hour')");
          await client.query("INSERT INTO computer_control_leases(computer_session_id,owner_id,agent_id,controller) VALUES('legacy','migration_owner','agent','AGENT')");
        }
      }
      await import(`../scripts/migrate-database.ts?fixture=${mode}-${Date.now()}`);
      assert.equal((await client.query('SELECT count(*) FROM sofie_schema_migrations')).rows[0].count,'32');checks++;
      assert.equal((await client.query('SELECT count(*) FROM computer_resource_lifecycles')).rows[0].count,'0');checks++;
      if(mode==='upgrade-active'){assert.equal((await client.query("SELECT status FROM computer_sessions WHERE id='legacy'")).rows[0].status,'lost');checks++;}
      await import(`../scripts/migrate-database.ts?fixture=rerun-${mode}-${Date.now()}`);
      assert.equal((await client.query('SELECT count(*) FROM sofie_schema_migrations')).rows[0].count,'32');checks++;
      console.log(`PASS actual migration runner ${mode} and rerun`);
    }finally{await client.query(`DROP SCHEMA ${schema} CASCADE`);}
  }
  console.log(`PASS ${checks} migration assertions; real provider calls 0`);
}finally{client.release();await pool.end();}
