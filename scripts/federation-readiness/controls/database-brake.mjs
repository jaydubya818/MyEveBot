import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

export function validateTarget(d) {
  if(!['myeve','peer','relay'].includes(d.component) || d.database!==`fq_${d.component}_6384519e0e01` || d.applicationRole!==`${d.database}_app`) throw Error('Non-qualification target refused');
  if(d.workerRole!==undefined&&(d.component==='relay'||d.workerRole!==`${d.database}_worker`))throw Error('Non-qualification worker role refused');
}
export async function freezeDatabase(admin,d) {
  validateTarget(d);
  // No table mutations, deletion, owner-role changes, or production-role changes.
  for(const role of [d.applicationRole,...(d.workerRole?[d.workerRole]:[])]){
   await admin.query(`ALTER ROLE ${role} NOLOGIN PASSWORD NULL`);
   await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename=$1 AND pid<>pg_backend_pid()',[role]);
  }
  return await verifyDatabaseBrake(admin,d);
}
export async function verifyDatabaseBrake(admin,d) {
  validateTarget(d);
  for(const role of [d.applicationRole,...(d.workerRole?[d.workerRole]:[])]){
  const {rows:[r]}=await admin.query('SELECT rolcanlogin FROM pg_roles WHERE rolname=$1',[role]);
  const {rows:[sessions]}=await admin.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename=$1',[role]);
  if(r?.rolcanlogin!==false||sessions.n!==0)return false;
  }return true;
}
async function main() {
 const freeze=process.argv.includes('--freeze-synthetic-only');
 if(!freeze&&!process.argv.includes('--verify-only'))throw Error('Mode required');
 const manifest=JSON.parse(readFileSync(new URL('../../../docs/federation/production-readiness/target-manifest.json',import.meta.url)));
 const {Client}=createRequire('/Users/jaywest/relay/package.json')('pg');
 const results=[];
 for(const d of manifest.provisionedDatabases){
  let admin;
  try {
   validateTarget(d);
   const e=parseEnv(readFileSync(d.component==='relay'?'/Users/jaywest/relay/.env.local':'/Users/jaywest/Myeve/apps/eve/.env.local','utf8'));
   const url=new URL(e.DATABASE_URL_UNPOOLED??e.POSTGRES_URL_NON_POOLING??e.RELAY_DATABASE_URL??e.DATABASE_URL);
   if(createHash('sha256').update(url.hostname).digest('hex')!==d.endpointFingerprint)throw Error('Endpoint mismatch');
   url.searchParams.set('sslmode','verify-full');
   admin=new Client({connectionString:url.toString(),connectionTimeoutMillis:10000,query_timeout:15000});await admin.connect();
   const verified=freeze?await freezeDatabase(admin,d):await verifyDatabaseBrake(admin,d);
   results.push({component:d.component,verified,mode:freeze?'FROZEN_PASSWORD_CLEARED':'READ_ONLY_NOLOGIN_NO_SESSIONS'});
  } catch {results.push({component:d.component,verified:false,error:'CONTROL_UNCONFIRMED'});}
  finally {await admin?.end().catch(()=>{});}
 }
 console.log(JSON.stringify({observedAt:new Date().toISOString(),results},null,2));
 if(results.some(r=>!r.verified))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Database brake failed; raw error suppressed');process.exitCode=1;});
