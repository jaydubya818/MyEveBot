#!/usr/bin/env node
// Operator-only. No execution, accounting, grant, migration or provider mutations.
import { readFile } from 'node:fs/promises';
import pg from 'pg';
const args=process.argv.slice(2),options=new Map();
for(let index=0;index<args.length;index++){
  const name=args[index];
  if(name==='--apply')options.set(name,true);
  else if(['--owner','--report','--revision','--status','--note-file'].includes(name)&&args[index+1])options.set(name,args[++index]);
  else throw Error('Usage: triage-feedback.mjs --owner OWNER [--report UUID --revision N --status TRIAGED|RESOLVED --note-file PATH] [--apply]');
}
const owner=options.get('--owner');
if(typeof owner!=='string'||!owner.trim()||owner.length>200)throw Error('Explicit owner required.');
const connectionString=process.env.MYEVE_BETA_FEEDBACK_OPERATOR_DATABASE_URL;
if(!connectionString)throw Error('Separately authorized operator database connection required.');
const pool=new pg.Pool({connectionString,max:1,connectionTimeoutMillis:5000,statement_timeout:5000});
const client=await pool.connect();
try{
  await client.query('BEGIN');
  await client.query("SELECT set_config('myeve.feedback_owner',$1,true)",[owner]);
  if(!options.has('--report')){
    if(options.has('--apply'))throw Error('A specific report and revision are required to apply triage.');
    const rows=(await client.query('SELECT id,revision,platform,title,impact,priority,status,created_at FROM unified_beta_feedback WHERE owner_id=$1 ORDER BY priority,created_at,id LIMIT 100',[owner])).rows;
    console.log(JSON.stringify({owner,mode:'READ_ONLY',reports:rows},null,2));
  }else{
    const report=options.get('--report'),revision=Number(options.get('--revision')),status=options.get('--status'),path=options.get('--note-file');
    if(typeof report!=='string'||!/^[a-f0-9-]{36}$/i.test(report)||!Number.isSafeInteger(revision)||revision<1
      ||!['TRIAGED','RESOLVED'].includes(status)||typeof path!=='string')throw Error('Exact report, revision, status and note file required.');
    const note=(await readFile(path,'utf8')).trim();
    if(!note||note.length>4000)throw Error('Triage note must contain 1–4000 characters.');
    const [current]=(await client.query('SELECT id,revision,status,title FROM unified_beta_feedback WHERE owner_id=$1 AND id=$2',[owner,report])).rows;
    if(!current||current.revision!==revision)throw Error('Report changed or is unavailable. Read the current report before triage.');
    if(options.has('--apply')){
      const changed=await client.query('UPDATE unified_beta_feedback SET status=$4,triage_note=$5 WHERE owner_id=$1 AND id=$2 AND revision=$3 RETURNING id,revision,status,triage_note',[owner,report,revision,status,note]);
      if(changed.rowCount!==1)throw Error('Report changed during triage; nothing was saved.');
      await client.query('COMMIT');console.log(JSON.stringify({mode:'APPLIED',report:changed.rows[0]},null,2));
    }else console.log(JSON.stringify({mode:'PREVIEW',owner,current,proposed:{status,note}},null,2));
  }
}finally{await client.query('ROLLBACK').catch(()=>{});client.release();await pool.end();}
