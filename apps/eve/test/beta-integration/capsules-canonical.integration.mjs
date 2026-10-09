import {betaTestPort} from './test-postgres.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Pool,Client} from 'pg';
import {loadMigrations,runMigrations} from '../../scripts/migration-runner.ts';
import {BetaIntegration} from '../../lib/beta-integration/runtime.ts';
import {CanonicalCapsules} from '../../lib/capsules/canonical-memory.ts';
import {writeFile} from 'node:fs/promises';
import {digest,canonicalJson} from '../../lib/capsules/format.ts';
const admin=new Client(`postgresql://postgres@127.0.0.1:${betaTestPort}/postgres`);await admin.connect();
const pools=[],names=[],checks=[];const owner='capsule-alpha-owner';
async function database(eve){const name='myeve_beta_capsule_'+randomBytes(5).toString('hex');names.push(name);await admin.query('CREATE DATABASE '+name);const pool=new Pool({connectionString:`postgresql://postgres@127.0.0.1:${betaTestPort}/`+name});pools.push(pool);
 const migration={query:async(s,p)=>(await pool.query(s,p)).rows,transaction:async ss=>{const c=await pool.connect();try{await c.query('BEGIN');for(const s of ss)await c.query(s.sql,s.params);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}};
 const migrations=await loadMigrations();await runMigrations(migration,migrations,()=>{});await runMigrations(migration,migrations,()=>{});
 await pool.query(`INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary,status) VALUES($1,$2,'Sofie','sofie','assistant','Private alpha qualification',true,'active')`,[eve,owner]);
 return {pool,beta:new BetaIntegration(pool,{repository:'fixture/golden',maxCostUsd:1.35,maxDurationSeconds:300})};}
function pass(s){checks.push(s);console.log('PASS',s);}
try{
 const a=await database('eve-a'),b=await database('eve-b');pass('two independent fresh migration chains and no-op replay');
 const source=new CanonicalCapsules(a.beta,owner,'eve-a'),destination=new CanonicalCapsules(b.beta,owner,'eve-b');
 const id='memory_'+ 'ab19cd23ef45'.repeat(5)+'ab19';
 await a.pool.query(`INSERT INTO memory_records(id,owner_id,scope_type,scope_id,content,provider,source_type) VALUES($1,$2,'owner',$2,'I prefer a concise morning briefing about delivery risks.','local','explicit')`,[id,owner]);
 const catalog=await source.catalog('eve-b');const record=catalog.candidates[0];assert.equal(record.eligible,false);
 await assert.rejects(source.export('eve-b',[record.id]),/policy|portability/i);
 await source.approve({memoryId:record.id,itemDigest:record.itemDigest,destinationEveRef:'eve-b',personal:true});
 const preview=await source.export('eve-b',[record.id]);
 await assert.rejects(source.export('eve-c',[record.id],preview.reviewDigest));
 const capsule=await source.export('eve-b',[record.id],preview.reviewDigest);pass('exact current personal source consent and destination-bound export');
 await a.pool.query("UPDATE memory_records SET content='I prefer detailed briefings.',updated_at=now() WHERE id=$1",[id]);
 await assert.rejects(source.export('eve-b',[record.id],preview.reviewDigest));pass('source correction invalidates approval and export review');
 const reviewed=await destination.preview(capsule.raw);assert.equal(reviewed.items[0].status,'new');
 const decisions=reviewed.items.map(r=>({id:r.item.id,choice:'include'}));
 const results=await Promise.all(Array.from({length:12},()=>destination.import(capsule.raw,reviewed.reviewDigest,decisions)));
 assert.equal(results.filter(r=>!r.duplicate).length,1);assert(results.every(r=>r.activeCount===1));
 let rows=(await b.pool.query('SELECT * FROM memory_records')).rows;assert.equal(rows.length,1);assert.equal(rows[0].scope_type,'agent');assert.equal(rows[0].scope_id,'eve-b');assert.equal(rows[0].provider,'local');assert.equal(rows[0].source_type,'capsule_import');pass('12 concurrent imports yield one atomic canonical Memory activation and one receipt');
 const restarted=new CanonicalCapsules(new BetaIntegration(b.pool,b.beta.policy),owner,'eve-b');
 assert.equal((await restarted.catalog('eve-c')).reviews.length,1);
 assert.equal((await restarted.import(capsule.raw,reviewed.reviewDigest,decisions)).duplicate,true);
 const restartedRecall=JSON.parse((await exec(process.execPath,['--import','tsx','test/beta-integration/capsule-recall-worker.mjs',JSON.stringify({database:names[1],owner,eve:'eve-b'})])).stdout);assert.equal(restartedRecall.length,1);assert(restartedRecall[0].content.includes('morning'));
 const foreignRecall=JSON.parse((await exec(process.execPath,['--import','tsx','test/beta-integration/capsule-recall-worker.mjs',JSON.stringify({database:names[1],owner,eve:'other-eve'})])).stdout);assert.equal(foreignRecall.length,0);
 const visible=await b.pool.query("SELECT content FROM memory_records WHERE owner_id=$1 AND scope_type='agent' AND scope_id='eve-b' AND status='active' AND content ILIKE '%morning%'",[owner]);assert.equal(visible.rows.length,1);pass('fresh process uses canonical memoryStore.search for useful recall; another Agent cannot recall it');
 await assert.rejects(new CanonicalCapsules(b.beta,'other-owner','eve-b').preview(capsule.raw));pass('cross-owner and foreign Agent import denied');
 const modified=JSON.parse(capsule.raw);modified.items[0].text='I prefer weekly briefings.';modified.manifest.capsuleId=crypto.randomUUID();modified.manifest.inventory[0].digest=digest(modified.items[0]);modified.manifest.inventory[0].bytes=Buffer.byteLength(canonicalJson(modified.items[0]));const {digest:old,...body}=modified;modified.digest=digest(body);
 const conflict=await destination.preview(canonicalJson(modified));assert.equal(conflict.items[0].status,'conflict');
 await assert.rejects(destination.import(canonicalJson(modified),conflict.reviewDigest,[{id:modified.items[0].id,choice:'include'}]));pass('Current Truth conflict keeps destination and rejects bulk replacement');
 function reseal(items){const original=JSON.parse(capsule.raw);original.manifest.capsuleId=crypto.randomUUID();original.items=items;original.manifest.inventory=items.map(item=>({id:item.id,digest:digest(item),bytes:Buffer.byteLength(canonicalJson(item))}));const {digest:ignored,...body}=original;return canonicalJson({...body,digest:digest(body)});}
 const baseItem=JSON.parse(capsule.raw).items[0];
 const stagedItems=['skill','role','pack','learning'].map(kind=>({...baseItem,id:'staged-'+kind,key:'staged-'+kind,kind,version:'1.2.3',text:'Retained experience for destination review.',provenance:{...baseItem.provenance,sourceType:kind==='learning'?'qualified_learning':kind,...(kind==='learning'?{qualificationRef:'source-evaluation-v7'}:{})}}));
 const stagedRaw=reseal(stagedItems),stagedReview=await destination.preview(stagedRaw);
 const staged=await destination.import(stagedRaw,stagedReview.reviewDigest,stagedItems.map(i=>({id:i.id,choice:'include'})));assert.equal(staged.activeCount,0);
 const saved=(await b.pool.query('SELECT records FROM capsule_memory_receipts WHERE id=$1',[staged.id])).rows[0].records;assert.deepEqual(saved.map(r=>r.item),stagedItems);assert(saved.every(r=>r.state==='qualification_required'));pass('Skills, Roles, Packs and learning retain exact source version/provenance in staging and gain no activation');
 const atomicItems=['first','second'].map(label=>({...baseItem,id:'atomic-'+label,key:'atomic-'+label,text:'Atomic import '+label}));const atomicRaw=reseal(atomicItems),atomicReview=await destination.preview(atomicRaw);
 const memoryCount=(await b.pool.query('SELECT count(*)::int n FROM memory_records')).rows[0].n,receiptCount=(await b.pool.query('SELECT count(*)::int n FROM capsule_memory_receipts')).rows[0].n;
 await b.pool.query("CREATE FUNCTION alpha_fail_second() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.content='Atomic import second' THEN RAISE EXCEPTION 'injected second row failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER alpha_fail_second BEFORE INSERT ON memory_records FOR EACH ROW EXECUTE FUNCTION alpha_fail_second()");
 await assert.rejects(destination.import(atomicRaw,atomicReview.reviewDigest,atomicItems.map(i=>({id:i.id,choice:'include'}))),/injected/);
 assert.equal((await b.pool.query('SELECT count(*)::int n FROM memory_records')).rows[0].n,memoryCount);assert.equal((await b.pool.query('SELECT count(*)::int n FROM capsule_memory_receipts')).rows[0].n,receiptCount);
 await b.pool.query('DROP TRIGGER alpha_fail_second ON memory_records; DROP FUNCTION alpha_fail_second()');pass('Failure on the second canonical Memory insert rolls back the entire batch and receipt');
 const receipt=results[0];await b.pool.query("UPDATE memory_records SET permanent=true WHERE id=$1",[rows[0].id]);await assert.rejects(destination.rollback(receipt.id),/changed/i);pass('Rollback rejects later metadata changes even without a timestamp change');await b.pool.query("UPDATE memory_records SET content='Owner corrected this.',updated_at=now() WHERE id=$1",[rows[0].id]);
 await assert.rejects(destination.rollback(receipt.id),/changed/i);pass('rollback refuses to remove subsequently corrected Memory');
 // A second independent destination exercises clean rollback and replay without rewriting prior state.
 const c=await database('eve-c'),third=new CanonicalCapsules(c.beta,owner,'eve-c');const reviewC=await third.preview(capsule.raw);const imported=await third.import(capsule.raw,reviewC.reviewDigest,decisions);await third.rollback(imported.id);
 assert.equal((await third.import(capsule.raw,reviewC.reviewDigest,decisions)).result,'rolled_back');assert.equal((await c.pool.query("SELECT count(*)::int n FROM memory_records WHERE status='active'")).rows[0].n,0);pass('rollback and old-request replay never reactivate retired Memory');
 await writeFile(`../../docs/verification/beta-integration/${process.env.MYEVE_BETA_EVIDENCE_PHASE ?? "alpha"}/capsules-canonical.json`,JSON.stringify({status:'PASS',checks,scope:'Personal owner Memory only; scoped learning and behavior staged. Canonical memoryStore recall after process restart; live Sofie NOT_RUN.',safety:{duplicateMemory:0,crossOwnerDisclosures:0,authorityTransfer:0,staleActivation:0}},null,2)+'\n');
}finally{for(const p of pools)await p.end();for(const name of names)await admin.query('DROP DATABASE '+name+' WITH (FORCE)');await admin.end();}
