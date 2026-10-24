import test from 'node:test';
import assert from 'node:assert/strict';
import {createBenignModelProbe} from './benign-model-probe.mjs';
const marker='CURRENT_RUNTIME_'+'a'.repeat(32);
const first=`Remember this runtime packaging marker: ${marker}. Reply in one sentence.`;
const followup='Repeat my runtime packaging marker in one sentence.';
const user=value=>({role:'user',content:[{type:'text',text:value}]});
test('two exact benign replies require the original user context and have separate bounded counters',()=>{
 const p=createBenignModelProbe(marker);
 assert.equal(p.replyFor([user(first)]),`Runtime packaging marker ${marker}.`);
 assert.equal(p.replyFor([user(first),{role:'assistant',content:'prior reply'},user(followup)]),`Your runtime packaging marker is ${marker}.`);
 assert.equal(p.snapshot().calls,2);
 assert.throws(()=>p.replyFor([user(first),user(followup)]),/CALL_LIMIT/);
});
test('the unchanged intended-positive Work prompt falls through without touching probe state',()=>{
 const p=createBenignModelProbe(marker);
 assert.equal(p.replyFor([user('Add a Low / Medium / High Priority field to Alpha Tasks.')]),null);
 assert.equal(p.snapshot().calls,0);
});
test('a follow-up before the first exact request is rejected, never synthesized',()=>{
 const p=createBenignModelProbe(marker);
 assert.throws(()=>p.replyFor([user(followup)]),/EXACT_REQUEST/);assert.equal(p.snapshot().calls,0);
});
test('a repeated first dispatch cannot become a second successful probe call',()=>{
 const p=createBenignModelProbe(marker);p.replyFor([user(first)]);
 assert.throws(()=>p.replyFor([user(first)]),/EXACT_REQUEST/);assert.equal(p.snapshot().calls,1);
});
test('assistant text containing a marker cannot substitute for retained original user input',()=>{
 const p=createBenignModelProbe(marker);p.replyFor([user(first)]);
 assert.throws(()=>p.replyFor([{role:'assistant',content:marker},user(followup)]),/CONTEXT_LOST/);
 assert.equal(p.snapshot().calls,1);
});
test('a marker from another probe does not share this namespace',()=>{
 const p=createBenignModelProbe(marker);
 assert.throws(()=>p.replyFor([user(first.replace(marker,'CURRENT_RUNTIME_'+'b'.repeat(32)))]),/EXACT_REQUEST/);
 assert.equal(p.snapshot().calls,0);
});
test('editing an observed counter snapshot cannot alter private dispatch state',()=>{
 const p=createBenignModelProbe(marker),value=p.snapshot();value.calls=2;value.requests.push({index:1});
 assert.equal(p.snapshot().calls,0);assert.equal(p.snapshot().requests.length,0);
});
