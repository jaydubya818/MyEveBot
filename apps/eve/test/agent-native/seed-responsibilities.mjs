import {Pool} from 'pg';
import {ExecutionStore} from '../../lib/execution-store.ts';
import {RoutineReviewStore} from '../../lib/routine-review.ts';
import {routineConfigurationSchema} from '../../lib/execution-types.ts';
import {retainRoutineCheck} from '../../lib/routine-check.ts';
import {admissionFixture} from '../admission-fixtures.mjs';
if(process.env.MYEVE_PRODUCT_TEST_PORT && !/^[0-9]{1,5}$/.test(process.env.MYEVE_PRODUCT_TEST_PORT))throw Error('Numeric disposable loopback port required');
const url=process.env.MYEVE_PRODUCT_TEST_DATABASE;
if(url!==`postgresql://postgres@127.0.0.1:${process.env.MYEVE_PRODUCT_TEST_PORT??'55509'}/myeve_beta_publication`)throw Error('Task-owned disposable database required');
const pool=new Pool({connectionString:url});const db={query:async(q,p)=>(await pool.query(q,p)).rows};
try{
 await db.query(`INSERT INTO agents(id,owner_id,slug,name,role,instructions,risk_ceiling) VALUES('agent-native-watch-e','owner','agent-native-watch-e','Personal Shopper','Availability researcher','Review public availability.','medium') ON CONFLICT(id) DO NOTHING`);
 for(const capability of ['web.read','tool.record_observation'])await db.query(`INSERT INTO agent_capabilities(owner_id,agent_id,capability_id) VALUES('owner','agent-native-watch-e',$1) ON CONFLICT DO NOTHING`,[capability]);
 const existing=await db.query("SELECT id FROM reminders WHERE owner_id='owner' AND routine_name='Product qualification availability check'");
 if(existing.length){console.log('Existing task-owned responsibility fixture retained');process.exitCode=0;}else{
  const [reminder]=await db.query(`INSERT INTO reminders(owner_id,prompt,cron,timezone,next_fire_at,routine_name) VALUES('owner','Check public availability.','0 9 * * *','America/Los_Angeles',now(),'Product qualification availability check') RETURNING id`);
  const configuration=routineConfigurationSchema.parse({instructions:'Check public availability.',authority:{allowedCapabilities:['web.read','tool.record_observation'],maximumRisk:'medium'},limits:{maxSteps:20,maxRuntimeSeconds:300,maxCostUsd:1},responsibility:{condition:'Item available',notify:'condition_met',stopWhenMet:false}});
  const routine=await new RoutineReviewStore(db,'owner').review({ownerId:'owner',reminderId:reminder.id,expectedVersion:1,agentId:'agent-native-watch-e',configuration});
  const store=new ExecutionStore(db,admissionFixture(db));await store.enqueue({ownerId:'owner',routineId:routine.id,key:'fixture-check',scheduledFor:'2026-01-01T00:00:00Z'});
  const claim=await store.claim('owner','responsibility-fixture',300);if(!claim||claim.routineId!==routine.id)throw Error('Unexpected pending fixture');
  await retainRoutineCheck(db,claim,{condition:'met',summary:'The controlled listing is available. No purchase was made.',evidenceReferences:['fixture:public-listing']});await store.complete(claim,'fixture:availability-result');
  console.log(JSON.stringify({category:'DETERMINISTIC',routine:routine.id,modelCalls:0,providerCalls:0}));
 }
}finally{await pool.end();}
