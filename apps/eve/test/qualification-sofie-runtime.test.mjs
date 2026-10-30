/** Generic metered SOFIE planning runtime: reservation-bounded steps, usage finality, quiescence, and composition with the real agent adapter/port. Synthetic models only: no provider, credential or spend. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {MockLanguageModelV4} from 'ai/test';
import {SofiePlanningRuntime,SofieRuntimeRefused,stepCostMicrousd} from '../lib/qualification/sofie-planning-runtime.ts';
import {aiSdkMeteredModel} from '../lib/qualification/sofie-ai-sdk-model.ts';
import {DeepAgentAdapter,AgentNotStarted} from '../lib/qualification/agent-port.ts';
import {RetainedExecutorAgentPort} from '../lib/qualification/agent-execution-port.ts';
import {RelayDenied} from '../lib/qualification/relay-grant.ts';
import {ProviderNotSent} from '../lib/qualification/gate.ts';

const price={inputMicrousdPerMillionTokens:3_000_000,outputMicrousdPerMillionTokens:15_000_000};
const TOOL={name:'relay_github_repo_get',kind:'read'};
const RESERVE=650_000;
const text=t=>({role:'assistant',content:[{type:'text',text:t}]});
const task=(over={})=>({stage:1,key:'op-sofie-1',purpose:'SOFIE',ownerId:'owner',slot:'Q1',projectSha256:'a'.repeat(64),sourceSha256:'b'.repeat(64),reserveMicrousd:RESERVE,
  relay:{discover:async()=>[TOOL],execute:async()=>({repo:'ok'})},...over});

/** Scripted model: each entry is a function (input) => output | throws. */
function scripted(steps){
  const calls=[];
  return {calls,model:{
    async step(input){calls.push(input);const next=steps[calls.length-1];if(!next)throw new Error('unexpected extra step');return next(input);},
    toolResult:(call,outcome)=>({role:'tool',content:[{callId:call.id,outcome}]}),
  }};
}
const runtime=(model,over={})=>new SofiePlanningRuntime({model,price,request:'Plan the approved dashboard',system:'You are Sofie.',...over});
const done=(inTok,outTok)=>()=>({messages:[text('done')],toolCalls:[],usage:{inputTokens:inTok,outputTokens:outTok}});

test('a clean conversation runs tools through the relay, stays inside the reservation and reports final usage',async()=>{
  const s=scripted([()=>({messages:[text('looking')],toolCalls:[{id:'c1',tool:TOOL,args:{}}],usage:{inputTokens:300,outputTokens:40}}),done(500,60)]);
  const executed=[];
  const rt=runtime(s.model);
  const {handle}=await rt.start(task({relay:{discover:async()=>[TOOL],execute:async(tool,args)=>{executed.push({tool,args});return {repo:'ok'};}}}));
  assert.deepEqual(await rt.finished(handle),{usageFinal:true});
  assert.deepEqual(executed,[{tool:TOOL,args:{}}]);
  const expected=stepCostMicrousd(price,300,40)+stepCostMicrousd(price,500,60);
  assert.deepEqual(rt.summary(handle),{usageFinal:true,spentMicrousd:expected,steps:2,outcome:'COMPLETED'});
  assert.ok(expected<RESERVE);
  assert.deepEqual(s.calls[1].messages.at(-1),{role:'tool',content:[{callId:'c1',outcome:{ok:true,value:{repo:'ok'}}}]},'the tool outcome reaches the next step');
  assert.equal(s.calls[0].system,'You are Sofie.');assert.deepEqual(s.calls[0].tools,[TOOL]);
});

test('every step is told an output ceiling derived from what remains of the charged reservation',async()=>{
  const reserve=40_000;
  const s=scripted([done(10,5)]);
  const rt=runtime(s.model);
  await rt.start(task({reserveMicrousd:reserve}));
  const promptBound=Buffer.byteLength(JSON.stringify({system:'You are Sofie.',messages:[{role:'user',content:[{type:'text',text:'Plan the approved dashboard'}]}],tools:[TOOL]}))+4096+1024;
  const afterPrompt=reserve-Math.ceil(promptBound*3_000_000/1_000_000);
  assert.equal(s.calls[0].maxOutputTokens,Math.min(4096,Math.floor(afterPrompt*1_000_000/15_000_000)));
  assert.ok(stepCostMicrousd(price,promptBound,s.calls[0].maxOutputTokens)<=reserve,'worst case for the step fits the reservation');
  const big=scripted([done(10,5)]);
  await runtime(big.model).start(task());
  assert.equal(big.calls[0].maxOutputTokens,4096,'the configured per-step ceiling still applies');
});

test('a first step that cannot fit the reservation is a proven no-send: AgentNotStarted and the model is never called',async()=>{
  const s=scripted([done(1,1)]);
  const rt=runtime(s.model);
  await assert.rejects(rt.start(task({reserveMicrousd:1})),AgentNotStarted);
  await assert.rejects(rt.start(task({reserveMicrousd:0})),AgentNotStarted);
  await assert.rejects(rt.start(task({purpose:'CODING'})),AgentNotStarted);
  await assert.rejects(rt.start(task({relay:{discover:async()=>{throw new Error('down');},execute:async()=>({})}})),AgentNotStarted);
  assert.equal(s.calls.length,0);
  assert.equal(await rt.finished('sofie:op-sofie-1'),null);
});

test('usage that is missing, above the ceiling that was sent, or beyond the reservation leaves the run not final',async()=>{
  for(const [label,step,code] of [
    ['missing',()=>({messages:[text('x')],toolCalls:[],usage:null}),'QDEV_SOFIE_USAGE_MISSING'],
    ['fractional',()=>({messages:[text('x')],toolCalls:[],usage:{inputTokens:1.5,outputTokens:1}}),'QDEV_SOFIE_USAGE_MISSING'],
    ['negative',()=>({messages:[text('x')],toolCalls:[],usage:{inputTokens:-1,outputTokens:1}}),'QDEV_SOFIE_USAGE_MISSING'],
    ['output above the ceiling',input=>({messages:[text('x')],toolCalls:[],usage:{inputTokens:10,outputTokens:input.maxOutputTokens+1}}),'QDEV_SOFIE_USAGE_CEILING'],
    ['input above the prompt bound',()=>({messages:[text('x')],toolCalls:[],usage:{inputTokens:5_000_000,outputTokens:1}}),'QDEV_SOFIE_USAGE_CEILING'],
    ['malformed output',()=>({messages:'x',toolCalls:[],usage:{inputTokens:1,outputTokens:1}}),'QDEV_SOFIE_OUTPUT'],
  ]){
    const rt=runtime(scripted([step]).model),{handle}=await rt.start(task());
    assert.deepEqual(await rt.finished(handle),{usageFinal:false},label);
    assert.equal(rt.summary(handle).code,code,label);assert.equal(rt.summary(handle).outcome,'VIOLATION',label);
  }
  // Spend that lands above the reservation even though each field was individually plausible.
  const rt=runtime(scripted([input=>({messages:[text('x')],toolCalls:[],usage:{inputTokens:10,outputTokens:input.maxOutputTokens}})]).model);
  const small=await rt.start(task({reserveMicrousd:60_000}));
  assert.ok(rt.summary(small.handle).spentMicrousd<=60_000,'a step at its ceiling still fits by construction');
  assert.equal(rt.summary(small.handle).usageFinal,true);
});

test('when the next worst-case step no longer fits, the run ends cleanly as budget exhausted with final usage',async()=>{
  const reserve=60_000;
  const s=scripted([input=>({messages:[text('more')],toolCalls:[{id:'c1',tool:TOOL,args:{}}],usage:{inputTokens:50,outputTokens:input.maxOutputTokens}}),done(1,1)]);
  const rt=runtime(s.model);
  const {handle}=await rt.start(task({reserveMicrousd:reserve}));
  assert.equal(rt.summary(handle).outcome,'BUDGET_EXHAUSTED');assert.equal(s.calls.length,1,'the second step is never sent');
  assert.ok(rt.summary(handle).spentMicrousd<=reserve);
  assert.deepEqual(await rt.finished(handle),{usageFinal:true});
  const limited=scripted(Array.from({length:3},()=>()=>({messages:[text('t')],toolCalls:[{id:'c',tool:TOOL,args:{}}],usage:{inputTokens:10,outputTokens:5}})));
  const l=runtime(limited.model,{maxSteps:3}),r=await l.start(task());
  assert.equal(l.summary(r.handle).outcome,'STEP_LIMIT');assert.equal(limited.calls.length,3);
});

test('a model failure after the request was issued is ambiguous spend: the run is not final and nothing is retried',async()=>{
  const s=scripted([()=>{throw new Error('provider 500');}]);
  const rt=runtime(s.model),{handle}=await rt.start(task());
  assert.deepEqual(await rt.finished(handle),{usageFinal:false});
  assert.equal(rt.summary(handle).code,'QDEV_SOFIE_MODEL_ERROR');assert.equal(s.calls.length,1);
  assert.ok(!JSON.stringify(rt.summary(handle)).includes('provider 500'),'no provider text leaks into the record');
});

test('the deadline aborts the step; cessation is the step settling, and a step that never settles is reported unproven',async()=>{
  let sawAbort=false;
  const honoring=scripted([input=>new Promise((_,reject)=>input.signal.addEventListener('abort',()=>{sawAbort=true;reject(new Error('aborted'));}))]);
  const rt=runtime(honoring.model,{deadlineMs:30,quiescenceGraceMs:200}),{handle}=await rt.start(task());
  assert.equal(sawAbort,true);assert.deepEqual(await rt.finished(handle),{usageFinal:false});assert.equal(rt.summary(handle).code,'QDEV_SOFIE_DEADLINE');
  let release;const hang=new Promise(r=>release=r);
  const stubborn=scripted([()=>hang]);
  const rt2=runtime(stubborn.model,{deadlineMs:20,quiescenceGraceMs:30});
  await assert.rejects(rt2.start(task()),e=>e instanceof SofieRuntimeRefused&&e.code==='QDEV_SOFIE_NOT_QUIESCENT');
  assert.equal(await rt2.finished('sofie:op-sofie-1'),null,'no record exists for a run whose cessation is unproven');
  release();
});

test('tool denials and oversized results go back to the model as data and never become authority',async()=>{
  const s=scripted([()=>({messages:[text('a')],toolCalls:[{id:'c1',tool:TOOL,args:{owner:'x'}},{id:'c2',tool:TOOL,args:{}},{id:'c3',tool:TOOL,args:{}}],usage:{inputTokens:20,outputTokens:10}}),done(40,10)]);
  let n=0;
  const relay={discover:async()=>[TOOL],execute:async()=>{n++;if(n===1)throw new RelayDenied('QDEV_RELAY_INPUT_DENIED');if(n===2)return {blob:'x'.repeat(40_000)};throw new Error('secret transport detail');}};
  const rt=runtime(s.model),{handle}=await rt.start(task({relay}));
  const outcomes=s.calls[1].messages.filter(m=>m.role==='tool').map(m=>m.content[0].outcome);
  assert.deepEqual(outcomes,[{ok:false,code:'QDEV_RELAY_INPUT_DENIED'},{ok:false,code:'QDEV_SOFIE_TOOL_RESULT_TOO_LARGE'},{ok:false,code:'QDEV_SOFIE_TOOL_FAILED'}]);
  assert.deepEqual(await rt.finished(handle),{usageFinal:true});
  const many=runtime(scripted([()=>({messages:[text('a')],toolCalls:Array.from({length:9},(_,i)=>({id:'c'+i,tool:TOOL,args:{}})),usage:{inputTokens:1,outputTokens:1}})]).model);
  const m=await many.start(task());assert.equal(many.summary(m.handle).code,'QDEV_SOFIE_TOOL_CALLS');
});

test('one run per task key: a repeated or concurrent start is refused and the first record is never replaced',async()=>{
  let release;const gate=new Promise(r=>release=r);
  const s=scripted([async()=>{await gate;return done(5,5)();}]);
  const rt=runtime(s.model);
  const first=rt.start(task());
  await assert.rejects(rt.start(task()),e=>e instanceof SofieRuntimeRefused&&e.code==='QDEV_SOFIE_ALREADY_STARTED');
  release();const {handle}=await first;
  await assert.rejects(rt.start(task()),e=>e instanceof SofieRuntimeRefused&&e.code==='QDEV_SOFIE_ALREADY_STARTED');
  assert.equal(s.calls.length,1);assert.deepEqual(await rt.finished(handle),{usageFinal:true});
});

test('construction fails closed on unpriced, unbounded or empty configuration',()=>{
  const model=scripted([]).model;
  for(const over of [{price:{inputMicrousdPerMillionTokens:0,outputMicrousdPerMillionTokens:0}},{price:{inputMicrousdPerMillionTokens:-1,outputMicrousdPerMillionTokens:1}},{price:{inputMicrousdPerMillionTokens:1.5,outputMicrousdPerMillionTokens:1}},
    {request:' '},{system:''},{maxSteps:0},{maxSteps:99},{deadlineMs:0},{maxOutputTokensPerStep:0},{promptOverheadBytes:-1},{model:{}}])
    assert.throws(()=>new SofiePlanningRuntime({model,price,request:'r',system:'s',...over}),SofieRuntimeRefused,JSON.stringify(over));
});

test('composed with the real DeepAgentAdapter and retained-executor port: SOFIE completes only with final usage; an unaffordable or violating run never settles',async()=>{
  const adapterFor=rt=>new DeepAgentAdapter({enabled:true,ownerId:'owner',slot:'Q1',projectSha256:'a'.repeat(64),sourceSha256:'b'.repeat(64),
    port:new RetainedExecutorAgentPort({runtime:rt,retained:()=>{throw new Error('SOFIE needs no Factory admission');}})});
  const relay=task().relay,op=over=>({stage:1,key:'op-sofie-1',purpose:'SOFIE',reserveMicrousd:RESERVE,...over});
  assert.deepEqual(await adapterFor(runtime(scripted([done(100,20)]).model)).run(op(),relay),{known:true,value:{sofie:'completed'}});
  assert.deepEqual(await adapterFor(runtime(scripted([()=>({messages:[text('x')],toolCalls:[],usage:null})]).model)).run(op(),relay),{known:false});
  assert.deepEqual(await adapterFor(runtime(scripted([()=>{throw new Error('x');}]).model)).run(op(),relay),{known:false});
  const unaffordable=scripted([done(1,1)]);
  await assert.rejects(adapterFor(runtime(unaffordable.model)).run(op({reserveMicrousd:1}),relay),ProviderNotSent);
  assert.equal(unaffordable.calls.length,0);
});

test('the AI SDK adapter: one provider request per step, ceiling sent to the provider, tool results accepted, usage mapped, no SDK-side retry or tool execution',async()=>{
  const requests=[];
  const language=new MockLanguageModelV4({doGenerate:async options=>{
    requests.push(options);
    if(requests.length===1)return {content:[{type:'text',text:'checking'},{type:'tool-call',toolCallId:'c1',toolName:TOOL.name,input:'{}'}],finishReason:{unified:'tool-calls',raw:'tool_calls'},
      usage:{inputTokens:{total:120,noCache:120,cacheRead:0,cacheWrite:0},outputTokens:{total:30,text:30,reasoning:0}},warnings:[]};
    return {content:[{type:'text',text:'plan ready'}],finishReason:{unified:'stop',raw:'stop'},
      usage:{inputTokens:{total:260,noCache:200,cacheRead:60,cacheWrite:0},outputTokens:{total:80,text:50,reasoning:30}},warnings:[]};
  }});
  let executed=0;
  const rt=runtime(aiSdkMeteredModel(language));
  const {handle}=await rt.start(task({relay:{discover:async()=>[TOOL],execute:async()=>{executed++;return {repo:'ok'};}}}));
  assert.equal(requests.length,2,'exactly one provider request per runtime step');assert.equal(executed,1);
  assert.ok(requests.every(r=>Number.isInteger(r.maxOutputTokens)&&r.maxOutputTokens>=1&&r.maxOutputTokens<=4096));
  assert.deepEqual(requests[0].tools.map(t=>t.name),[TOOL.name]);
  assert.ok(requests[1].prompt.some(m=>m.role==='tool'),'the tool result is replayed to the provider');
  assert.deepEqual(rt.summary(handle),{usageFinal:true,spentMicrousd:stepCostMicrousd(price,120,30)+stepCostMicrousd(price,260,80),steps:2,outcome:'COMPLETED'});
  assert.deepEqual(await rt.finished(handle),{usageFinal:true});
  // A provider that reports more output than the ceiling it was given is a violation, never settled.
  const greedy=new MockLanguageModelV4({doGenerate:async options=>({content:[{type:'text',text:'x'}],finishReason:{unified:'stop',raw:'stop'},
    usage:{inputTokens:{total:10,noCache:10,cacheRead:0,cacheWrite:0},outputTokens:{total:options.maxOutputTokens+5,text:options.maxOutputTokens+5,reasoning:0}},warnings:[]})});
  const rt2=runtime(aiSdkMeteredModel(greedy)),r2=await rt2.start(task());
  assert.deepEqual(await rt2.finished(r2.handle),{usageFinal:false});
  // A provider error is surfaced once and never retried by the SDK.
  let attempts=0;
  const failing=new MockLanguageModelV4({doGenerate:async()=>{attempts++;throw new Error('503 overloaded');}});
  const rt3=runtime(aiSdkMeteredModel(failing)),r3=await rt3.start(task());
  assert.equal(attempts,1);assert.deepEqual(await rt3.finished(r3.handle),{usageFinal:false});
});

// Independent failure-injection regressions: a whole-conversation deadline can expire while Relay is pending.
{
const tool={name:'relay_github_repo_get',kind:'read'};
const output=(calls=[])=>({messages:[],toolCalls:calls,usage:{inputTokens:1,outputTokens:1}});
const task=relay=>({stage:1,key:'synthetic-deadline',purpose:'SOFIE',ownerId:'review-owner',slot:'Q1',projectSha256:'a'.repeat(64),sourceSha256:'b'.repeat(64),reserveMicrousd:650000,relay});
test('a deadline during a Relay call cannot start another model step with an already-aborted signal',async()=>{
 let calls=0,secondSignal;
 const model={async step(input){calls++;if(calls===1)return output([{id:'c1',tool,args:{}}]);secondSignal=input.signal.aborted;return output();},toolResult:()=>({role:'tool',content:[]})};
 const rt=new SofiePlanningRuntime({model,price:{inputMicrousdPerMillionTokens:3000000,outputMicrousdPerMillionTokens:15000000},request:'Plan dashboard',system:'Sofie',deadlineMs:5,quiescenceGraceMs:50});
 const {handle}=await rt.start(task({discover:async()=>[tool],execute:async()=>{await new Promise(r=>setTimeout(r,30));return {ok:true};}}));
 console.log(JSON.stringify({calls,secondSignalAlreadyAborted:secondSignal,summary:rt.summary(handle)}));
 assert.equal(calls,1,'the conversation hard deadline must be checked before a new model request');
 assert.deepEqual(await rt.finished(handle),{usageFinal:false});
});
test('a deadline that expires during Relay cannot lose the grace timer for an unsettled subsequent model call',async()=>{
 let calls=0,release,outer;
 const blocked=new Promise(r=>release=r);
 const model={async step(){calls++;return calls===1?output([{id:'c1',tool,args:{}}]):blocked;},toolResult:()=>({role:'tool',content:[]})};
 const rt=new SofiePlanningRuntime({model,price:{inputMicrousdPerMillionTokens:3000000,outputMicrousdPerMillionTokens:15000000},request:'Plan dashboard',system:'Sofie',deadlineMs:5,quiescenceGraceMs:10});
 const pending=rt.start(task({discover:async()=>[tool],execute:async()=>{await new Promise(r=>setTimeout(r,30));return {ok:true};}}));
 try{
  const result=await Promise.race([pending.then(()=> 'finished',()=> 'rejected'),new Promise(r=>outer=setTimeout(()=>r('still-pending'),100))]);
  console.log(JSON.stringify({calls,result,deadlineMs:5,graceMs:10}));
  assert.notEqual(result,'still-pending','a missed abort event must not leave the charged operation waiting forever');
 }finally{clearTimeout(outer);release(output());await pending.catch(()=>{});}
});

}
