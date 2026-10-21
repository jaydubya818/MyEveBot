import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';

// This validates an upgrade in a new disposable database only. It neither
// connects to an installed accounting database nor grants execution authority.
test('QE accounting upgrade preserves legacy exposure and cannot reopen UNKNOWN or held Work',async()=>{
 const connection=process.env.MYEVE_EXTERNAL_ALPHA_TEST_DATABASE;
 expect(connection,'The upgrade qualification must not silently skip').toBeTruthy();
 const url=new URL(connection!);expect(['localhost','127.0.0.1']).toContain(url.hostname);
 const pg=createRequire(import.meta.url)('pg');
 const admin=new pg.Pool({connectionString:connection});
 const name='myapps_accounting_upgrade_'+randomUUID().replaceAll('-','');let pool:any;
 const pins=JSON.parse(readFileSync('docs/myapps/phase3/sources.json','utf8'));
 const sqlPath='apps/eve/lib/external-alpha/';
 try{
  await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;
  pool=new pg.Pool({connectionString:url.href});
  for(const file of ['shared-accounting.sql','shared-accounting-recovery.sql'])
   await pool.query(execFileSync('git',['show',`${pins.myeve.ux}:${sqlPath+file}`],{encoding:'utf8'}));
  const cohort=randomUUID(),owner=randomUUID(),admissions:string[]=[];
  await pool.query('INSERT INTO external_alpha_cohort(id)VALUES($1)',[cohort]);
  await pool.query('INSERT INTO external_alpha_cohort_member(cohort_id,slot,owner_id,policy_sha256,credential_sha256)VALUES($1,\'1\',$2,$3,$4)',[cohort,owner,'a'.repeat(64),'b'.repeat(64)]);
  for(const [index,state] of ['DISPATCHED','UNKNOWN','SETTLED'].entries()){
   const id=randomUUID();admissions.push(id);
   await pool.query(`INSERT INTO external_alpha_cohort_admission(id,cohort_id,owner_id,policy_sha256,kind,binding_sha256,request_sha256,day_index,ceiling_microusd,state,local_allowance_id,deadline)
    VALUES($1,$2,$3,$4,'WORK',$5,$6,0,1300000,'BOUND',$7,clock_timestamp()+interval '1 hour')`,[id,cohort,owner,'a'.repeat(64),String(index).repeat(64),'c'.repeat(64),randomUUID()]);
   await pool.query('INSERT INTO external_alpha_cohort_dispatch(admission_id,operation_sha256,state)VALUES($1,$2,$3)',[id,'d'.repeat(64),state]);
  }
  const snapshot=async()=>Promise.all(['external_alpha_cohort','external_alpha_cohort_member','external_alpha_cohort_admission','external_alpha_cohort_dispatch'].map(async table=>(await pool.query('SELECT to_jsonb(t) AS row FROM '+table+' t ORDER BY to_jsonb(t)::text')).rows));
  const before=await snapshot();
  const upgrade=readFileSync(sqlPath+'shared-accounting-recovery.sql','utf8');
  for(let attempt=0;attempt<2;attempt++){
   await pool.query('BEGIN');
   try{await pool.query(upgrade);await pool.query('COMMIT');}catch(error){await pool.query('ROLLBACK');throw error;}
   expect(await snapshot()).toEqual(before);
  }
  const move=(id:string,state:string)=>pool.query('UPDATE external_alpha_cohort_dispatch SET state=$2 WHERE admission_id=$1',[id,state]);
  await expect(move(admissions[1],'SETTLED')).rejects.toThrow('immutable');
  await expect(move(admissions[1],'RUNNING')).rejects.toThrow('immutable');
  await move(admissions[0],'RUNNING');await move(admissions[0],'FENCED');
  await expect(move(admissions[0],'RUNNING')).rejects.toThrow('immutable');
  expect((await pool.query('SELECT sum(ceiling_microusd)::text AS exposure FROM external_alpha_cohort_admission')).rows[0].exposure).toBe('3900000');
  expect((await pool.query('SELECT activated_at FROM external_alpha_cohort')).rows[0].activated_at).toBeNull();
 }finally{if(pool)await pool.end();await admin.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');await admin.end();}
});
