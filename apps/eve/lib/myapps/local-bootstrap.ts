import pg from 'pg';
import {constants} from 'node:fs';
import {lstat,open} from 'node:fs/promises';
import {join} from 'node:path';
import type {GoalPool} from '../goal-work/database.ts';
import type {WorkDatabase} from '../engineering/store.ts';
import {capabilityConfiguration} from '../capability-control/runtime.ts';
import {localOwnerAppsConfiguration} from './local-configuration.ts';
import {bindLocalApps,localAppsAllowed} from './hosting.ts';
import {composeLocalAlphaTasks} from './alpha-tasks-host.ts';
import {PersistentApps} from './runtime.ts';
import {retainedOwnerTasksOrigin} from './owner-tasks-result.ts';
import {alphaTasksAppId,digest,PROFILE,validateAlphaTasksPackage} from '../../../../packages/myapps/src/alpha-tasks/contracts.ts';
import {verifySourceClosure,sourceClosureDigest} from '../../../../packages/myapps/src/alpha-tasks/source.ts';

type Configuration=NonNullable<ReturnType<typeof localOwnerAppsConfiguration>>;
/** Only an operator's content-addressed source store is read. Requests cannot choose paths. */
export async function readLocalAppSource(config:Configuration,tree:string) {
  if(!/^[a-f0-9]{40}$/.test(tree))throw Error('APP_SOURCE_UNAVAILABLE');
  const root=await lstat(config.sourceRoot);
  if(!root.isDirectory()||root.isSymbolicLink()||root.uid!==process.getuid?.()||(root.mode&0o022)!==0)throw Error('APP_SOURCE_UNAVAILABLE');
  const file=await open(join(config.sourceRoot,tree+'.json'),constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const stat=await file.stat();
    if(!stat.isFile()||stat.uid!==process.getuid?.()||(stat.mode&0o022)!==0||stat.size>6*1024*1024)throw Error('APP_SOURCE_UNAVAILABLE');
    const bytes=Buffer.alloc(stat.size+1),read=await file.read(bytes,0,bytes.length,0);
    if(read.bytesRead!==stat.size)throw Error('APP_SOURCE_UNAVAILABLE');
    return verifySourceClosure(JSON.parse(bytes.subarray(0,read.bytesRead).toString('utf8')),tree);
  } finally {await file.close();}
}

function workDatabase(pool:GoalPool):WorkDatabase {
  const atomic=async<T>(body:(db:WorkDatabase)=>Promise<T>)=>{
    const c=await pool.connect();
    try{await c.query('BEGIN');const value=await body({query:async(sql,params)=>(await c.query(sql,params)).rows});await c.query('COMMIT');return value;}
    catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
  };
  return {atomic,query:(sql,params)=>atomic(db=>db.query(sql,params))};
}

export function createLocalOwnerApps(pool:GoalPool,config:Configuration) {
  const custody={kind:'OWNER_FACTORY' as const};
  const alphaTasks=composeLocalAlphaTasks(pool,{...config,custody,profiles:[config.runtime],
    source:pkg=>readLocalAppSource(config,pkg.origin.candidateTree)});
  const policy=async(ownerId:string)=>{
    if(!localAppsAllowed()||ownerId!==config.ownerId)throw Error('APP_UNAVAILABLE');
    return {ownerId,actorId:ownerId,kind:'human' as const,allowedOperations:['apps.read','apps.manage','apps.install','apps.run']};
  };
  // This registration qualifies Alpha Tasks only. Explicit legacy bindings still
  // serve their local web adapter, but do not grant Sofie registry availability.
  const apps=new PersistentApps(pool,{runtimeId:config.runtimeId,target:config.target,enabled:()=>false,
    verifyResult:async()=>{throw Error('APP_RUNTIME_UNQUALIFIED');}});
  return {apps,alphaTasks,policy,legacyAvailable:false,async prepareResult(resultId:string,version:number){
    if(!/^[a-f0-9-]{36}$/.test(resultId)||!Number.isSafeInteger(version)||version<1)throw Error('APP_INPUT_INVALID');
    const p=await policy(config.ownerId),retained=await retainedOwnerTasksOrigin(workDatabase(pool),config.ownerId,resultId,custody);
    const source=await readLocalAppSource(config,retained.origin.candidateTree);
    const appId=alphaTasksAppId(config.ownerId,config.installationId,retained.origin.missionId);
    const existing=(await alphaTasks.catalog(p)).find(app=>app.appId===appId);
    const pkg=validateAlphaTasksPackage({format:'myeve.app-package.alpha-tasks.v1',appId,version,
      spec:{ownerId:config.ownerId,profile:PROFILE},origin:retained.origin,sourceClosureDigest:sourceClosureDigest(source),runtime:config.runtime,
      base:existing?.installedVersion?{version:existing.installedVersion,digest:existing.installedDigest}:null,
      migration:'identity',installation:'explicit-owner-decision'});
    await alphaTasks.prepare(p,pkg);
    return {appId,version,packageDigest:digest(pkg),installation:'OWNER_DECISION_REQUIRED'};
  }};
}

let current:{key:string;pool:pg.Pool;binding:ReturnType<typeof createLocalOwnerApps>}|undefined;
/** Lazy server bootstrap. No registration means no pool, filesystem read or mutation. */
export function ensureConfiguredLocalApps() {
  const config=localOwnerAppsConfiguration();
  if(!config){if(current)throw Error('APP_LOCAL_REGISTRATION_CHANGED');return null;}
  const capability=capabilityConfiguration();
  if(capability.id!==config.installationId||capability.environment!=='qualification'||capability.databaseUrl!==process.env.DATABASE_URL)
    throw Error('APP_LOCAL_REGISTRATION_DENIED');
  const key=digest({config,database:capability.databaseUrl});
  if(current){if(current.key!==key)throw Error('APP_LOCAL_REGISTRATION_CHANGED');return current.binding;}
  const pool=new pg.Pool({connectionString:capability.databaseUrl,max:4,connectionTimeoutMillis:5000,
    statement_timeout:15000,idle_in_transaction_session_timeout:15000});
  pool.on('error',()=>console.error('myapps_local_database_unavailable'));
  const binding=createLocalOwnerApps(pool,config);
  bindLocalApps(binding);current={key,pool,binding};return binding;
}
/** Used only when the operator preparation process exits; never grants a new binding. */
export async function closeLocalAppsBootstrap(){await current?.pool.end();}
