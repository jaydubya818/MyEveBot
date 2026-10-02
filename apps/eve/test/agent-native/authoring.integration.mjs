import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {neonConfig} from '@neondatabase/serverless';
import {generateText,tool} from 'ai';
import {MockLanguageModelV3} from 'ai/test';
import {updateAgent,getAgent} from '../../lib/agents.ts';
import {parseAgentWriteInput} from '../../lib/agent-api.ts';
import manageAgent from '../../agent/tools/manage_agent.ts';
import engineeringWork from '../../agent/tools/engineering_work.ts';
import {BetaIntegration} from '../../lib/beta-integration/runtime.ts';
import {CanonicalBetaWork} from '../../lib/beta-integration/canonical-work.ts';
import {readWorkThread} from '../../lib/product/work-thread.ts';
const url=process.env.MYEVE_PRODUCT_TEST_DATABASE;
if(url!=='postgresql://postgres@127.0.0.1:55509/myeve_beta_publication')throw Error('Task-owned database required');
process.env.DATABASE_URL=url;process.env.MYEVE_ENGINEERING_MODE='dogfood';
const pool=new Pool({connectionString:url}),c=await pool.connect(),schema='product_authoring_'+Date.now(),old=neonConfig.fetchFunction;
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const owner='controlled-author',ctx={session:{id:'authoring-session',auth:{current:{principalId:owner,principalType:'user',attributes:{owner:'true'}}}}};
async function propose(name,definition,input,prompt){const model=new MockLanguageModelV3({doGenerate:async options=>{assert(JSON.stringify(options.prompt).includes(prompt));checks++;return {content:[{type:'tool-call',toolCallId:randomUUID(),toolName:name,input:JSON.stringify(input)}],finishReason:{unified:'tool-calls',raw:'tool_calls'},usage:{inputTokens:{total:1},outputTokens:{total:1}},warnings:[]};}});const response=await generateText({model,prompt,tools:{[name]:tool({inputSchema:definition.inputSchema})}});eq(response.toolCalls.length,1);return response.toolCalls[0].input;}
try{
 await c.query(`CREATE SCHEMA ${schema}`);await c.query(`SET search_path TO ${schema}`);
 for(const f of (await readdir(new URL('../../migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await c.query(await readFile(new URL('../../migrations/'+f,import.meta.url),'utf8'));
 neonConfig.fetchFunction=async(_url,options)=>{const body=JSON.parse(options.body);const run=async({query,params})=>{const r=await c.query({text:query,values:params,rowMode:'array',types:{getTypeParser:()=>v=>v}});return {fields:r.fields.map(f=>({name:f.name,dataTypeID:f.dataTypeID})),rows:r.rows,rowCount:r.rowCount,command:r.command,rowAsArray:true};};if(body.queries){await c.query('BEGIN');try{const results=[];for(const q of body.queries)results.push(await run(q));await c.query('COMMIT');return Response.json({results});}catch(e){await c.query('ROLLBACK');throw e;}}return Response.json(await run(body));};
 const agentInput=await propose('manage_agent',manageAgent,{action:'create',configuration:{name:'Software Engineer',role:'Software Engineer',instructions:'Implement bounded owner requests with independent verification.'}},'Create a persistent Software Engineer for my code work.');
 eq((await c.query('SELECT count(*)::int AS n FROM agents')).rows[0].n,0);
 // Explicit owner approval is a harness step; no claim of browser approval here.
 const agent=await manageAgent.execute(agentInput,ctx);eq(agent.capabilities.filter(c=>c.enabled).length,0);
 const appearance=parseAgentWriteInput({name:agent.name,role:agent.role,instructions:agent.instructions,avatarConfig:{style:'robot',tone:'clay'}});assert(appearance);checks++;
 await updateAgent(owner,agent.id,appearance,{type:'owner',id:owner});eq((await getAgent(owner,agent.id)).avatarConfig,{style:'robot',tone:'clay'});
 eq(parseAgentWriteInput({...appearance,avatarConfig:{style:'robot',tone:'clay',externalUrl:'https://example.invalid'}}),null);
 await c.query("INSERT INTO agent_capabilities(owner_id,agent_id,capability_id,assigned_by_type) VALUES($1,$2,'web.read','owner')",[owner,agent.id]);
 await manageAgent.execute(manageAgent.inputSchema.parse({action:'update',agentId:agent.id,configuration:{name:'Software Engineer',role:'Engineer',instructions:'Respect independent review.'}}),ctx);eq((await c.query('SELECT count(*)::int AS n FROM agent_capabilities WHERE agent_id=$1',[agent.id])).rows[0].n,1);
 const copy=await manageAgent.execute({action:'duplicate',agentId:agent.id},ctx);assert.notEqual(agent.id,copy.id);checks++;eq(copy.capabilities.filter(c=>c.enabled).length,0);
 await assert.rejects(()=>manageAgent.execute({action:'pause',agentId:agent.id},{session:{...ctx.session,auth:{current:{...ctx.session.auth.current,principalId:'foreign'}}}}));checks++;
 const definition=await engineeringWork.events['step.started']({},ctx);assert(definition);checks++;
 const request={operation:'create',create:{title:'Fix quantity validation',objective:'Reject invalid quantities with tests',repository:'fixture/quantity',criteria:[{id:randomUUID(),statement:'Invalid quantities are rejected',method:'test'}],maxCostUsd:1,maxDurationSeconds:300,idempotencyKey:randomUUID()}};
 const input=await propose('engineering_work',definition,request,'Sofie, fix quantity validation and show me the tests before publication.');
 const created=await definition.execute(input,ctx),repeat=await definition.execute(input,ctx);eq(created.work.id,repeat.work.id);eq(created.work.control,'paused');
 const beta=new BetaIntegration({connect:async()=>({query:(s,p)=>c.query(s,p),release:()=>{}})},{repository:'fixture/quantity',maxCostUsd:1,maxDurationSeconds:300});
 const projection=(await new CanonicalBetaWork(beta).projection(owner,created.work.id)).projection;
 eq(projection.runTruth.activeRun,null);eq(projection.latestResult,null);eq(projection.readiness.ready,false);
 // Trusted fixture context association mirrors the canonical context source. It
 // is not written by a browser/model and does not grant execution authority.
 await c.query("INSERT INTO web_chat_threads(id,owner_id,title,updated_at,chat,agent_id) VALUES('authoring-thread',$1,'Fix quantity validation',1,'{}',$2)",[owner,agent.id]);
 await c.query("INSERT INTO agent_runs(id,session_id,owner_id,agent_id,thread_id,status) VALUES('authoring-run','authoring-session',$1,$2,'authoring-thread','completed')",[owner,agent.id]);
 await c.query("INSERT INTO context_assemblies(id,owner_id,agent_id,session_id,agent_run_id,thread_id,source_refs,estimated_tokens) VALUES('authoring-context',$1,$2,'authoring-session','authoring-run','authoring-thread',$3::jsonb,30)",[owner,agent.id,JSON.stringify(['engineering-work:'+created.work.id])]);
 eq((await readWorkThread(beta,owner,'authoring-thread')).works[0].projection.workId,created.work.id);
 await assert.rejects(()=>readWorkThread(beta,'foreign','authoring-thread'));checks++;
 eq((await c.query('SELECT count(*)::int AS n FROM engineering_route_runs')).rows[0].n,0);
 console.log(JSON.stringify({category:'DETERMINISTIC',checks,naturalInput:'controlled SDK proposal → real tool schema → canonical persistence',agentCreation:true,workCreation:true,idempotency:true,conversationAssociation:'trusted fixture context',productiveExecution:'NOT_RUN',browserNaturalApproval:'NOT_RUN',liveModels:0}));
}finally{neonConfig.fetchFunction=old;await c.query('SET search_path TO public');await c.query(`DROP SCHEMA ${schema} CASCADE`);c.release();await pool.end();}
