import test from 'node:test';
import assert from 'node:assert/strict';
import {observeFailureModelCounts} from './current-runtime-failure.mjs';
const fixture=()=>({created:true,closed:true,active:0,httpRequests:1,failedRequests:1,unexpectedPaths:2,probe:{calls:1,requests:[{}]}});
test('failed build retains measured nonzero HTTP/model failures after quiescence',()=>{
 const result=observeFailureModelCounts(fixture());assert.equal(result.httpRequests,1);assert.equal(result.failedRequests,1);
 assert.equal(result.unexpectedPaths,2);assert.equal(result.probeCalls,1);assert.equal(result.finalized,true);
});
test('actual observed zero is retained only for an existing observed server',()=>{
 const result=observeFailureModelCounts({...fixture(),httpRequests:0,failedRequests:0,unexpectedPaths:0,probe:{calls:0,requests:[]}});
 assert.equal(result.httpRequests,0);assert.equal(result.probeCalls,0);assert.equal(result.finalized,true);
});
test('a server never created reports unavailable counters rather than inferred zero',()=>{
 const result=observeFailureModelCounts({...fixture(),created:false,closed:false});assert.equal(result.httpRequests,null);
 assert.equal(result.probeCalls,null);assert.equal(result.finalized,false);assert.equal(result.status,'MODEL_SERVER_NOT_CREATED');
});
for(const update of [{closed:false},{active:1}])test('incomplete model cleanup is a retained snapshot',()=>{
 const result=observeFailureModelCounts({...fixture(),...update});assert.equal(result.finalized,false);
 assert.equal(result.status,'OBSERVED_SNAPSHOT_CLEANUP_UNKNOWN');assert.equal(result.httpRequests,1);
});
test('failure evidence records an error digest without secret messages',()=>{
 const result=observeFailureModelCounts({...fixture(),failure:Error('SYNTHETIC_SECRET_VALUE')});
 assert.equal(result.failure.name,'Error');assert.match(result.failure.messageSha256,/^[a-f0-9]{64}$/);
 assert(!JSON.stringify(result).includes('SYNTHETIC_SECRET_VALUE'));
});
test('invalid or inconsistent observed counters fail closed',()=>{
 for(const update of [{httpRequests:-1},{failedRequests:NaN},{probe:{calls:1,requests:[]}}])
  assert.throws(()=>observeFailureModelCounts({...fixture(),...update}),/FAILURE_MODEL_/);
});
