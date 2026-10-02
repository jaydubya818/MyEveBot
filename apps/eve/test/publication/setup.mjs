import {Client,Pool} from 'pg';import {readFile,writeFile} from 'node:fs/promises';
import {loadMigrations,runMigrations} from '../../scripts/migration-runner.ts';
import {BetaIntegration} from '../../lib/beta-integration/runtime.ts';import {OwnerPublication} from '../../lib/engineering/owner-publication.ts';
const url=process.env.MYEVE_PUBLICATION_TEST_DATABASE??'postgresql://postgres@127.0.0.1:55479/myeve_beta_publication';
if(!/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/myeve_beta_publication$/.test(url))throw Error('Disposable local database only');
const admin=new Client(url.replace(/\/myeve_beta_publication$/,'/postgres'));await admin.connect();
if(!(await admin.query("SELECT 1 FROM pg_database WHERE datname='myeve_beta_publication'")).rowCount)await admin.query('CREATE DATABASE myeve_beta_publication');await admin.end();
const c=new Client(url);await c.connect();
const driver={query:async(s,p)=>(await c.query(s,p)).rows,transaction:async statements=>{await c.query('BEGIN');try{for(const s of statements)await c.query(s.sql,s.params);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}}};
await runMigrations(driver,await loadMigrations(),()=>{});
const capture=JSON.parse(await readFile(process.env.MYEVE_PUBLICATION_TEST_CAPTURE??'/private/tmp/alpha-eighth-live-20261001/database-snapshot.json','utf8'));
capture.engineering_factory_receipts=JSON.parse(await readFile(process.env.MYEVE_PUBLICATION_TEST_RECEIPT??'/private/tmp/alpha-owner-fixture-receipt.json','utf8'));
const tables=['engineering_work','engineering_work_criteria','engineering_direct_workspaces','engineering_native_results','engineering_direct_verification_jobs','engineering_factory_requests','engineering_factory_receipts','engineering_route_runs','engineering_routing_decisions','engineering_work_model_calls'];
await c.query('BEGIN');await c.query('SET LOCAL session_replication_role=replica');
await c.query('TRUNCATE engineering_candidate_publications,engineering_owner_decisions');
for(const table of tables){await c.query('DELETE FROM '+table);await c.query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(null::${table},$1::jsonb)`,[JSON.stringify(capture[table])]);}
await c.query('COMMIT');await c.end();
const config=JSON.parse(await readFile(process.env.MYEVE_ENGINEERING_CONFIG,'utf8'));
const pool=new Pool({connectionString:url});try{
 const service=new OwnerPublication(new BetaIntegration(pool,{repository:config.profile.repository,maxCostUsd:1.35,maxDurationSeconds:600}),async()=>config);
 const result=await service.view('owner',capture.engineering_work[0].id);await writeFile('/private/tmp/alpha-owner-qualified-view.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({localDatabase:'myeve_beta_publication',candidate:result.binding.candidate,tree:result.binding.verifiedTree,implementation:result.implementation,verification:result.verification,cost:result.accounting.settledMicrousd}));
}finally{await pool.end();}
