import {assertProductionApproval} from './production-approval.ts';
import {z} from 'zod';
import {productionInstallation} from './production-installation.ts';

export function productionValidationEnabled(env:NodeJS.ProcessEnv=process.env){
 return env.VERCEL==='1'&&env.VERCEL_ENV==='production'&&env.VERCEL_PROJECT_ID==='prj_L6faw25wnFGUZtrLKBIccg8gIDLR'&&!!env.MYEVE_PRODUCTION_VALIDATION_CONFIG;
}
const configSchema=z.object({mode:z.literal('OPERATOR_DETERMINISTIC_VALIDATION'),
 work:z.object({id:z.uuid(),generation:z.number().int().positive()}).strict(),
 engineering:z.record(z.string(),z.unknown()),factory:z.record(z.string(),z.unknown()),
 source:z.object({sha:z.string().regex(/^[a-f0-9]{40}$/),files:z.record(z.string(),z.string().max(100000))}).strict(),
}).strict();
/** Reviewed server-only release probe, not a general Work/model enable switch. */
export function productionValidationConfiguration(env:NodeJS.ProcessEnv=process.env){
 if(!productionValidationEnabled(env)||env.MYEVE_CLOUD_QUALIFICATION_CONFIG||env.MYEVE_CLOUD_DETERMINISTIC_ENABLED||env.MYEVE_FACTORY_REAL_EXECUTION_APPROVED==='true'||env.MYEVE_FACTORY_LOCAL_WORKER==='true')throw Error('PRODUCTION_VALIDATION_DISABLED');
 productionInstallation(env);
 const raw=env.MYEVE_PRODUCTION_VALIDATION_CONFIG!;if(Buffer.byteLength(raw)>100000)throw Error('PRODUCTION_VALIDATION_CONFIG_BOUND');
 return configSchema.parse(JSON.parse(raw));
}

export function productionCanaryEnabled(env:NodeJS.ProcessEnv=process.env){
 return env.VERCEL==='1'&&env.VERCEL_ENV==='production'&&env.VERCEL_PROJECT_ID==='prj_L6faw25wnFGUZtrLKBIccg8gIDLR'&&!!env.MYEVE_PRODUCTION_CANARY_CONFIG&&/^[a-f0-9]{64}$/.test(env.MYEVE_PRODUCTION_CANARY_AUTHORIZATION_SHA256??'');
}
const canarySchema=configSchema.extend({mode:z.literal('CLOUD_PRODUCTION_CANARY'),authorizationSha256:z.string().regex(/^[a-f0-9]{64}$/),authorizationEnvelope:z.record(z.string(),z.unknown())}).strict();
export function productionCloudEnabled(env:NodeJS.ProcessEnv=process.env){return productionValidationEnabled(env)||productionCanaryEnabled(env);}
export function productionCloudConfiguration(env:NodeJS.ProcessEnv=process.env){
 if(productionValidationEnabled(env)){
  if(env.MYEVE_PRODUCTION_CANARY_CONFIG||env.MYEVE_PRODUCTION_CANARY_AUTHORIZATION_SHA256)throw Error('PRODUCTION_AUTHORITY_CONFLICT');
  return productionValidationConfiguration(env);
 }
 if(!productionCanaryEnabled(env)||env.MYEVE_CLOUD_QUALIFICATION_CONFIG||env.MYEVE_CLOUD_DETERMINISTIC_ENABLED||env.MYEVE_FACTORY_LOCAL_WORKER==='true'||env.MYEVE_FACTORY_REAL_EXECUTION_APPROVED==='true')throw Error('PRODUCTION_CANARY_DISABLED');
 productionInstallation(env);
 const raw=env.MYEVE_PRODUCTION_CANARY_CONFIG!;if(Buffer.byteLength(raw)>100000)throw Error('PRODUCTION_CANARY_CONFIG_BOUND');
 const config=canarySchema.parse(JSON.parse(raw));
 if(config.authorizationSha256!==env.MYEVE_PRODUCTION_CANARY_AUTHORIZATION_SHA256)throw Error('PRODUCTION_CANARY_AUTHORITY_MISMATCH');
 const approval=assertProductionApproval(config.authorizationEnvelope,config.authorizationSha256,Date.now(),false);
 if(approval.manifestTemplate.request.workId!==config.work.id||approval.manifestTemplate.request.workGeneration!==config.work.generation)throw Error('PRODUCTION_APPROVAL_WORK');
 return config;
}
