import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {neonConfig} from '@neondatabase/serverless';
import {createReminder,listRoutines,manageRoutine} from '../../agent/lib/reminders-db.ts';
import {routineOwner} from '../../agent/lib/routine-owner.ts';
const url=process.env.MYEVE_PRODUCT_TEST_DATABASE;
if(url!=='postgresql://postgres@127.0.0.1:55509/myeve_beta_publication')throw Error('Task-owned disposable database required');
process.env.DATABASE_URL=url;
const pool=new Pool({connectionString:url}),old=neonConfig.fetchFunction;
neonConfig.fetchFunction=async(_url,options)=>{const {query,params}=JSON.parse(options.body);const r=await pool.query({text:query,values:params,rowMode:'array',types:{getTypeParser:()=>v=>v}});return Response.json({fields:r.fields.map(f=>({name:f.name,dataTypeID:f.dataTypeID})),rows:r.rows,rowCount:r.rowCount,command:r.command,rowAsArray:true});};
const owner=`routine-owner-test-${Date.now()}`;let id;
try{
 const context={session:{id:'fixture',auth:{current:{principalId:owner,principalType:'user',attributes:{owner:'true'}}}}};
 assert.equal(routineOwner(context),owner);
 for(const patch of [{principalType:'service'},{attributes:{owner:'true',role:'guest'}},{attributes:{owner:'false'}}])assert.throws(()=>routineOwner({session:{...context.session,auth:{current:{...context.session.auth.current,...patch}}}}));
 assert.throws(()=>routineOwner({session:{...context.session,parent:{id:'parent'}}}));
 const routine=await createReminder({ownerId:owner,prompt:'Check public information',cron:'0 9 * * *',timezone:'UTC',nextFireAt:new Date('2027-01-01'),chatId:null,routineName:'Owner-scoped qualification'});id=routine.id;
 assert.equal((await listRoutines(owner)).length,1);assert.equal((await listRoutines(owner+'-other')).length,0);
 await assert.rejects(()=>manageRoutine({ownerId:owner+'-other',id,action:'pause'}),/not found/);
 assert.equal((await manageRoutine({ownerId:owner,id,action:'pause'})).status,'paused');
 assert.equal((await manageRoutine({ownerId:owner,id,action:'resume'})).status,'active');
 const changed=await manageRoutine({ownerId:owner,id,action:'update',prompt:'Check a revised public condition'});
 assert.equal(changed.configuration_version,2);assert.equal(changed.reviewed_version,null);
 console.log(JSON.stringify({category:'DETERMINISTIC',assertions:12,crossOwnerRead:0,crossOwnerWrite:0,naturalPromptCreation:'NOT_RUN'}));
}finally{if(id)await pool.query('DELETE FROM reminders WHERE id=$1 AND owner_id=$2',[id,owner]);neonConfig.fetchFunction=old;await pool.end();}
