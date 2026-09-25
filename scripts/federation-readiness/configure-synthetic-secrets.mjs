// Rotates ONLY recorded synthetic app roles; never copies source-role credentials.
// Values stay in memory and authenticated Vercel HTTPS requests. Raw provider/SQL errors are never emitted.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const { Client } = createRequire('/Users/jaywest/relay/package.json')('pg');
const team = 'team_p8z8exJRTGfOPk1GC9vUOpv3';
const target = JSON.parse(readFileSync(new URL('../../docs/federation/production-readiness/target-manifest.json', import.meta.url)));
const slots = { myeve: ['prj_L6faw25wnFGUZtrLKBIccg8gIDLR','codex/fq-a-6384519e0e01'], peer: ['prj_L6faw25wnFGUZtrLKBIccg8gIDLR','codex/fq-b-6384519e0e01'], relay: ['prj_3IRvr9knK5VJcBTgTYMvhv6ixmJK','codex/fq-relay-6384519e0e01'] };
async function api(path, body) {
 const auth=JSON.parse(readFileSync('/Users/jaywest/Library/Application Support/com.vercel.cli/auth.json','utf8'));
 const response=await fetch('https://api.vercel.com'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+auth.token,'Content-Type':'application/json'},body:body && JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 const result=await response.json();
 if(!response.ok){ report.providerStatus=response.status; report.providerErrorKeys=Object.keys(result.error??{}).filter(k=>/^[a-zA-Z_]{1,40}$/.test(k)); report.providerHints=['empty','Empty','branch','Branch','sensitive','Sensitive','Invalid','invalid','git','Git','value','Value','schema','Schema','not found','exist','team','project','secret','Secret','oneOf','anyOf'].filter(s=>JSON.stringify(result).includes(s));report.providerCode=/^[A-Za-z0-9_-]{1,80}$/.test(result.error?.code??'')?result.error.code:'REDACTED';throw Error('VERCEL_REQUEST_FAILED'); }
 return result;
}

const report = { observedAt:new Date().toISOString(), status:'PENDING', deploymentCreated:false, privateSigningKeyStored:false, databasesPreserved:true, slots:[] };
if (!process.argv.includes('--authorized-project-secret-storage')) throw Error('Explicit execution flag required');
try {
 for (const d of target.provisionedDatabases) {
  const [project,gitBranch] = slots[d.component] ?? [];
  if (!project || d.database !== `fq_${d.component}_6384519e0e01` || d.applicationRole !== `${d.database}_app`) throw Error('TARGET_MISMATCH');
  const path = `/v10/projects/${project}/env?teamId=${team}`;
  const existing = (await api(`/v9/projects/${project}/env?teamId=${team}`)).envs ?? [];
  // Refuse an accidental second run: explicit metadata reconciliation is required.
  if (existing.some(e => e.gitBranch === gitBranch)) throw Error('SLOT_ALREADY_CONFIGURED');
  const e = parseEnv(readFileSync(d.component === 'relay' ? '/Users/jaywest/relay/.env.local' : '/Users/jaywest/Myeve/apps/eve/.env.local','utf8'));
  const base = new URL(e.DATABASE_URL_UNPOOLED ?? e.POSTGRES_URL_NON_POOLING ?? e.RELAY_DATABASE_URL ?? e.DATABASE_URL);
  if (createHash('sha256').update(base.hostname).digest('hex') !== d.endpointFingerprint) throw Error('ENDPOINT_MISMATCH');
  base.searchParams.set('sslmode','verify-full');
  const admin = new Client({connectionString:base.toString(),connectionTimeoutMillis:10000,query_timeout:15000});
  let rotated = false;
  const record = {component:d.component,project,gitBranch,status:'PENDING',environment:[],runtimeLogin:'NOLOGIN'};report.slots.push(record);
  try {
   record.stage='connect'; await admin.connect();
   const {rows:[r]} = await admin.query('SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=$1',[d.applicationRole]);
   if (!r || Object.values(r).some(Boolean)) throw Error('ROLE_NOT_QUIESCENT');
   record.stage='rotate'; const password = randomBytes(32).toString('hex');
   await admin.query(`ALTER ROLE ${d.applicationRole} NOLOGIN PASSWORD '${password}'`);rotated=true;
   const app = new URL(base); app.username=d.applicationRole;app.password=password;app.pathname=`/${d.database}`;
   const values = Object.fromEntries(['DATABASE_URL','DATABASE_URL_UNPOOLED','POSTGRES_URL_NON_POOLING','POSTGRES_URL','POSTGRES_PRISMA_URL','POSTGRES_URL_NO_SSL'].map(k=>[k,app.toString()]));
   Object.assign(values,{PGHOST:app.hostname,PGHOST_UNPOOLED:app.hostname,POSTGRES_HOST:app.hostname,PGDATABASE:d.database,POSTGRES_DATABASE:d.database,PGUSER:d.applicationRole,POSTGRES_USER:d.applicationRole,PGPASSWORD:password,POSTGRES_PASSWORD:password,NEON_PROJECT_ID:'',FQ_TARGET_STATE:'INCOMPLETE',FQ_SESSION_ENABLED:'false'});
   if(d.component === 'relay') Object.assign(values,{RELAY_DATABASE_URL:app.toString(),RELAY_FEDERATION_ENABLED:'false',RELAY_V2_ACTIONS_ENABLED:'false',RELAY_CRYPTO_BACKEND:'kms-required-unconfigured',RELAY_ALLOW_SIGNUP:'false',RELAY_DATABASE_POOL_SIZE:'4',NEON_AUTH_BASE_URL:'',VITE_NEON_AUTH_URL:''});
   else Object.assign(values,{MYEVE_RELAY_ENABLED:'false',MYEVE_OWNER_ID:'',MYEVE_ACCESS_PASSWORD:'',MYEVE_SESSION_SECRET:'',BLOB_READ_WRITE_TOKEN:'',AI_GATEWAY_API_KEY:'',SUPERMEMORY_API_KEY:'',COMPOSIO_API_KEY:''});
   // Check all inherited preview variable names: no unknown inherited credential may escape review.
   const inherited = existing.filter(e=>!e.gitBranch && e.target?.includes('preview'));
   if(inherited.some(e=>!(e.key in values))) throw Error('UNREVIEWED_INHERITED_VARIABLE');
   record.stage='store'; await api(path,Object.entries(values).map(([key,value])=>({key,value,type:'sensitive',target:['preview'],gitBranch,comment:'Synthetic federation qualification only; incomplete and disabled. No production scope.'})));
   record.stage='verify'; const confirmed = (await api(`/v9/projects/${project}/env?teamId=${team}`)).envs ?? [];
   for (const key of Object.keys(values)) {
    const matches=confirmed.filter(e=>e.key===key && e.gitBranch===gitBranch);
    if(matches.length!==1 || matches[0].type!=='sensitive' || JSON.stringify(matches[0].target)!=='["preview"]') throw Error('SCOPE_VERIFICATION_FAILED');
    record.environment.push({id:matches[0].id,key,type:'sensitive',target:['preview'],gitBranch});
   }
   // Keep the DB unable to authenticate until target admission controls are ready.
   record.status='STORED_VERIFIED_DISABLED';
  } catch (error) {
   record.failure=['VERCEL_REQUEST_FAILED','VERCEL_RESPONSE_INVALID','ROLE_NOT_QUIESCENT','UNREVIEWED_INHERITED_VARIABLE','SCOPE_VERIFICATION_FAILED'].includes(error.message)?error.message:'DATABASE_OR_PROVIDER_FAILURE';
   record.status='FAILED_REQUIRES_METADATA_RECONCILIATION';
   if(rotated) await admin.query(`ALTER ROLE ${d.applicationRole} NOLOGIN PASSWORD NULL`).catch(()=>{record.runtimeLogin='REVOCATION_UNCONFIRMED';});
   throw Error('SYNTHETIC_CONFIGURATION_FAILED');
  } finally { await admin.end().catch(()=>{}); }
 }
 report.status='SYNTHETIC_DATABASE_SECRETS_STORED_NOLOGIN';
} catch {report.status='INCOMPLETE';process.exitCode=1;}
console.log(JSON.stringify(report,null,2));
