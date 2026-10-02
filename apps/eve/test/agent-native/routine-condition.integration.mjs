import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {ExecutionStore} from '../../lib/execution-store.ts';
import {routineConfigurationSchema} from '../../lib/execution-types.ts';
import {retainRoutineCheck} from '../../lib/routine-check.ts';
import {admissionFixture} from '../admission-fixtures.mjs';
const url=process.env.MYEVE_PRODUCT_TEST_DATABASE;
if(url!=='postgresql://postgres@127.0.0.1:55509/myeve_beta_publication')throw Error('Task-owned disposable database required');
const pool=new Pool({connectionString:url});
const client=await pool.connect();const schema=`routine_condition_${Date.now()}`;
let assertions=0;
function equal(actual,expected,message){assert.equal(actual,expected,message);assertions++;}
try{
 await client.query(`CREATE SCHEMA ${schema}`);await client.query(`SET search_path TO ${schema}`);
 const dir=new URL('../../migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await client.query(await readFile(new URL(file,dir),'utf8'));
 const db={query:async(sql,params)=>(await client.query(sql,params)).rows};
 const store=new ExecutionStore(db,admissionFixture(db));
 await client.query(`INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,risk_ceiling,max_steps,max_runtime_seconds,max_estimated_cost_usd) VALUES('watcher','watch-owner','watcher','Watcher','Research','Research',true,'active','medium',30,600,1)`);
 async function start(id,responsibility){
  const configuration=routineConfigurationSchema.parse({instructions:'Check public availability',authority:{maximumRisk:'medium',allowedCapabilities:responsibility?['web.read','tool.record_observation']:['web.read']},...(responsibility?{responsibility}:{})});
  await store.createRoutine({id,ownerId:'watch-owner',sourceKind:'manual',sourceId:id,name:id,agentId:'watcher',configuration,changedBy:'watch-owner'});
  const input={ownerId:'watch-owner',routineId:id,key:'once',scheduledFor:'2026-01-01T00:00:00Z'};
  await store.enqueue(input);await store.enqueue(input);
  equal((await db.query('SELECT count(*)::int AS n FROM execution_occurrences WHERE routine_id=$1',[id]))[0].n,1,'same trigger retained once');
  return store.claim('watch-owner',id,300);
 }
 const responsibility={condition:'Item is in stock',notify:'condition_met',stopWhenMet:false};
 const quiet=await start('quiet',responsibility);
 await assert.rejects(()=>store.complete(quiet,'fixture:quiet'),/retained check/);assertions++;
 await assert.rejects(()=>retainRoutineCheck(db,{...quiet,ownerId:'other-owner'},{condition:'met',summary:'No',evidenceReferences:['fixture:source']}));assertions++;
 await retainRoutineCheck(db,quiet,{condition:'not_met',summary:'Still unavailable.',evidenceReferences:['fixture:source']});
 await store.complete(quiet,'fixture:quiet');
 equal((await db.query('SELECT count(*)::int AS n FROM review_deliveries WHERE occurrence_id=$1',[quiet.occurrenceId]))[0].n,0,'quiet result does not create delivery');
 equal((await db.query('SELECT result_summary FROM task_runs WHERE id=$1',[quiet.runId]))[0].result_summary,'Still unavailable.');
 equal((await db.query("SELECT metadata->>'resultReference' AS ref FROM task_milestones WHERE task_id=$1 AND kind='routine_result'",[quiet.runId]))[0].ref,'fixture:quiet','quiet result remains durable');
 await assert.rejects(()=>store.complete(quiet,'fixture:duplicate'));assertions++;
 await assert.rejects(()=>retainRoutineCheck(db,quiet,{condition:'met',summary:'Late',evidenceReferences:['fixture:late']}));assertions++;
 const met=await start('stop',{...responsibility,stopWhenMet:true});
 await retainRoutineCheck(db,met,{condition:'met',summary:'Available now.',evidenceReferences:['fixture:source']});await store.complete(met,'fixture:met');
 equal((await db.query('SELECT status FROM execution_routines WHERE id=$1',['stop']))[0].status,'disabled');
 equal((await db.query('SELECT count(*)::int AS n FROM review_deliveries WHERE occurrence_id=$1',[met.occurrenceId]))[0].n,1);
 equal(await store.enqueue({ownerId:'watch-owner',routineId:'stop',key:'next',scheduledFor:'2026-01-02T00:00:00Z'}),null);
 const uncertain=await start('uncertain',responsibility);
 await retainRoutineCheck(db,uncertain,{condition:'unknown',summary:'The source could not confirm availability.',evidenceReferences:['fixture:source']});await store.complete(uncertain,'fixture:unknown');
 equal((await db.query('SELECT count(*)::int AS n FROM review_deliveries WHERE occurrence_id=$1',[uncertain.occurrenceId]))[0].n,1);
 const legacy=await start('legacy');await store.complete(legacy,'fixture:legacy');
 equal((await db.query('SELECT count(*)::int AS n FROM review_deliveries WHERE occurrence_id=$1',[legacy.occurrenceId]))[0].n,1,'legacy completion unchanged');
 const expired=await start('expired',responsibility);
 await retainRoutineCheck(db,expired,{condition:'met',summary:'Before interruption',evidenceReferences:['fixture:source']});
 await client.query("UPDATE execution_occurrences SET lease_expires_at=now()-interval '1 second' WHERE id=$1",[expired.occurrenceId]);
 equal(await store.recoverExpired('watch-owner'),1);await assert.rejects(()=>store.complete(expired,'fixture:late'));assertions++;
 console.log(JSON.stringify({category:'DETERMINISTIC',assertions,live:'NOT_RUN',differentTriggerCoalescing:'NOT_QUALIFIED'}));
}finally{await client.query('SET search_path TO public');await client.query(`DROP SCHEMA ${schema} CASCADE`);client.release();await pool.end();}
