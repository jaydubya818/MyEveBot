import test from 'node:test';
import assert from 'node:assert/strict';
import {assertFinalModelObservation} from './current-runtime-accounting.mjs';
const value=()=>({httpRequests:2,failedRequests:0,unexpectedPaths:0,calls:2,requests:[{index:1},{index:2}]});
test('only the final unchanged live model observation is accepted',()=>assert.equal(assertFinalModelObservation(value(),value()).status,'MODEL_OBSERVATION_FINAL_AND_UNCHANGED'));
for(const [name,mutate] of [['late HTTP retry',x=>x.httpRequests++],['late failed request',x=>x.failedRequests++],['late path',x=>x.unexpectedPaths++],['late reply',x=>x.requests[1].index=3]])
 test(name+' invalidates an earlier successful snapshot',()=>{const actual=value();mutate(actual);assert.throws(()=>assertFinalModelObservation(value(),actual));});
test('a late server/handler error is retained exactly',()=>{const original=Error('late-handler');assert.throws(()=>assertFinalModelObservation(value(),value(),original),error=>error===original);});
