import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {loadMigrations,runMigrations} from '../scripts/migration-runner.ts';
import {BusinessScopes,ScopeDenied,businessEffectHash} from '../lib/business-scopes.ts';
import {assertBusinessEffect} from '../lib/business-effects.ts';
import {askBusinessSofie} from '../lib/business-sofie.ts';
import {WorkStore} from '../lib/engineering/store.ts';
import {businessApi} from '../lib/business-api.ts';
import {createWebSessionToken,ownerForPassword,verifyWebSessionToken,webAuthConfigStatus} from '../lib/web-auth.ts';
const connection={host:'127.0.0.1',port:Number(process.env.MYEVE_BETA_TEST_PORT??55489),user:'postgres'};
const admin=new Client({...connection,database:'postgres'});await admin.connect();
const name='myeve_beta_scopes_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);
const c=new Client({...connection,database:name});await c.connect();
const db={query:async(s,p)=>(await c.query(s,p)).rows,transaction:async(ss)=>{await c.query('BEGIN');try{for(const s of ss)await c.query(s.sql,s.params);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}}};
let checks=0;async function check(label,fn){await fn();checks++;console.log('PASS '+label);}
try{
 const migrations=await loadMigrations();
 await runMigrations(db,migrations.filter(m=>m.name<'0069'),()=>{});
 // Populated pre-migration private records must remain private.
 await c.query(`INSERT INTO memory_records(id,owner_id,scope_type,scope_id,content,provider) VALUES('memory_a','A','owner','A','A_PRIVATE_CANARY','local'),('memory_b','B','owner','B','B_PRIVATE_CANARY','local')`);
 await c.query(`INSERT INTO chat_files(id,owner_id,thread_id,filename,media_type,size_bytes,blob_url,blob_path) VALUES('file_b','B','private-thread','B_PRIVATE_FILE','text/plain',13,'secret-blob-location','private-path')`);
 await c.query(`INSERT INTO goals(id,owner_id,title) VALUES('goal_a','A','Shared outcome')`);
 await c.query(`INSERT INTO knowledge_records(id,owner_id,kind,statement,status,created_by_type) VALUES('knowledge_a','A','fact','Explicit business fact','active','owner')`);
 const before=(await c.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows;
 await runMigrations(db,migrations,()=>{});await runMigrations(db,migrations,()=>{});
 assert.deepEqual((await c.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows.slice(0,before.length),before);
 const A=new BusinessScopes('A',db),B=new BusinessScopes('B',db),C=new BusinessScopes('C',db),business={scope:'BUSINESS_SHARED'};
 const store=new WorkStore({scopeId:'A',actorId:'A',scopeKind:'personal'},db);
 const {work}=await store.create({title:'Shared Work',objective:'A business outcome',repository:'qualification/business',criteria:[{id:randomUUID(),statement:'Proof',method:'test'}],maxCostUsd:1,maxDurationSeconds:60,idempotencyKey:randomUUID()});
 const result=randomUUID();await c.query(`INSERT INTO engineering_native_results(id,scope_id,scope_kind,work_id,candidate_sha,work_version,work_generation,proof,content_hash) VALUES($1,'A','personal',$2,$3,1,1,'{"outcome":"PARTIAL"}',$4)`,[result,work.id,'a'.repeat(40),'b'.repeat(64)]);
 const ref=(kind,id,owner)=>({kind,id,owner});
 const resource=async(s,kind,id)=>(await s.privateResources()).find(r=>r.kind===kind&&r.id===id);
 const share=async(s,kind,id,extra={})=>{const r=await resource(s,kind,id);return s.share({kind,id,revisionHash:r.revision_hash,scope:'BUSINESS_SHARED',...extra});};
 await check('deployment and one-sided membership grant no sharing',async()=>{assert.deepEqual(await B.read(business),[]);await A.accept('A','B');await assert.rejects(()=>share(A,'GOAL','goal_a'),ScopeDenied);await B.accept('A','B');assert.deepEqual(await B.read(business),[]);});
 await check('A private Memory to B denied; B private File to A denied',async()=>{await assert.rejects(()=>B.read(business,ref('MEMORY','memory_a','A')),ScopeDenied);await assert.rejects(()=>A.read(business,ref('FILE','file_b','B')),ScopeDenied);assert(!(await A.privateResources()).some(r=>r.id==='memory_b'||r.id==='file_b'));});
 for(const [kind,id] of [['GOAL','goal_a'],['WORK',work.id],['RESULT',result],['KNOWLEDGE','knowledge_a']])await check('explicit '+kind+' both authorized owners pass',async()=>{await share(A,kind,id);assert.equal((await A.read(business,ref(kind,id,'A'))).length,1);assert.equal((await B.read(business,ref(kind,id,'A'))).length,1);assert.deepEqual(await C.read(business),[]);});
 const context={scope:'WORK_SCOPED',workOwner:'A',workId:work.id};
 let grant;
 await check('bounded Work grant does not promote Memory',async()=>{grant=await share(A,'MEMORY','memory_a',{...context,expiresAt:new Date(Date.now()+3600000).toISOString()});assert((await B.context(context)).content.includes('A_PRIVATE_CANARY'));assert(!(await B.context(business)).content.includes('A_PRIVATE_CANARY'));await assert.rejects(()=>B.context({...context,workId:randomUUID()}),ScopeDenied);assert.equal((await c.query("SELECT owner_id FROM memory_records WHERE id='memory_a'")).rows[0].owner_id,'A');});
 await check('credential object and owner impersonation rejected',async()=>{await assert.rejects(()=>A.share({kind:'CREDENTIAL',id:'secret',revisionHash:'a'.repeat(64),scope:'BUSINESS_SHARED'}));await assert.rejects(async()=>B.share({kind:'MEMORY',id:'memory_a',revisionHash:(await resource(A,'MEMORY','memory_a')).revision_hash,scope:'BUSINESS_SHARED'}));assert(!(await B.context(context)).content.includes('secret-blob-location'));});
 for(const policy of ['OWNER_A','OWNER_B','EITHER_OWNER','BOTH_OWNERS'])await check('exact effect '+policy,async()=>{const effect={operation:{OWNER_A:'pause',OWNER_B:'resume',EITHER_OWNER:'cancel',BOTH_OWNERS:'takeover'}[policy],expectedVersion:1};const effectHash=businessEffectHash(work.id,1,1,effect);const {id}=await A.requestDecision({workOwner:'A',workId:work.id,effect,policy,expiresAt:new Date(Date.now()+3600000).toISOString()});await assert.rejects(()=>C.decide(id,effectHash,true),ScopeDenied);await assert.rejects(()=>A.decide(id,'f'.repeat(64),true),ScopeDenied);if(policy==='OWNER_A'){await assert.rejects(()=>B.decide(id,effectHash,true),ScopeDenied);assert((await A.decide(id,effectHash,true)).approved);}else if(policy==='OWNER_B'){await assert.rejects(()=>A.decide(id,effectHash,true),ScopeDenied);assert((await B.decide(id,effectHash,true)).approved);}else if(policy==='BOTH_OWNERS'){assert(!(await A.decide(id,effectHash,true)).approved);assert((await B.decide(id,effectHash,true)).approved);}else assert((await B.decide(id,effectHash,true)).approved);});
 await check('shared native execution requires both approvals; changed effect denied',async()=>{process.env.MYEVE_PARTNER_OWNER_ID='B';const effect={operation:'execute_native'},effectHash=businessEffectHash(work.id,1,1,effect);await assert.rejects(()=>assertBusinessEffect(store,work.id,effect));const {id}=await A.requestDecision({workOwner:'A',workId:work.id,effect,policy:'BOTH_OWNERS',expiresAt:new Date(Date.now()+3600000).toISOString()});await A.decide(id,effectHash,true);await assert.rejects(()=>assertBusinessEffect(store,work.id,effect));await B.decide(id,effectHash,true);await assertBusinessEffect(store,work.id,effect);await assert.rejects(()=>assertBusinessEffect(store,work.id,{operation:'execute_factory'}));delete process.env.MYEVE_PARTNER_OWNER_ID;});
 await check('Sofie receives only active context and suppresses revoked output',async()=>{let prompt;const answer=await askBusinessSofie(B,business,'What is our outcome?',async input=>{prompt=JSON.stringify(input);return 'Controlled answer';});assert.equal(answer.answer,'Controlled answer');assert(!prompt.includes('A_PRIVATE_CANARY'));assert(!prompt.includes('B_PRIVATE_CANARY'));await assert.rejects(()=>askBusinessSofie(B,context,'Review this Work',async()=>{await A.revoke(grant.id);return 'A_PRIVATE_CANARY';}));grant=await share(A,'MEMORY','memory_a',{...context,expiresAt:new Date(Date.now()+3600000).toISOString()});});
 await check('source changes require explicit new authorization',async()=>{await c.query("UPDATE memory_records SET content='NEW_PRIVATE_CANARY' WHERE id='memory_a'");assert(!(await B.context(context)).content.includes('NEW_PRIVATE_CANARY'));});
 await check('revocation and expiry take effect on next retrieval',async()=>{await A.revoke(grant.id);grant=await share(A,'MEMORY','memory_a',{...context,expiresAt:new Date(Date.now()+3600000).toISOString()});await c.query("UPDATE business_resource_grants SET expires_at=now()-interval '1 second' WHERE id=$1",[grant.id]);assert(!(await B.context(context)).content.includes('NEW_PRIVATE_CANARY'));});
 await check('Work end terminates bounded access even after reopening',async()=>{await share(A,'MEMORY','memory_a',{...context,expiresAt:new Date(Date.now()+3600000).toISOString()});await c.query("UPDATE engineering_work SET lifecycle='cancelled',version=version+1,generation=generation+1 WHERE id=$1",[work.id]);await assert.rejects(()=>B.context(context),ScopeDenied);});
 await check('leaving revokes old grants permanently across rejoin',async()=>{await B.leave();assert.deepEqual(await A.read(business),[]);await B.accept('A','B');assert.deepEqual(await B.read(business),[]);});
 await check('separate signed owner sessions and fail-closed duplicate passwords',async()=>{const env={NODE_ENV:'production',MYEVE_OWNER_ID:'A',MYEVE_ACCESS_PASSWORD:'owner-a-private-password',MYEVE_PARTNER_OWNER_ID:'B',MYEVE_PARTNER_ACCESS_PASSWORD:'owner-b-private-password',MYEVE_SESSION_SECRET:'s'.repeat(40)};assert.equal(ownerForPassword(env.MYEVE_PARTNER_ACCESS_PASSWORD,env),'B');assert.equal(verifyWebSessionToken(createWebSessionToken(env,Date.now(),'B'),env).id,'B');assert.equal(webAuthConfigStatus({...env,MYEVE_PARTNER_ACCESS_PASSWORD:env.MYEVE_ACCESS_PASSWORD}).configured,false);const api=businessApi({env,scopes:actor=>new BusinessScopes(actor,db)});assert.equal((await api(new Request('http://localhost/api/business'))).status,401);const response=await api(new Request('http://localhost/api/business',{headers:{cookie:'myeve_session='+createWebSessionToken(env,Date.now(),'B')}}));assert.equal(response.status,200);const body=await response.json();assert.equal(body.owner,'B');assert(!JSON.stringify(body).includes('NEW_PRIVATE_CANARY'));});
 if(process.env.MYEVE_SCOPE_BROWSER==='1'){
  const fresh=await store.create({title:'Business launch',objective:'Qualify partner collaboration',repository:'qualification/business',criteria:[{id:randomUUID(),statement:'Prove isolation',method:'test'}],maxCostUsd:1,maxDurationSeconds:60,idempotencyKey:randomUUID()});
  await share(A,'WORK',fresh.work.id);await share(A,'GOAL','goal_a');await share(A,'KNOWLEDGE','knowledge_a');
  await writeFile('/private/tmp/business-browser-fixture.json',JSON.stringify({database:name,workId:fresh.work.id}));
 }
 console.log(JSON.stringify({checks,status:'PASS',scope:'controlled local PostgreSQL; no provider calls',crossOwnerPrivateDisclosures:0,credentialsTransferred:0,implicitPrivatePromotions:0}));
}finally{await c.end();if(process.env.MYEVE_SCOPE_BROWSER!=='1')await admin.query('DROP DATABASE '+name);await admin.end();}
