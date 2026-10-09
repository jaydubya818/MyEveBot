import {alphaOwnerBindingSchema} from './alpha-owner-binding.ts';
import {digest} from './contract.ts';
/** The approval contains only pre-activation values. UUID/deadline are null;
 * the concrete grant adds those values later, without changing the approval. */
export function assertProductionApproval(envelope:any, expectedDigest:string, now=Date.now(),requireLive=true) {
 const a=envelope?.approval,t=a?.manifestTemplate,r=t?.request;
 if(!/^[a-f0-9]{64}$/.test(expectedDigest)||digest(envelope)!==expectedDigest||
  Object.keys(envelope??{}).sort().join(',')!=='approval,expiresAt,version'||envelope.version!==1||
  !Number.isFinite(Date.parse(envelope.expiresAt))||(requireLive&&Date.parse(envelope.expiresAt)<=now)||
  !a||!Number.isSafeInteger(a.workVersion)||a.workVersion<1||!t||t.version!==1||
  !['sofie-production','sofie-alpha-a','sofie-alpha-b','sofie-alpha-c'].includes(t.clientId)||t.publication!==false||t.environment!=='CLOUD_PRODUCTION'||
  !r||r.requestId!==null||r.deadline!==null||r.protocol!=='MYFACTORY_EXECUTION_V2'||
  !Number.isSafeInteger(r.workGeneration)||r.workGeneration<1||
  !/^[a-f0-9]{64}$/.test(a.configurationHash)||
  t.factoryVersion!==digest({sourceDigest:t.sourceDigest,configurationDigest:t.configurationDigest}))throw Error('PRODUCTION_APPROVAL_INVALID');
 if(t.clientId!=='sofie-production'){const binding=alphaOwnerBindingSchema.parse(a.ownerBinding);if(binding.clientId!==t.clientId||binding.ownerScope!==t.ownerScope)throw Error('ALPHA_OWNER_APPROVAL_BINDING');}
 else if(a.ownerBinding)throw Error('ALPHA_OWNER_APPROVAL_BINDING');
 return a;
}
