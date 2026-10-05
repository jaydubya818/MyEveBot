/** Explicit operator entry point. Never called by build/start/request handling. */
import {readFile,open,stat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {digest} from '../lib/engineering/contract.ts';
import {materializeValidationGrant} from './production-validation-materializer.ts';

export function validateOperatorPreflight(envelope:Record<string,any>,preflight:Record<string,any>,now=Date.now()){
  const timestamp=Date.parse(preflight.observedAt),age=now-timestamp;
  if(preflight.status!=='PASS'||preflight.workId!==envelope.work.id||preflight.envelopeSha256!==digest(envelope)||
    !Number.isFinite(Date.parse(preflight.observedAt))||
    preflight.myeveCanonicalSha!==envelope.installation.myeveCanonicalSha||preflight.factoryCanonicalSha!==envelope.installation.factoryCanonicalSha||
    preflight.migrationSha256!==envelope.migration.sha256||preflight.configurationHash!==envelope.materializer.configurationHash||
    age<0||age>120000||
    preflight.readOnlyBefore!=='ENABLED'||preflight.generalWork!=='DISABLED'||preflight.reusableGrants!==0||
    preflight.paidOperations!==0||preflight.publicationEffects!==0||preflight.operatorWriteWindowApproved!==true)throw Error('CURRENT_OPERATOR_PREFLIGHT_REQUIRED');
}

async function main(){
  const args=process.argv.slice(2);
  const get=(name:string)=>{const i=args.indexOf(name);if(i<0||!args[i+1]||args[i+1].startsWith('--'))throw Error('OPERATOR_ARGUMENT_REQUIRED');return args[i+1];};
  const allowed=new Set(['--envelope','--approved-envelope-sha256','--connections','--preflight','--audit','--install']);
  if(args.some(arg=>arg.startsWith('--')&&!allowed.has(arg))||!args.includes('--install'))throw Error('EXPLICIT_INSTALL_ARGUMENT_REQUIRED');
  const envelope=JSON.parse(await readFile(get('--envelope'),'utf8'));
  if(digest(envelope)!==get('--approved-envelope-sha256')||envelope.kind!=='NEW_MODEL_FREE_PRODUCTION_VALIDATION_APPROVAL'||!envelope.materializer||
    envelope.authority.installed!==false||envelope.authority.requestId!==null||envelope.authority.deadline!==null||
    envelope.authority.model!=='none'||envelope.authority.modelOperations!==0||envelope.authority.paidModelOperations!==0||
    envelope.authority.publicationEffects!==0||envelope.authority.maxDurationSeconds!==180||envelope.authority.maxAttempts!==1||
    envelope.authority.generalWork!=='DISABLED'||envelope.materializer.manifestTemplate.request.workId!==envelope.work.id||
    envelope.materializer.manifestTemplate.request.workGeneration!==envelope.work.generation||
    envelope.materializer.workVersion!==envelope.work.version||envelope.materializer.manifestTemplate.ownerScope!==envelope.ownerScope)throw Error('APPROVED_ENVELOPE_REQUIRED');
  const preflight=JSON.parse(await readFile(get('--preflight'),'utf8'));
  validateOperatorPreflight(envelope,preflight);
  const connectionPath=get('--connections');
  if((await stat(connectionPath)).mode&0o077)throw Error('PRIVATE_CONNECTION_FILE_REQUIRED');
  const connections=JSON.parse(await readFile(connectionPath,'utf8'));
  const {Client}=createRequire(import.meta.url)('pg');
  const client=(value:string,expectedHost:string)=>{
    const url=new URL(value);
    if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!==expectedHost||!url.hostname.endsWith('.neon.tech')||url.hostname.includes('-pooler.'))throw Error('QUALIFIED_UNPOOLED_DATABASE_REQUIRED');
    for(const key of ['sslmode','channel_binding','sslcert','sslkey','sslrootcert','uselibpqcompat'])url.searchParams.delete(key);
    const c=new Client({connectionString:url.href,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:5000,query_timeout:5000});
    c.on('error',()=>{});return c;
  };
  const owner=client(connections.myeve,preflight.databaseHosts.myeve),factory=client(connections.factory,preflight.databaseHosts.factory);
  // Exclusive evidence file prevents silently replacing an earlier attempt.
  const log=await open(get('--audit'),'wx',0o600);
  try{
    await owner.connect();await factory.connect();
    const result=await materializeValidationGrant(owner,factory,envelope.materializer,async event=>{
      await log.write(JSON.stringify(event)+'\n');await log.sync();
    });
    console.log(JSON.stringify(result));
  }finally{
    await Promise.allSettled([owner.end(),factory.end()]);await log.close();
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('VALIDATION_GRANT_OPERATOR_STOPPED: inspect structured audit; no automatic retry; independently reconcile authority/lifecycle and restore Read-Only.');process.exitCode=1;});
