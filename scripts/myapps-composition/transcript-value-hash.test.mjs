import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {hashOrderedTranscript} from './transcript-value-hash.mjs';
import {validatePublicReplay} from './current-public-runtime.mjs';

const events=()=>[
 {type:'message.completed',meta:{id:'one',index:0},data:{message:'First',tags:['a','b'],usage:{input:1,output:2}}},
 {type:'message.completed',meta:{id:'two',index:1},data:{message:'Second',extra:null}},
];
function permuteKeys(value){
 if(Array.isArray(value))return value.map(permuteKeys);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,permuteKeys(item)]));
 return value;
}
test('JSONB nested object-key permutation preserves every ordered transcript value',()=>{
 const original=events(),permuted=permuteKeys(original);
 assert.deepEqual(permuted,original);
 assert.notEqual(JSON.stringify(permuted),JSON.stringify(original));
 assert.notEqual(createHash('sha256').update(JSON.stringify(permuted)).digest('hex'),
  createHash('sha256').update(JSON.stringify(original)).digest('hex'));
 assert.equal(hashOrderedTranscript(permuted),hashOrderedTranscript(original));
 assert.deepEqual(original,events(),'Hashing must not mutate the transcript');
});
test('public exact replay equality and its digest agree across object-key orders',()=>{
 const original=events(),permuted=permuteKeys(original);
 const left=validatePublicReplay(original,original,2),right=validatePublicReplay(permuted,original,2);
 assert.equal(left.orderedTranscriptSha256,right.orderedTranscriptSha256);
 assert.equal(right.orderedTranscriptSha256,hashOrderedTranscript(permuted));
});
for(const [name,change] of [
 ['event order',value=>value.reverse()],
 ['nested array order',value=>value[0].data.tags.reverse()],
 ['message with same ID',value=>value[0].data.message='Changed'],
 ['metadata value',value=>value[0].meta.index=9],
 ['removed field',value=>delete value[0].data.usage],
 ['extra field',value=>value[0].data.newField=true],
 ['renamed field',value=>{value[0].data.renamed=value[0].data.message;delete value[0].data.message;}],
 ['number to string',value=>value[0].data.usage.input='1'],
 ['null to false',value=>value[1].data.extra=false],
 ['null to absent',value=>delete value[1].data.extra],
])test('ordered transcript hash and exact replay reject changed '+name,()=>{
 const original=events(),changed=structuredClone(original);change(changed);
 assert.notEqual(hashOrderedTranscript(changed),hashOrderedTranscript(original));
 assert.throws(()=>validatePublicReplay(changed,original,2),/PUBLIC_REPLAY_/);
});
test('all JSON scalar types and object keys contribute without coercion',()=>{
 const values=[null,false,true,0,1,'0','false',{},[],{'':null}];
 assert.equal(new Set(values.map(value=>hashOrderedTranscript([value]))).size,values.length);
});
test('numeric-looking keys, prototype-looking keys and Unicode keys are retained',()=>{
 const original=JSON.parse('[{"10":"ten","2":"two","__proto__":{"x":1},"é":"v","e":"u"}]');
 assert.equal(hashOrderedTranscript(original),hashOrderedTranscript(permuteKeys(original)));
 const changed=structuredClone(original);delete changed[0].__proto__;
 assert.notEqual(hashOrderedTranscript(original),hashOrderedTranscript(changed));
});
test('shared acyclic JSON values and null-prototype records preserve semantics',()=>{
 const shared={a:1,b:2},record=Object.assign(Object.create(null),{b:2,a:1});
 assert.equal(hashOrderedTranscript([shared,shared]),hashOrderedTranscript([record,{b:2,a:1}]));
});
for(const [name,value] of [
 ['undefined',undefined],['NaN',NaN],['infinity',Infinity],['negative infinity',-Infinity],['negative zero',-0],
 ['bigint',1n],['symbol',Symbol('value')],['function',()=>{}],['date',new Date(0)],
 ['map',new Map()],['set',new Set()],['custom prototype',Object.create({inherited:true})],
 ['sparse array',Array(1)],['extra array field',Object.assign([],{extra:true})],
 ['symbol field',{[Symbol('key')]:true}],['non-enumerable field',Object.defineProperty({},'hidden',{value:true})],
])test('non-JSON transcript value fails closed: '+name,()=>{
 assert.throws(()=>hashOrderedTranscript([{value}]),/TRANSCRIPT_/);
});
test('accessors and toJSON hooks never execute or disappear during hashing',()=>{
 let called=0;const getter=Object.defineProperty({},'value',{enumerable:true,get(){called++;return 1;}});
 const hooked={toJSON(){called++;return {};}};
 assert.throws(()=>hashOrderedTranscript([getter]),/TRANSCRIPT_/);
 assert.throws(()=>hashOrderedTranscript([hooked]),/TRANSCRIPT_/);
 assert.equal(called,0);
});
test('cycles and non-array transcript roots are rejected',()=>{
 const value={};value.self=value;
 assert.throws(()=>hashOrderedTranscript([value]),/TRANSCRIPT_JSON_CYCLE/);
 assert.throws(()=>hashOrderedTranscript({events:events()}),/TRANSCRIPT_ARRAY_REQUIRED/);
});
