import {execFile} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {promisify} from 'node:util';
import {z} from 'zod';
import {manifestForSnapshot} from './base-preflight.ts';
import {digest,pathSchema,shaSchema} from './contract.ts';
import {factoryConnectionSchema,type FactoryConnection} from './factory-live-adapter.ts';
import {runtimeSchema} from './runtime.ts';
import {factorySpendAdmission} from './factory-spend.ts';
import {WorkError,type Work} from './types.ts';
import {localLiveFactoryEnabled} from './owner-app-switch.ts';
export {localLiveFactoryEnabled};

const exec=promisify(execFile);
/** The MyFactory private-alpha LIVE envelope: one Work may not exceed it. */
export const OWNER_APP_LIMITS={maxCostUsd:1.35,maxDurationSeconds:600} as const;
const loopbackOrigin=/^http:\/\/127\.0\.0\.1:\d{2,5}$/;

export const ownerAppProfileSchema=z.object({
 ownerId:z.string().min(1),agentId:z.string().min(1),
 repository:z.string().regex(/^[\w.-]+\/[\w.-]+$/),repositoryPath:z.string().startsWith('/'),
 baseBranch:z.string().regex(/^[\w/-]+$/),baseSha:shaSchema,
 allowedPaths:z.array(pathSchema).min(1).max(30),
 checks:z.array(z.object({id:z.string().regex(/^[\w-]+$/),command:z.string().min(1).max(2000)}).strict()).min(1).max(20),
 image:z.string().regex(/^sha256:[a-f0-9]{64}$/),
 brief:z.string().min(1).max(500).optional(),
 limits:z.object({maxCostUsd:z.number().positive().max(OWNER_APP_LIMITS.maxCostUsd),maxDurationSeconds:z.number().int().positive().max(OWNER_APP_LIMITS.maxDurationSeconds)}).strict(),
 connection:z.record(z.string(),z.unknown()),
}).strict();
export type OwnerAppProfile=z.infer<typeof ownerAppProfileSchema>;

/** The LIVE refusal in engineering_factory is lifted only for this switch, a loopback Factory and admitted spend. */
export function liveFactoryAuthorized(connection:FactoryConnection,env:NodeJS.ProcessEnv=process.env):boolean{
 return localLiveFactoryEnabled(env)&&!('source' in connection)&&connection.qualification.mode==='LIVE'&&
  loopbackOrigin.test(connection.origin)&&factorySpendAdmission(connection).allowed;
}
export async function readOwnerAppProfile(env:NodeJS.ProcessEnv=process.env):Promise<OwnerAppProfile>{
 return ownerAppProfileSchema.parse(JSON.parse(await readFile(env.MYEVE_FACTORY_OWNER_PROFILE!,'utf8')));
}

async function approvedBaseAt(repositoryPath:string,sha:string){
 const git=async(...args:string[])=>(await exec('git',['-C',repositoryPath,...args],{encoding:'utf8',maxBuffer:2_000_000,timeout:10_000})).stdout;
 if((await git('rev-parse','--verify',sha+'^{commit}')).trim()!==sha)throw new WorkError('factory_base','The pinned base commit is unavailable.',503);
 const paths=(await git('ls-tree','-r','--name-only','-z',sha)).split('\0').filter(Boolean);
 const files:Record<string,string>={};
 for(const path of paths)files[path]=await git('show',`${sha}:${path}`);
 return manifestForSnapshot({sha,files});
}

/** One reviewed owner profile; objective, criteria and check bindings come from the canonical Work. */
export async function ownerAppFactoryConfig(work:Work,value:unknown){
 const p=ownerAppProfileSchema.parse(value);
 const connection=factoryConnectionSchema.parse(p.connection) as FactoryConnection;
 if('source' in connection||!loopbackOrigin.test(connection.origin)||connection.qualification.mode!=='LIVE'||!connection.qualification.spendEnforced||
    connection.qualification.scopeId!==p.ownerId||connection.repositoryPath!==p.repositoryPath)
  throw new WorkError('factory_setup','The owner app profile requires a loopback LIVE MyFactory bound to this owner and repository.',503);
 if(work.scopeId!==p.ownerId||work.repository!==p.repository||work.maxCostUsd>p.limits.maxCostUsd||work.maxDurationSeconds>p.limits.maxDurationSeconds||
    work.criteria.some(c=>c.method!=='test'))
  throw new WorkError('factory_project_binding','Work must be the owner app repository, test criteria and the bounded envelope.',403);
 const criterionIds=work.criteria.map(c=>c.id);
 const profile={id:'owner-app',version:1,repository:p.repository,privateQualification:true as const,baseBranch:p.baseBranch,allowedPaths:p.allowedPaths,
  checks:p.checks.map(c=>({...c,criterionIds})),requiredCI:['myfactory-checks'],reviewerLogins:['owner'],policyVersion:1,
  executor:'claude-code' as const,image:p.image,maxRuns:1,maxModelRequests:4,maxOutputTokens:8192};
 const engineering=runtimeSchema.parse({mode:'owner-app-factory',ownerId:p.ownerId,agentId:p.agentId,objective:work.objective,criteria:work.criteria,
  profile,approvedBase:await approvedBaseAt(p.repositoryPath,p.baseSha),model:'none'});
 return {engineering,connection:{...connection,qualification:{...connection.qualification,profileHash:digest(engineering.profile)}},
  commands:p.checks.map(c=>c.command),routing:{intent:'PRODUCE' as const,boundedOperationQualified:false}};
}
