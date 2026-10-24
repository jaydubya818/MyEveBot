import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePublicTurn,validatePublicReplay} from './current-public-runtime.mjs';

const events=()=>['message.received','turn.started','message.completed','turn.completed','session.waiting']
 .map((type,index)=>({type,meta:{id:'event-'+index},
  data:{turnId:'synthetic-turn',...(type==='message.completed'?{message:'synthetic completed reply',finishReason:'stop'}:{})}}));
test('only completed actual public turn shape yields a bounded observation, not runtime PASS',()=>{
 const value=validatePublicTurn(events(),'synthetic completed reply');
 assert.equal(value.events,5);assert.equal(value.eventIds.length,5);assert.equal(value.status,undefined);
});
for(const type of ['message.received','turn.started','turn.completed','session.waiting'])
 test('partial transcript cannot stand in for '+type,()=>{
  assert.throws(()=>validatePublicTurn(events().filter(event=>event.type!==type),'synthetic completed reply'),/PUBLIC_/);
 });
for(const type of ['turn.failed','session.failed','actions.requested','authorization.required'])
 test('failed/tool/authorization transcript rejected: '+type,()=>{
  const value=events();value.splice(3,0,{type,meta:{id:'extra'}});
  assert.throws(()=>validatePublicTurn(value,'synthetic completed reply'),/UNEXPECTED_FAILURE_OR_TOOL/);
 });
test('a wrong context reply cannot stand in for marker retention',()=>{
 assert.throws(()=>validatePublicTurn(events(),'different marker reply'),/REPLY_MISMATCH/);
});
test('missing or duplicate durable event identity is rejected',()=>{
 let value=events();delete value[0].meta;
 assert.throws(()=>validatePublicTurn(value,'synthetic completed reply'),/EVENT_ID_REQUIRED/);
 value=events();value[1].meta.id=value[0].meta.id;
 assert.throws(()=>validatePublicTurn(value,'synthetic completed reply'),/DUPLICATE_EVENT_ID/);
});
test('completion preceding the start is not a completed turn',()=>{
 const value=events();[value[1],value[3]]=[value[3],value[1]];
 assert.throws(()=>validatePublicTurn(value,'synthetic completed reply'),/BOUNDARY_ORDER/);
});
test('cursor-bound reconnect verifies the exact ordered durable transcript and digest',()=>{
 const value=events(),proof=validatePublicReplay(structuredClone(value),value,value.length);
 assert.equal(proof.cursor,5);assert.match(proof.orderedTranscriptSha256,/^[a-f0-9]{64}$/);
});
for(const change of ['body','order','duplicate','foreign-extra','missing','cursor'])
 test('reconnect rejects '+change+' even when original event IDs remain available',()=>{
  const expected=events(),value=structuredClone(expected);let cursor=expected.length;
  if(change==='body')value[2].data.message='changed same ID';
  if(change==='order')[value[0],value[1]]=[value[1],value[0]];
  if(change==='duplicate')value[1]=structuredClone(value[0]);
  if(change==='foreign-extra')value.push({type:'message.completed',meta:{id:'foreign'},data:{message:'foreign'}});
  if(change==='missing')value.splice(0,1);
  if(change==='cursor')cursor++;
  assert.throws(()=>validatePublicReplay(value,expected,cursor),/PUBLIC_REPLAY_/);
 });

test('turn identity cannot be missing or change between public boundaries',()=>{
 const value=events();delete value[1].data.turnId;
 assert.throws(()=>validatePublicTurn(value,'synthetic completed reply'),/PUBLIC_TURN_ID_REQUIRED/);
 const changed=events();changed[3].data.turnId='foreign-turn';
 assert.throws(()=>validatePublicTurn(changed,'synthetic completed reply'),/PUBLIC_TURN_ID_CHANGED/);
});
test('multiple started turns cannot stand in for exactly one authored message',()=>{
 const value=events();value.splice(2,0,{type:'turn.started',meta:{id:'extra-turn'},data:{turnId:'second'}});
 assert.throws(()=>validatePublicTurn(value,'synthetic completed reply'),/PUBLIC_EXACT_TURN_REQUIRED/);
});
