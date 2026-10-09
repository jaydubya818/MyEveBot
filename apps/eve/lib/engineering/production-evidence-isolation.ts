import {factoryRequestHeaders} from './factory-request-headers.ts';
import {factoryTransport} from './factory-transport.ts';
import {boundedJson} from '../relay/client.ts';
import {FactoryEvidenceStore} from './factory-evidence-store.ts';
import {WorkStore} from './store.ts';
import {WorkError} from './types.ts';
import type {FactoryConnection} from './factory-live-adapter.ts';
import type {verifyEvidence} from './factory-evidence.ts';

/** Read-only negative probes against the same retained evidence. Only an exact
 * not-found response counts as isolation; outages and authentication failures do not. */
export async function productionEvidenceIsolation(store:WorkStore,connection:FactoryConnection,resultId:string,evidence:ReturnType<typeof verifyEvidence>[],fetcher:typeof fetch=fetch){
 const credential=connection.evidence;
 if(!credential||credential.token===connection.token||credential.ownerScope!==store.principal.scopeId||Date.parse(credential.expiresAt)<=Date.now())throw Error('VALIDATION_PROOF_CREDENTIAL');
 const deniedOwner='00000000-0000-4000-8000-000000000001',deniedWork='00000000-0000-4000-8000-000000000002';
 if(store.principal.scopeId===deniedOwner||evidence.some(e=>e.scope.workId===deniedWork))throw Error('VALIDATION_NEGATIVE_SCOPE_COLLISION');
 const config={...connection,token:credential.token,releaseValidation:undefined},transport=factoryTransport(config);
 for(const item of evidence){
  const binding={...item.scope,workOrderId:item.ref.workOrderId,runId:item.ref.runId,candidateCommit:item.ref.candidateCommit,factoryVersion:item.ref.factoryVersion,evidenceReference:item.proofReference,expectedDigest:item.ref.sha256,evidenceKind:item.ref.kind};
  for(const patch of [{ownerScope:deniedOwner},{workId:deniedWork}]){
   const response=await fetcher(new URL(transport.prefix+'/evidence/read',transport.origin),{method:'POST',headers:{...await factoryRequestHeaders(config),'content-type':'application/json'},body:JSON.stringify({...binding,...patch}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
   const body=await boundedJson(response,4096);
   if(response.status!==404||JSON.stringify(body)!==JSON.stringify({error:'NOT_FOUND'}))throw Error('VALIDATION_FACTORY_ISOLATION_FAILED');
  }
  const foreign=new WorkStore({scopeId:deniedOwner,actorId:deniedOwner,scopeKind:'personal'},store.database);
  for(const [reader,workId] of [[new FactoryEvidenceStore(foreign),item.scope.workId],[new FactoryEvidenceStore(store),deniedWork]] as const){
   let denied=false;
   try{await reader.readProof(workId,resultId,item.proofReference);}catch(error){denied=error instanceof WorkError&&error.code==='work_not_found';}
   if(!denied)throw Error('VALIDATION_MYEVE_ISOLATION_FAILED');
  }
 }
 return {factoryCrossOwner:'DENIED',factoryCrossWork:'DENIED',myEveCrossOwner:'DENIED',myEveCrossWork:'DENIED',crossOwnerDisclosures:0,crossWorkDisclosures:0} as const;
}
