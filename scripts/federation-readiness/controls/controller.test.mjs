import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {Authority,ddl} from './postgres.mjs';
import {Controller} from './controller.mjs';
const {Pool}=createRequire('/Users/jaywest/relay/package.json')('pg');
const url=process.env.FQ_TEST_DATABASE_URL;if(!url||new URL(url).hostname!=='127.0.0.1')throw Error('LOCAL_DATABASE_REQUIRED');
const database='fq_controller_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:url});let pool;
before(async()=>{await admin.query(`CREATE DATABASE "${database}"`);const target=new URL(url);target.pathname=database;pool=new Pool({connectionString:target.href});await pool.query(ddl);});
after(async()=>{await pool?.end();await admin.query(`DROP DATABASE "${database}" WITH(FORCE)`);await admin.end();});
const token='a'.repeat(43),originToken='b'.repeat(43),sha='a'.repeat(40),hash=x=>createHash('sha256').update(x).digest('hex');
async function setup(request){const a=new Authority(pool,randomUUID());await a.create('local_authorization');const c=new Controller(a,{principals:{worker:{role:'worker',credentialHash:hash(token),sha,component:'myeve',ownerId:'fq-a'},origin:{role:'origin',worker:'worker',credentialHash:hash(originToken)}},routes:{test:{url:'https://fq.invalid/test',method:'POST',origin:'origin',callers:['worker'],submission:true}},request});await c.dispatch('Bearer '+token,'heartbeat',{sha});return {a,c,p:c.authenticate('Bearer '+token),origin:c.authenticate('Bearer '+originToken)};}
test('authentication and role separation reject direct admission',async()=>{const {c}=await setup();assert.throws(()=>c.authenticate('Bearer bad'));await assert.rejects(c.dispatch('Bearer '+originToken,'heartbeat',{sha}));await assert.rejects(c.dispatch('Bearer '+token,'stop',{}));});
test('permit is bound to body, operation and origin; valid claim is one-use',async()=>{const {c,p,origin}=await setup();const permit=await c.permit(p,'operation_1','POST','https://fq.invalid/test',Buffer.from('body'),'origin'),input={operation:'operation_1',permit,method:'POST',url:'https://fq.invalid/test',bodyBase64:Buffer.from('body').toString('base64')};await assert.rejects(c.claim(origin,{...input,bodyBase64:'eA=='}));assert.equal((await c.claim(origin,input)).admitted,true);await assert.rejects(c.claim(origin,input));});
test('expired permits fail and survive controller reconstruction',async()=>{const {a,c,p,origin}=await setup();const permit=await c.permit(p,'operation_1','POST','https://fq.invalid/test',Buffer.alloc(0),'origin');await a.transaction(s=>{s.permits.operation_1.expires=0;});await assert.rejects(c.claim(origin,{operation:'operation_1',permit,method:'POST',url:'https://fq.invalid/test',bodyBase64:''}));});
test('stale heartbeat prevents provider attempts',async()=>{let calls=0;const {a,c,p}=await setup(async()=>{calls++;return new Response('');});await a.transaction(s=>{s.workers.worker.at-=11;});await assert.rejects(c.http(p,{operation:'request_1',route:'test'}));assert.equal(calls,0);});
test('response slot held until body completes and ambiguous bodies remain fenced',async()=>{let release;const gate=new Promise(r=>release=r);let ctx;ctx=await setup(async(url,init)=>{await ctx.c.claim(ctx.origin,{operation:init.headers['x-fq-operation'],permit:init.headers['x-fq-permit'],method:'POST',url,bodyBase64:''});return new Response(new ReadableStream({async start(controller){await gate;controller.enqueue(new Uint8Array([1]));controller.close();}}));});const pending=ctx.c.http(ctx.p,{operation:'request_1',route:'test'});for(let n=0;n<100&&!(await ctx.a.status()).active.request_1;n++)await new Promise(r=>setTimeout(r,5));assert.ok((await ctx.a.status()).active.request_1);release();await pending;assert.equal((await ctx.a.status()).active.request_1,undefined);
 const broken=await setup(async()=>{throw Error('transport uncertain');});await assert.rejects(broken.c.http(broken.p,{operation:'request_2',route:'test'}));assert.ok((await broken.a.status()).active.request_2);});
test('fresh retry cannot exceed 2000, same ID never retries',async()=>{let ctx,calls=0;ctx=await setup(async(url,init)=>{calls++;await ctx.c.claim(ctx.origin,{operation:init.headers['x-fq-operation'],permit:init.headers['x-fq-permit'],method:'POST',url,bodyBase64:''});return new Response('ok');});await ctx.a.transaction(s=>{s.http=1999;});await ctx.c.http(ctx.p,{operation:'request_1',route:'test'});await assert.rejects(ctx.c.http(ctx.p,{operation:'request_1',route:'test'}));await assert.rejects(ctx.c.http(ctx.p,{operation:'request_2',route:'test'}));assert.equal(calls,1);});
test('actual artifact bytes enforce size and total before exposure',async()=>{const {c,p}=await setup();await assert.rejects(c.artifact(p,{ownerId:'fq-a',artifactId:crypto.randomUUID(),operation:'artifact_oversize',bodyBase64:Buffer.alloc(65537).toString('base64')}));for(let i=0;i<8;i++)assert.equal((await c.artifact(p,{ownerId:'fq-a',artifactId:crypto.randomUUID(),operation:`artifact_${i}`,bodyBase64:Buffer.alloc(65536).toString('base64')})).bytes,65536);await assert.rejects(c.artifact(p,{ownerId:'fq-a',artifactId:crypto.randomUUID(),operation:'artifact_9',bodyBase64:'eA=='}));});
test('unverified model adapter cannot reserve or invoke provider',async()=>{const {c,p,a}=await setup();await assert.rejects(c.modelCall(p,{operation:'model_0001',input:'test'}));assert.equal((await a.status()).charged,0);});
test('model adapter uses durable reservation and HTTP allowance once per operation',async()=>{
 const {haikuQualificationModel}=await import('./model.mjs');const {a,c,p}=await setup();let attempts=0;
 c.model=haikuQualificationModel({authority:a,credential:'synthetic-only',pricingReviewedUntil:Date.now()+60000,request:async()=>{attempts++;return Response.json({model:'claude-haiku-4-5-20251001',usage:{input_tokens:10,output_tokens:10},content:[{type:'text',text:'synthetic'}]});}});
 assert.equal((await c.modelCall(p,{operation:'model_0001',input:'synthetic'})).actualMicrousd,60);
 await assert.rejects(c.modelCall(p,{operation:'model_0001',input:'synthetic'}));
 const state=await a.status();assert.equal(state.http,1);assert.equal(state.charged,250000);assert.equal(attempts,1);
});
test('wrong owner, changed retry bytes, concurrency and restart cannot replenish artifacts',async()=>{
 const {a,c,p}=await setup();const input={ownerId:'fq-a',artifactId:'stable',operation:'artifact_first',bodyBase64:Buffer.alloc(65536).toString('base64')};
 await assert.rejects(c.artifact(p,{...input,ownerId:'fq-other'}));
 await c.artifact(p,input);await c.artifact(p,{...input,operation:'artifact_retry'});
 assert.equal((await new Authority(pool,a.id).status()).artifacts,1);
 await assert.rejects(c.artifact(p,{...input,operation:'artifact_changed',bodyBase64:'eA=='}));
 const outcomes=await Promise.allSettled(Array.from({length:12},(_,i)=>c.artifact(p,{...input,artifactId:`next-${i}`,operation:`artifact_next_${i}`})));
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,7);
 const state=await new Authority(pool,a.id).status();assert.equal(state.artifacts,8);assert.equal(state.artifactBytes,524288);
 await assert.rejects(c.artifact(p,{...input,operation:'artifact_retry'}));
});
test('forged permit, wrong operation, worker, stopped session and database outage fail closed',async()=>{
 const {a,c,p,origin}=await setup();const permit=await c.permit(p,'operation_1','POST','https://fq.invalid/test',Buffer.alloc(0),'origin');
 const input={operation:'operation_1',permit,method:'POST',url:'https://fq.invalid/test',bodyBase64:''};
 await assert.rejects(c.claim(origin,{...input,permit:'forged'}));
 await assert.rejects(c.claim(origin,{...input,operation:'operation_2'}));
 await assert.rejects(c.claim(p,input));
 await assert.rejects(c.claim({...origin,name:'different-origin'},input));
 await a.stop();await assert.rejects(c.claim(origin,input));
 await assert.rejects(c.active(p));
 const saved=a.pool;a.pool={connect:async()=>{throw Error('offline');}};
 await assert.rejects(c.active(p));a.pool=saved;
});
test('origin role cannot invoke a model and missing route never invokes a provider',async()=>{
 let calls=0;const {c,p,origin}=await setup(async()=>{calls++;return new Response('');});
 await assert.rejects(c.modelCall(origin,{operation:'model_0001',input:'synthetic'}));
 await assert.rejects(c.http(p,{operation:'request_1',route:'unlisted'}));
 await assert.rejects(c.http(p,{operation:'request_2',route:'test',url:'https://api.anthropic.com/v1/messages'}));
 assert.equal(calls,0);
});
test('stop evidence is durable before database brake and excludes request bodies',async()=>{
 const {evidenceDdl,evidenceAdapter}=await import('./evidence.mjs');
 await pool.query(evidenceDdl);
 const {a,c,p}=await setup();await c.artifact(p,{operation:'artifact_first',ownerId:'fq-a',artifactId:'artifact',bodyBase64:Buffer.from('synthetic-private-fixture').toString('base64')});
 await a.stop();assert.equal(await evidenceAdapter(pool,a)(AbortSignal.timeout(2000),{admission:'VERIFIED'}),true);
 const {rows}=await pool.query('SELECT record FROM fq_control.evidence WHERE session_id=$1',[a.id]);
 assert.equal(rows[0].record.stopped,true);assert.equal(rows[0].record.artifacts,1);assert.equal(JSON.stringify(rows).includes('synthetic-private-fixture'),false);
});
async function signingSetup(){
 const ctx=await setup();ctx.c.principals.worker.component='relay';ctx.c.principals.relay=ctx.c.principals.worker;ctx.c.principals.origin.worker='relay';ctx.c.principals.origin.accountIds=['acct_synthetic_a'];
 ctx.c.signingKeys={evidence:'version-evidence','federation-delivery':'version-delivery',passport:'version-passport'};
 await ctx.a.transaction(s=>{s.workers.relay={at:s.workers.worker.at,sha};});
 await ctx.a.http('root_request');
 const material=Buffer.from('{"operation":"poll"}');
 const permit=await ctx.c.permit(ctx.p,'root_request','POST','https://fq.invalid/test',material,'origin');
 ctx.origin=ctx.c.authenticate('Bearer '+originToken);
 await ctx.c.claim(ctx.origin,{operation:'root_request',permit,method:'POST',url:'https://fq.invalid/test',bodyBase64:material.toString('base64')});
 ctx.binding={rootOperation:'root_request',requestId:'request_0001',accountId:'acct_synthetic_a',agentId:'agent_a',operation:'poll',purpose:'federation-delivery',payloadHash:'a'.repeat(64),keyVersion:'version-delivery'};
 return ctx;
}
test('signing permits bind native account, agent, operation, purpose, request and payload; one use',async()=>{
 const {c,p,origin,binding}=await signingSetup();await assert.rejects(c.signingAdmission(p,binding));
 await assert.rejects(c.signingAdmission(origin,{...binding,accountId:'acct_other'}));
 await assert.rejects(c.signingAdmission(origin,{...binding,operation:'publish'}));
 const permit=await c.signingAdmission(origin,binding);
 for(const changes of [{purpose:'evidence',keyVersion:'version-evidence'},{payloadHash:'b'.repeat(64)},{requestId:'other_request'},{agentId:'other_agent'},{operation:'submit'}])await assert.rejects(c.signingClaim(origin,{...binding,...permit,...changes}));
 assert.equal((await c.signingClaim(origin,{...binding,...permit})).admitted,true);
 await assert.rejects(c.signingClaim(origin,{...binding,...permit}));
});
test('expired, absent and stopped signing permits never authorize application signing',async()=>{
 const {a,c,origin,binding}=await signingSetup();await assert.rejects(c.signingClaim(origin,{...binding,permitId:'absent',permit:'forged'}));
 const permit=await c.signingAdmission(origin,binding);await a.transaction(s=>{s.signingPermits[permit.permitId].expires=0;});
 await assert.rejects(c.signingClaim(origin,{...binding,...permit}));
 const fresh=await c.signingAdmission(origin,binding);await a.stop();await assert.rejects(c.signingClaim(origin,{...binding,...fresh}));
});
test('direct provider authority carries no Google credentials and consumes one metered network attempt',async()=>{
 const {a,c,origin}=await signingSetup();c.routes.kms={provider:true,url:'https://cloudkms.googleapis.com',methods:['POST'],pathPattern:'^/v1/exact:asymmetricSign$',callers:['origin']};
 const input={operation:'provider_0001',rootOperation:'root_request',route:'kms',url:'https://cloudkms.googleapis.com/v1/exact:asymmetricSign',method:'POST',bodyHash:'a'.repeat(64)};
 const permit=await c.providerAdmission(origin,input);await c.providerClaim(origin,{...input,...permit});
 await assert.rejects(c.providerClaim(origin,{...input,...permit}));
 assert.equal((await a.status()).http,2);await c.providerComplete(origin,input);assert.equal((await a.status()).http,2);
 await assert.rejects(c.providerAdmission(origin,{...input,operation:'provider_0002',url:'https://cloudkms.googleapis.com/v1/unrelated:asymmetricSign'}));
 assert.equal((await a.status()).http,2);
});
test('autonomous model provider cannot take a nested origin dependency slot',async()=>{
 const {a}=await setup();await a.http('model_http',{channel:'standalone'});
 await assert.rejects(a.http('relay_http',{channel:'origin'}),/HTTP_DEPENDENCY_SLOT/);
 await a.complete('model_http');await a.transaction(s=>{s.recentHttp=[];});
 await a.http('relay_http',{channel:'origin'});await assert.rejects(a.http('model_http_2',{channel:'standalone'}),/HTTP_DEPENDENCY_SLOT/);
 await a.http('kms_http',{channel:'provider'});assert.equal(Object.keys((await a.status()).active).length,2);
});
test('operator queue rejects worker submissions, fences starts and denies queued commands on stop',async()=>{
 const {a,c,p}=await setup();c.principals.operator={role:'operator',worker:'worker',credentialHash:hash('z'.repeat(43))};p.name='myeve';c.principals.myeve=c.principals.worker;await a.transaction(s=>{s.workers.myeve=s.workers.worker;});
 const operator={name:'operator',...c.principals.operator};const {job}=await import('./jobs.mjs');
 await assert.rejects(job(c,p,'job-submit',{id:'job_00001',worker:'myeve',command:{operation:'policy'}}));
 await assert.rejects(job(c,operator,'job-submit',{id:'job_00001',worker:'myeve',command:{operation:'connect',input:{password:'must-not-queue'}}}));
 await job(c,operator,'job-submit',{id:'job_00001',worker:'myeve',command:{operation:'policy'}});
 assert.equal((await job(c,p,'job-take',{})).job.id,'job_00001');assert.equal((await job(c,p,'job-take',{})).job,null);
 await job(c,p,'job-complete',{id:'job_00001',state:'COMPLETED',result:{ok:true}});
 await assert.rejects(job(c,p,'job-complete',{id:'job_00001',state:'COMPLETED',result:{ok:true}}));
 await job(c,operator,'job-submit',{id:'job_00002',worker:'myeve',command:{operation:'policy'}});await a.stop();assert.equal((await a.status()).jobs.job_00002.state,'DENIED');await assert.rejects(job(c,p,'job-take',{}));
});
test('only native submit commands consume submission allowance while every attempt counts HTTP',async()=>{
 let ctx;ctx=await setup(async(url,init)=>{await ctx.c.claim(ctx.origin,{operation:init.headers['x-fq-operation'],permit:init.headers['x-fq-permit'],method:'POST',url,bodyBase64:Buffer.from(init.body).toString('base64')});return new Response('ok');});
 ctx.c.routes.test.submission=false;ctx.c.routes.test.submissionOperations=['submit'];
 for(const [n,operation] of ['poll','submit'].entries())await ctx.c.http(ctx.p,{operation:`attempt_${n}`,route:'test',bodyBase64:Buffer.from(JSON.stringify({operation})).toString('base64')});
 const s=await ctx.a.status();assert.equal(s.http,2);assert.equal(s.submissions,1);
});
