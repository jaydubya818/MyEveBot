import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {BetaIntegration} from '../../lib/beta-integration/runtime.ts';
import {CanonicalBetaWork} from '../../lib/beta-integration/canonical-work.ts';
const url=process.env.MYEVE_TEST_DATABASE_URL;
if(url!=='postgresql://ux_fixture:local-only@localhost:55491/blocker_fixes')throw Error('Dedicated local UX database required');
const pool=new pg.Pool({connectionString:url});
const owner='11111111-1111-4111-8111-111111111111';
const beta=new BetaIntegration(pool,{repository:'synthetic/alpha-tasks',maxCostUsd:1.3,maxDurationSeconds:180});
try {
 if(process.argv[2]==='seed') {
  const {work}=await beta.store(owner).create({title:'Organize launch notes',objective:'Group the launch notes into a useful reading order.',repository:'synthetic/alpha-tasks',maxCostUsd:1.3,maxDurationSeconds:180,idempotencyKey:randomUUID(),criteria:[{id:randomUUID(),statement:'The owner chooses the grouping',method:'human'}]});
  const item=await new CanonicalBetaWork(beta).requestDecision(owner,work.id,'How should I organize your launch notes?',['By launch phase','By topic']);
  console.log(JSON.stringify({workId:work.id,item}));
 } else if(process.argv[2]==='pending') {
  const page=await beta.inbox(owner).list({view:'needs_you',workId:process.argv[3]});
  const item=page.items[0];
  if(!item?.action || !item.actionBinding)throw Error('Decision required');
  await beta.inbox(owner).respond({itemId:item.id,actionId:item.action.id,actionBinding:item.actionBinding,expectedRevision:item.revision,idempotencyKey:randomUUID(),answer:'By topic'});
 } else if(process.argv[2]==='cleanup' && /^[0-9a-f-]{36}$/.test(process.argv[3]??'')) {
  const id=process.argv[3];
  for(const table of ['inbox_attention_responses','inbox_attention_evidence','inbox_attention_items']) {
   const field=table==='inbox_attention_evidence'?"data#>>'{event,workId}'":"data->>'workId'";
   await pool.query(`DELETE FROM ${table} WHERE owner_id=$1 AND ${field}=$2`,[owner,id]);
  }
  for(const table of ['beta_work_continuations','beta_work_decisions'])await pool.query(`DELETE FROM ${table} WHERE owner_id=$1 AND work_id=$2`,[owner,id]);
  for(const table of ['engineering_work_events','engineering_work_criteria'])await pool.query(`DELETE FROM ${table} WHERE scope_id=$1 AND work_id=$2`,[owner,id]);
  await pool.query('DELETE FROM engineering_work WHERE scope_id=$1 AND id=$2',[owner,id]);
 } else throw Error('Fixture operation required');
} finally {await pool.end();}
