import {isAbsolute} from 'node:path';
import {z} from 'zod';
import {externalAlphaInstallation} from '../external-alpha/policy.ts';
import {digest,validateRuntime} from '../../../../packages/myapps/src/alpha-tasks/contracts.ts';

const text=z.string().min(1).max(200);
const registration=z.object({version:z.literal(1),kind:z.literal('OWNER_FACTORY'),ownerId:text,
  installationId:text,agentId:text,runtimeId:text,target:text,sourceRoot:z.string().max(1000).refine(isAbsolute),
  runtime:z.unknown().transform(validateRuntime)}).strict();

/** Operator registration is inert without every existing local/owner/capability gate.
 * This does not allow hosted or external-tester use and never reads credentials. */
export function localOwnerAppsConfiguration(env:NodeJS.ProcessEnv=process.env) {
  const raw=env.MYAPPS_LOCAL_REGISTRATION;
  if(!raw)return null;
  if(process.env.NODE_ENV==='production'||process.env.VERCEL||env.NODE_ENV==='production'||env.VERCEL
    ||env.VERCEL_ENV==='production'||externalAlphaInstallation(env)||env.MYAPPS_LOCAL_INTEGRATION!=='1'
    ||env.MYEVE_MISSIONCONTROL_MODE!=='APPROVED_NONPRODUCTION'||env.MYEVE_CAPABILITY_CONTROL_ENABLED!=='true'
    ||env.MYEVE_CAPABILITY_ENVIRONMENT!=='qualification'||!env.DATABASE_URL
    ||env.MYEVE_CAPABILITY_DATABASE_URL!==env.DATABASE_URL||Buffer.byteLength(raw)>20000)throw Error('APP_LOCAL_REGISTRATION_DENIED');
  const config=registration.parse(JSON.parse(raw));
  if(config.ownerId!==env.MYEVE_OWNER_ID||config.installationId!==env.MYEVE_CAPABILITY_INSTALLATION_ID
    ||digest(config)!==env.MYAPPS_LOCAL_REGISTRATION_SHA256)throw Error('APP_LOCAL_REGISTRATION_DENIED');
  return config;
}
export function localOwnerAppsConfigured(env:NodeJS.ProcessEnv=process.env) {
  try{return Boolean(localOwnerAppsConfiguration(env));}catch{return false;}
}
