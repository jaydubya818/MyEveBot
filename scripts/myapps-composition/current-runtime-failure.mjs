import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

/** Actual failed-attempt counters, never inferred from an earlier run or from
 * absence of a proof. Incomplete shutdown is explicitly a snapshot, not final. */
export function observeFailureModelCounts({created,closed,active,httpRequests,failedRequests,unexpectedPaths,probe,failure}){
 assert(typeof created==='boolean'&&typeof closed==='boolean','FAILURE_MODEL_STATE');
 if(!created)return {status:'MODEL_SERVER_NOT_CREATED',finalized:false,httpRequests:null,failedRequests:null,unexpectedPaths:null,activeHandlers:null,probeCalls:null};
 for(const value of [active,httpRequests,failedRequests,unexpectedPaths,probe.calls])
  assert(Number.isSafeInteger(value)&&value>=0,'FAILURE_MODEL_COUNTER');
 assert(Array.isArray(probe.requests)&&probe.requests.length===probe.calls,'FAILURE_MODEL_PROBE_COUNTER');
 return {status:closed&&active===0?'OBSERVED_AFTER_MODEL_SERVER_CLOSE_AND_HANDLER_DRAIN':'OBSERVED_SNAPSHOT_CLEANUP_UNKNOWN',
  finalized:closed&&active===0,httpRequests,failedRequests,unexpectedPaths,activeHandlers:active,probeCalls:probe.calls,
  failure:failure?{name:failure.name,messageSha256:createHash('sha256').update(String(failure.message)).digest('hex')}:null};
}
