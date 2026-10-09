/** Explicit paid-canary operator entry; never imported by build/request/worker. */
import {readFile,open,stat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {digest} from '../lib/engineering/contract.ts';
import {assertProductionApproval} from '../lib/engineering/production-approval.ts';
import {materializeValidationGrant} from './production-validation-materializer.ts';

export function validatePaidOperatorPreflight(envelope:any,approvedDigest:string,p:any,now=Date.now()){
 const a=assertProductionApproval(envelope,approvedDigest,now),release=a.release;
 if(!release||!['myeveCanonicalSha','factoryCanonicalSha'].every(k=>/^[a-f0-9]{40}$/.test(release[k]??''))||
  !['myeveMigrationSha256','factoryMigrationSha256'].every(k=>/^[a-f0-9]{64}$/.test(release[k]??''))||!p||p.status!=='PASS'||p.envelopeSha256!==approvedDigest||p.workId!==a.manifestTemplate.request.workId||
  p.configurationHash!==a.configurationHash||p.myeveCanonicalSha!==release.myeveCanonicalSha||p.factoryCanonicalSha!==release.factoryCanonicalSha||
  p.myeveMigrationSha256!==release.myeveMigrationSha256||p.factoryMigrationSha256!==release.factoryMigrationSha256||
  !Number.isFinite(Date.parse(p.observedAt))||now-Date.parse(p.observedAt)<0||now-Date.parse(p.observedAt)>120000||
  p.generalWork!=='DISABLED'||p.readOnlyBefore!=='ENABLED'||p.reusableGrants!==0||p.paidOperations!==0||p.publicationEffects!==0||
  p.operatorWriteWindowApproved!==true)throw Error('CURRENT_PAID_OPERATOR_PREFLIGHT_REQUIRED');
 if(a.ownerBinding&&(p.paidOperationScope!=='EXACT_OWNER_CLIENT'||digest(p.ownerBinding)!==digest(a.ownerBinding)||p.hostOwnerScope!==a.installation?.ownerScope||p.myeveAlphaMigration!=='0084_three_owner_cloud_accounting.sql'||p.myeveAlphaMigrationSha256!==release.myeveMigrationSha256||p.factoryAlphaMigration!=='010-three-owner-authority'||p.factoryAlphaMigrationSha256!==release.factoryMigrationSha256))throw Error('ALPHA_OPERATOR_PREFLIGHT_REQUIRED');
 return a;
}
async function main(){
 const args=process.argv.slice(2),allowed=new Set(['--envelope','--approved-envelope-sha256','--connections','--preflight','--audit','--install-paid-canary']);
 const get=(key:string)=>{const i=args.indexOf(key);if(i<0||args.indexOf(key,i+1)>=0||!args[i+1]||args[i+1].startsWith('--'))throw Error('OPERATOR_ARGUMENT_REQUIRED');return args[i+1];};
 if(!args.includes('--install-paid-canary')||args.some(a=>a.startsWith('--')&&!allowed.has(a)))throw Error('EXPLICIT_PAID_INSTALL_REQUIRED');
 const envelope=JSON.parse(await readFile(get('--envelope'),'utf8')),sha256=get('--approved-envelope-sha256');
 const preflight=JSON.parse(await readFile(get('--preflight'),'utf8')),approval=validatePaidOperatorPreflight(envelope,sha256,preflight);
 const path=get('--connections');if((await stat(path)).mode&0o077)throw Error('PRIVATE_CONNECTION_FILE_REQUIRED');
 const connections=JSON.parse(await readFile(path,'utf8')),{Client}=createRequire(import.meta.url)('pg');
 const client=(value:string,expectedHost:string)=>{
  const url=new URL(value);
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!==expectedHost||!url.hostname.endsWith('.neon.tech')||url.hostname.includes('-pooler.'))throw Error('QUALIFIED_UNPOOLED_DATABASE_REQUIRED');
  for(const k of ['sslmode','channel_binding','sslcert','sslkey','sslrootcert','uselibpqcompat'])url.searchParams.delete(k);
  const c=new Client({connectionString:url.href,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:5000,query_timeout:5000});c.on('error',()=>{});return c;
 };
 const owner=client(connections.myeve,preflight.databaseHosts.myeve),factory=client(connections.factory,preflight.databaseHosts.factory),log=await open(get('--audit'),'wx',0o600);
 try{
  await owner.connect();await factory.connect();
  await materializeValidationGrant(owner,factory,approval,async e=>{await log.write(JSON.stringify(e)+'\n');await log.sync();},{},{envelope,sha256});
  console.log('EXACT_PAID_CANARY_GRANT_INSTALLED');
 }finally{await Promise.allSettled([owner.end(),factory.end()]);await log.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('PAID_GRANT_OPERATOR_STOPPED: no retry; reconcile private audit, revoke exact authority and restore Read-Only.');process.exitCode=1;});
