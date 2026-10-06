import {digest} from '../../lib/engineering/contract.ts';
export const slots=['A','B','C'] as const;
export function fixture(slot:typeof slots[number]='A'){
 const binding={slot,clientId:'sofie-alpha-'+slot.toLowerCase(),ownerScope:'disposable-owner-'+slot,sourceProjectId:'prj_disposable'+slot,rosterSha256:'d'.repeat(64),environment:'production',factoryProjectId:'prj_4hfceCN8l6wN1gUyYOzZLQ7aJapK'};
 const workId='11111111-1111-4111-8111-'+String(slots.indexOf(slot)+1).repeat(12),sourceDigest='a'.repeat(64),configurationDigest='b'.repeat(64);
 const envelope={version:1,expiresAt:new Date(Date.now()+600000).toISOString(),approval:{workVersion:1,configurationHash:'c'.repeat(64),ownerBinding:binding,manifestTemplate:{version:1,clientId:binding.clientId,ownerScope:binding.ownerScope,publication:false,environment:'CLOUD_PRODUCTION',sourceDigest,configurationDigest,factoryVersion:digest({sourceDigest,configurationDigest}),request:{protocol:'MYFACTORY_EXECUTION_V2',requestId:null,deadline:null,workId,workGeneration:1}}}};
 const config={mode:'CLOUD_PRODUCTION_CANARY',work:{id:workId,generation:1},engineering:{},factory:{},source:{sha:'a'.repeat(40),files:{}},authorizationEnvelope:envelope,authorizationSha256:digest(envelope)};
 const env={NODE_ENV:'test' as const,VERCEL:'1',VERCEL_ENV:'production',VERCEL_PROJECT_ID:binding.sourceProjectId,MYEVE_OWNER_ID:binding.ownerScope,MYEVE_ALPHA_OWNER_BINDING:JSON.stringify(binding),MYEVE_ALPHA_OWNER_ROSTER_SHA256:binding.rosterSha256,MYEVE_CLOUD_PRODUCTION_INSTALLATION:JSON.stringify({version:1,ownerScope:binding.ownerScope,projectId:binding.factoryProjectId,sourceDigest,origin:'https://myfactory-cloud-production.vercel.app'}),MYEVE_FACTORY_ALPHA_APPLICATION_TOKEN:'1'.repeat(64),FACTORY_PROOF_TOKEN:'2'.repeat(64),MYEVE_PRODUCTION_CANARY_CONFIG:JSON.stringify(config),MYEVE_PRODUCTION_CANARY_AUTHORIZATION_SHA256:config.authorizationSha256};
 return {binding,env,workId,envelope,config};
}
