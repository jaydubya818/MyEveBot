import { readFileSync, writeFileSync, mkdtempSync, chmodSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const { Client } = createRequire('/Users/jaywest/relay/package.json')('pg');
const existingTarget = JSON.parse(readFileSync(new URL('../../docs/federation/production-readiness/target-manifest.json', import.meta.url), 'utf8'));
if (existingTarget.provisionedDatabases?.length) throw new Error('Qualification databases already exist; reuse the recorded resources.');
if (!process.argv.includes('--authorized-empty-databases')) throw new Error('Explicit authorization flag required');
const directory=mkdtempSync('/private/tmp/fq-authorized-secrets-');chmodSync(directory,0o700);
const suffix=randomBytes(6).toString('hex');const made=[];
const report={status:'PENDING',secretReferenceDirectory:directory,databases:[],productionDataCopied:false};
try {
 for(const component of ['myeve','peer','relay']) {
  const source=component==='relay'?'/Users/jaywest/relay/.env.local':'/Users/jaywest/Myeve/apps/eve/.env.local';
  const e=parseEnv(readFileSync(source,'utf8'));const url=new URL(e.DATABASE_URL_UNPOOLED??e.POSTGRES_URL_NON_POOLING??e.RELAY_DATABASE_URL??e.DATABASE_URL);url.searchParams.set('sslmode','verify-full');
  const admin=new Client({connectionString:url.toString(),connectionTimeoutMillis:10000,query_timeout:15000});await admin.connect();
  const database=`fq_${component}_${suffix}`, role=`${database}_app`, owner=`${database}_owner`, password=randomBytes(32).toString('hex');
  const state={admin,database,role,owner};made.push(state);
  const {rows:[capacity]}=await admin.query("SELECT sum(pg_database_size(oid))::bigint AS bytes FROM pg_database WHERE NOT datistemplate");if(BigInt(capacity.bytes)>400n*1024n*1024n)throw Error('Capacity bound');
  report.stage='create_nonlogin_owner';await admin.query(`CREATE ROLE ${owner} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  report.stage='create_application_role';await admin.query(`CREATE ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 4 PASSWORD '${password}'`);
  report.stage='inspect_roles';const {rows:[priv]}=await admin.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=$1',[role]);if(Object.values(priv).some(Boolean))throw Error('Privilege check');
  const {rows:[membership]}=await admin.query('SELECT count(*)::int AS n FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1)',[role]);if(membership.n)throw Error('Inherited membership');
  report.stage='inspect_existing_objects';const {rows:[access]}=await admin.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','f','S') AND (CASE WHEN c.relkind='S' THEN has_sequence_privilege($1,c.oid,'USAGE,SELECT,UPDATE') ELSE has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') END)",[role]);if(access.n)throw Error('Existing object privilege');
  report.stage='inspect_definer_functions';const {rows:[functions]}=await admin.query("SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prosecdef AND has_function_privilege($1,p.oid,'EXECUTE')",[role]);if(functions.n)throw Error('Existing definer privilege');
  report.stage='inspect_schema_privileges';const {rows:[schemas]}=await admin.query("SELECT count(*)::int AS n FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema') AND nspname NOT LIKE 'pg_toast%' AND has_schema_privilege($1,oid,'CREATE')",[role]);if(schemas.n)throw Error('Existing schema privilege');
  report.stage='grant_synthetic_owner_to_admin';await admin.query(`GRANT ${owner} TO CURRENT_USER WITH SET TRUE`);
  report.stage='create_empty_database';await admin.query(`CREATE DATABASE ${database} OWNER ${owner} TEMPLATE template0`);
  report.stage='revoke_public';await admin.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
  await admin.query(`GRANT CONNECT ON DATABASE ${database} TO ${role}`);
  const application=new URL(url);application.username=role;application.password=password;application.pathname=`/${database}`;
  const client=new Client({connectionString:application.toString(),connectionTimeoutMillis:10000,query_timeout:10000});
  try {report.stage='verify_empty_and_transport_tls';await client.connect();const {rows:[tables]}=await client.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')");if(tables.n)throw Error('Nonempty');if(!client.connection.stream.encrypted || !client.connection.stream.authorized)throw Error('TLS required');}
  finally {await client.end().catch(()=>{});}
  writeFileSync(`${directory}/${component}.json`,JSON.stringify({databaseUrl:application.toString(),database,role,owner}),{mode:0o600});
  report.databases.push({component,database,applicationRole:role,ownerRole:owner,ownerLogin:false,runtimeRoleOwnsDatabase:false,connectionLimit:4,endpointFingerprint:createHash('sha256').update(url.hostname).digest('hex'),publicConnectRevoked:true,tls:true,empty:true,existingObjectPrivileges:0,existingSecurityDefinerPrivileges:0,existingSchemaCreatePrivileges:0,migrations:'NOT_RUN'});
 }
 for(const [a,b] of [['myeve','peer'],['peer','myeve']]){
  const u=new URL(JSON.parse(readFileSync(`${directory}/${a}.json`,'utf8')).databaseUrl);u.pathname='/'+report.databases.find(d=>d.component===b).database;
  const c=new Client({connectionString:u.toString(),connectionTimeoutMillis:10000});let denied=false;try{await c.connect();}catch(e){denied=e.code==='42501';}finally{await c.end().catch(()=>{});}if(!denied)throw Error('Cross DB denied not proved');
 }
 report.status='EMPTY_DATABASES_CREATED';report.crossMyEveConnection='DENIED_BOTH_DIRECTIONS';
} catch (error) {
 report.assertion=['Nonempty','TLS required','Cross DB denied not proved','Capacity bound','Privilege check','Inherited membership','Existing object privilege','Existing definer privilege','Existing schema privilege'].find(x=>x===error.message)??null;
 report.permissionCategory=['superuser','BYPASSRLS','REPLICATION','SET ROLE','owner','create role','permission denied'].filter(x=>String(error.message).includes(x));
 report.errorCode=/^[A-Z0-9]{5}$/.test(error.code??'')?error.code:'LOCAL_ASSERTION';
 report.status='FAILED';report.cleanup=[];
 for(const s of made.toReversed()) {
  try {await s.admin.query(`DROP DATABASE IF EXISTS ${s.database} WITH (FORCE)`);await s.admin.query(`DROP ROLE IF EXISTS ${s.role}`);await s.admin.query(`DROP ROLE IF EXISTS ${s.owner}`);report.cleanup.push({database:s.database,status:'REMOVED'});}
  catch {report.cleanup.push({database:s.database,status:'OPERATOR_CLEANUP_REQUIRED'});}
 }
 process.exitCode=1;
} finally {await Promise.all(made.map(s=>s.admin.end().catch(()=>{})));}
console.log(JSON.stringify(report,null,2));
