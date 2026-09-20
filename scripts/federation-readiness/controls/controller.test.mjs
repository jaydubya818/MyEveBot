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
