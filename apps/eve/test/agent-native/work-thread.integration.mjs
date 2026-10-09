import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {BetaIntegration} from '../../lib/beta-integration/runtime.ts';
import {readWorkThread} from '../../lib/product/work-thread.ts';
if(process.env.MYEVE_PRODUCT_TEST_PORT && !/^[0-9]{1,5}$/.test(process.env.MYEVE_PRODUCT_TEST_PORT))throw Error('Numeric disposable loopback port required');
const url=process.env.MYEVE_PRODUCT_TEST_DATABASE;
if(url!==`postgresql://postgres@127.0.0.1:${process.env.MYEVE_PRODUCT_TEST_PORT??'55509'}/myeve_beta_publication`)throw Error('Task-owned disposable database required');
const pool=new Pool({connectionString:url});
const beta=new BetaIntegration(pool,{repository:'fixture/repository',maxCostUsd:1.35,maxDurationSeconds:600});
export const threadId='agent-native-controlled-thread', workId='b1e4e5cf-f0d5-45b1-97d3-d4a113bd09fb';
try{
 await pool.query(`INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary) VALUES('agent_e0954312-6a71-4727-a915-f1484a0b8736','owner','Sofie','qualification-sofie','Coordinator','Controlled qualification',true) ON CONFLICT(id) DO NOTHING`);
 await pool.query(`INSERT INTO web_chat_threads(id,owner_id,title,updated_at,chat,agent_id) VALUES($1,'owner','Review quantity validation',1,'{}','agent_e0954312-6a71-4727-a915-f1484a0b8736'),('agent-native-fork','owner','Fork',1,$2::jsonb,'agent_e0954312-6a71-4727-a915-f1484a0b8736'),('agent-native-other','other-owner','Private',1,'{}',NULL) ON CONFLICT(id) DO NOTHING`,[threadId,JSON.stringify({forkContext:workId,workId})]);
 await pool.query(`INSERT INTO agent_runs(id,session_id,owner_id,agent_id,thread_id,status) VALUES('agent-native-run','agent-native-session','owner','agent_e0954312-6a71-4727-a915-f1484a0b8736',$1,'completed') ON CONFLICT(id) DO NOTHING`,[threadId]);
 await pool.query(`INSERT INTO context_assemblies(id,owner_id,agent_id,session_id,agent_run_id,thread_id,source_refs,estimated_tokens) VALUES('agent-native-context','owner','agent_e0954312-6a71-4727-a915-f1484a0b8736','agent-native-session','agent-native-run',$1,$2::jsonb,100) ON CONFLICT(id) DO NOTHING`,[threadId,JSON.stringify(['engineering-work:'+workId])]);
 const view=await readWorkThread(beta,'owner',threadId);
 assert.equal(view.works.length,1);assert.equal(view.works[0].projection.workId,workId);
 assert.equal(view.works[0].projection.nativeDevelopment.phase,'VERIFICATION_PASSED');
 assert.equal((await readWorkThread(beta,'owner','agent-native-fork')).works.length,0);
 await assert.rejects(()=>readWorkThread(beta,'other-owner',threadId),e=>e.status===404);
 await assert.rejects(()=>readWorkThread(beta,'owner','agent-native-other'),e=>e.status===404);
 await pool.query(`INSERT INTO context_assemblies(id,owner_id,agent_id,session_id,agent_run_id,thread_id,source_refs,estimated_tokens) SELECT 'agent-native-repeat',owner_id,agent_id,session_id,agent_run_id,thread_id,source_refs,estimated_tokens FROM context_assemblies WHERE id='agent-native-context' ON CONFLICT(id) DO NOTHING`);
 assert.equal((await readWorkThread(beta,'owner',threadId)).works.length,1);
 assert.equal((await readWorkThread(beta,'owner',threadId,10)).works.length,0);
 await pool.query(`INSERT INTO context_assemblies(id,owner_id,agent_id,session_id,agent_run_id,thread_id,source_refs,estimated_tokens) VALUES('agent-native-forged-context','owner','agent_e0954312-6a71-4727-a915-f1484a0b8736','wrong-session','agent-native-run','agent-native-fork',$1::jsonb,100) ON CONFLICT(id) DO NOTHING`,[JSON.stringify(['engineering-work:'+workId])]);
 assert.equal((await readWorkThread(beta,'owner','agent-native-fork')).works.length,0);
 console.log(JSON.stringify({category:'DETERMINISTIC',checks:8,canonicalProjection:true,crossOwnerDisclosures:0,forkedAuthorityAssociations:0,duplicateCards:0,liveExecution:'NOT_RUN'}));
}finally{await pool.end();}
