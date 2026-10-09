import {emergencyStop} from './postgres.mjs';
import {relayRevocationAdapters} from './stop-adapters.mjs';
import {railwayStopAdapter} from './railway-stop.mjs';
import {freezeDatabase} from './database-brake.mjs';
import {evidenceAdapter} from './evidence.mjs';
/** Run from the independent operator process, never from a worker that it stops.
 * Pools are explicit, scoped credentials loaded by the operator out of band. */
export function hostedEmergencyStop({authority,relayPool,evidencePool,databaseTargets,relayScope,railway,controllerUrl,operatorToken,request=fetch}){
 const origin=new URL(controllerUrl);if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.username||origin.password)throw Error('CONTROLLER_HTTPS_REQUIRED');
 if(databaseTargets.length!==3||new Set(databaseTargets.map(d=>d.component)).size!==3)throw Error('THREE_DATABASE_TARGETS_REQUIRED');
 const adapters={...relayRevocationAdapters(relayPool,relayScope),stopWorkers:railwayStopAdapter({...railway,request}),
  async disableModelCredentials(signal){
   const response=await request(new URL('/disable-model',origin),{method:'POST',redirect:'error',signal,headers:{'content-type':'application/json',authorization:`Bearer ${operatorToken}`},body:JSON.stringify({session:authority.id})});
   return response.ok&&(await response.json()).disabled===true;
  },
  preserveEvidence:evidenceAdapter(evidencePool,authority),
  async freezeDatabaseLogins(){const outcomes=await Promise.allSettled(databaseTargets.map(d=>freezeDatabase(d.admin,d)));return outcomes.every(r=>r.status==='fulfilled'&&r.value===true);},
 };
 return ()=>emergencyStop(authority,adapters);
}
