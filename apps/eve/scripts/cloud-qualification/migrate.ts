import { neon } from '@neondatabase/serverless';
import { loadMigrations, runMigrations } from '../migration-runner.ts';
import { CURRENT_DATABASE_MIGRATION } from '../../lib/database-schema.ts';

const project='prj_XU7fJW735PtsnKoAYtGfzdnsotIB';
if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_PROJECT_ID!==project||process.env.NEON_PROJECT_ID!=='calm-recipe-29472969')throw Error('QUALIFICATION_DATABASE_BOUNDARY_MISMATCH');
if(!process.env.DATABASE_URL)throw Error('DATABASE_REQUIRED');
const sql=neon(process.env.DATABASE_URL);
try {
 const tables=await sql.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_type='BASE TABLE'");
 if(tables.length){
  if(!tables.some(t=>t.table_schema==='public'&&t.table_name==='cloud_qualification_environment'))throw Error('DATABASE_NOT_EMPTY_OR_QUALIFIED');
  const rows=await sql.query('SELECT project_id FROM cloud_qualification_environment');
  if(rows.length!==1||rows[0].project_id!==project)throw Error('DATABASE_BOUNDARY_MISMATCH');
 }
 const migrations=await loadMigrations();
 if(migrations.at(-1)?.name!==CURRENT_DATABASE_MIGRATION)throw Error('MIGRATION_MANIFEST_MISMATCH');
 await runMigrations({query:(statement,params)=>sql.query(statement,params),transaction:statements=>sql.transaction(tx=>statements.map(s=>tx.query(s.sql,s.params)))},migrations);
 await sql.query('CREATE TABLE IF NOT EXISTS cloud_qualification_environment(project_id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())');
 await sql.query('INSERT INTO cloud_qualification_environment(project_id) VALUES($1) ON CONFLICT DO NOTHING',[project]);
 console.log(JSON.stringify({status:'PASS',projectId:project,resourceId:'store_fOPC5aF0CPD0FfOW',databaseInitiallyEmpty:tables.length===0,latestMigration:CURRENT_DATABASE_MIGRATION,ownerDataCopied:false,modelOperations:0}));
}catch(error){console.error(JSON.stringify({status:'FAIL',code:error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'MIGRATION_FAILED'}));process.exitCode=1;}
