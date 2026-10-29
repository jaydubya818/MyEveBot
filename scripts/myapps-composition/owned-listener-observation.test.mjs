import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOwnedListener,validateProxyRouteWitnesses} from './owned-listener-observation.mjs';
import {validatePublicHealthPair} from './current-public-runtime.mjs';
const identity='123 123 Sat Oct 24 04:00:00 2026 node /owned/entry';
const args=()=>({pid:123,port:3185,nodePath:'/owned/node',executableText:'p123\nn/owned/node\nn/system/library',registration:{pid:123,pgid:123,start:'Sat Oct 24 04:00:00 2026'}});
test('actual listener PID, group, birth, loopback address and mapped Node match',()=>assert.equal(validateOwnedListener('p123\nn127.0.0.1:3185',identity,args()).pid,123));
for(const [name,listener,processLine,modify] of [
 ['foreign PID','p456\nn127.0.0.1:3185',identity,()=>{}],['wildcard listener','p123\nn*:3185',identity,()=>{}],
 ['wrong group','p123\nn127.0.0.1:3185',identity.replace('123 123','123 124'),()=>{}],
 ['reused PID','p123\nn127.0.0.1:3185',identity.replace('04:00:00','05:00:00'),()=>{}],
 ['foreign mapped executable','p123\nn127.0.0.1:3185',identity,x=>x.executableText='p123\nn/foreign/node'],
])test('readiness rejects '+name,()=>{const spec=args();modify(spec);assert.throws(()=>validateOwnedListener(listener,processLine,spec));});
const health=()=>({ok:true,status:'ready',workflowId:'workflow//eve//workflowEntry'});
test('selected SDK identity matches through the real proxy route',()=>assert.equal(validatePublicHealthPair(health(),health()).status,'DIRECT_AND_PROXY_SELECTED_HEALTH_MATCH'));
test('arbitrary ready health is insufficient',()=>assert.throws(()=>validatePublicHealthPair({...health(),workflowId:'other'},health())));
test('a different proxy runtime cannot be inherited from direct health',()=>assert.throws(()=>validatePublicHealthPair(health(),{...health(),workflowId:'other'})));
function witnesses(){return ['eve','next'].map((kind,index)=>({kind,listeners:[{pid:123+index,port:index?3188:3185,address:'127.0.0.1'}],httpRequests:[{pid:123+index,port:index?3188:3185,method:'GET',path:'/eve/v1/health',marker:'nonce-proxy'},...['/eve/v1/session','/eve/v1/session/session-a'].map(path=>({pid:123+index,port:index?3188:3185,path,method:'POST',marker:'nonce-chat'}))]}));}
const proxy={evePid:123,webPid:124,evePort:3185,webPort:3188,marker:'nonce'};
test('proxy nonce is observed at BOTH owned listeners',()=>assert.equal(validateProxyRouteWitnesses(witnesses(),proxy).status,'PROXY_HEALTH_AND_TWO_CHAT_WRITES_OBSERVED_AT_BOTH_OWNED_LISTENERS'));
for(const [name,change] of [['chat proxy bypass',x=>x[0].httpRequests=x[0].httpRequests.filter(row=>row.marker!=='nonce-chat')],['proxy bypass',x=>x[0].httpRequests=[]],['wrong Eve port',x=>x[0].httpRequests[0].port=3189],['foreign listener PID',x=>x[0].listeners[0].pid=456],['duplicate request',x=>x[0].httpRequests.push({...x[0].httpRequests[0]})]])
 test('proxy proof rejects '+name,()=>{const value=witnesses();change(value);assert.throws(()=>validateProxyRouteWitnesses(value,proxy));});
