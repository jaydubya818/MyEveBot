import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {neonConfig} from '@neondatabase/serverless';
import {BetaIntegration} from '../../lib/beta-integration/runtime.ts';
import {readAgentHome} from '../../lib/product/agent-home.ts';
import {createAgent,duplicateAgent} from '../../lib/agents.ts';
const url=process.env.MYEVE_PRODUCT_TEST_DATABASE;
if(url!=='postgresql://postgres@127.0.0.1:55509/myeve_beta_publication')throw Error('Task-owned disposable database required');
process.env.DATABASE_URL=url;
const pool=new Pool({connectionString:url});const beta=new BetaIntegration(pool,{repository:'fixture/repo',maxCostUsd:1.35,maxDurationSeconds:600});
const old=neonConfig.fetchFunction;
neonConfig.fetchFunction=async(_url,options)=>{
 const body=JSON.parse(options.body), client=await pool.connect();
 const execute=async({query,params})=>{const r=await client.query({text:query,values:params,rowMode:'array',types:{getTypeParser:()=>v=>v}});return {fields:r.fields.map(f=>({name:f.name,dataTypeID:f.dataTypeID})),rows:r.rows,rowCount:r.rowCount,command:r.command,rowAsArray:true};};
 try{if(body.queries){await client.query('BEGIN');try{const results=[];for(const q of body.queries)results.push(await execute(q));await client.query('COMMIT');return Response.json({results});}catch(e){await client.query('ROLLBACK');throw e;}}return Response.json(await execute(body));}finally{client.release();}
};
try{
 const sofie=await readAgentHome(beta,'owner','agent_e0954312-6a71-4727-a915-f1484a0b8736');
 assert.equal(typeof sofie.agent.handle,'string');assert.ok(sofie.authority.some(c=>c.id==='tool.send_email'&&c.approval==='owner_policy'));assert.ok(sofie.authority.every(c=>typeof c.allowed==='boolean'));assert.equal(sofie.works.length,1);assert.equal(sofie.routineExecutionQualified,false);assert.ok(sofie.threads.some(t=>t.id==='agent-native-controlled-thread'));
 await assert.rejects(()=>readAgentHome(beta,'different-owner',sofie.agent.id),e=>e.status===404);
 const source=await createAgent('owner',{name:'Researcher qualification',role:'Researcher',instructions:'Review public information.',capabilityIds:['web.read']},{type:'owner',id:'owner'});
 const copy=await duplicateAgent('owner',source.id,undefined,{type:'owner',id:'owner'});
 assert.notEqual(copy.id,source.id);assert.equal(copy.instructions,source.instructions);assert.equal(copy.capabilities.filter(c=>c.enabled).length,0);assert.equal(copy.isPrimary,false);
 const home=await readAgentHome(beta,'owner',copy.id);assert.equal(home.works.length,0);assert.equal(home.threads.length,0);assert.equal(home.routines.length,0);assert.equal(home.runs.length,0);
 console.log(JSON.stringify({category:'DETERMINISTIC',checks:15,freshIdentity:true,inheritedCapabilityGrants:0,inheritedWork:0,crossOwnerDisclosures:0,liveAgentExecution:'NOT_RUN'}));
}finally{neonConfig.fetchFunction=old;await pool.end();}
