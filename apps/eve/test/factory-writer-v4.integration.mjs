// Public synthetic data-only writer handoff. No provider, historical GateB,
// protected verifier, tester installation or financial authority is used.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash,generateKeyPairSync} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client,Pool} from 'pg';
import {capabilityRegistry} from '@mission-control/capability-control';
import {loadMigrations,runMigrations} from '../scripts/migration-runner.ts';
import {CURRENT_DATABASE_MIGRATION} from '../lib/database-schema.ts';
import {canonicalAlphaTasksWork,alphaTasksTupleSha256} from '../lib/external-alpha/work-tuple.ts';
import {WorkStore} from '../lib/engineering/store.ts';
import {FactoryWriterStore} from '../lib/engineering/factory-writer.ts';
import {FactoryReceiptStore} from '../lib/engineering/factory-receipt-store.ts';
import {prepareAuthenticatedLocalFactoryInputV4} from '../lib/engineering/factory-authenticated-result.ts';
import {admitLocalFactoryResultV4} from '../lib/engineering/factory-result-consumer.ts';
import * as codec from '../lib/engineering/factory-producer-protocol.ts';
import {digest} from '../lib/engineering/contract.ts';
import {MissionControlBindings} from '../lib/missioncontrol/permit-store.ts';
import {permitFixture} from '../lib/missioncontrol/permit-test-fixture.ts';
import {capabilityPairDigest} from '../lib/missioncontrol/installed-client.ts';
import {controlDigest} from '../lib/missioncontrol/execution-permit.ts';
import {prepareOwnerFactoryOrigin} from '../lib/missioncontrol/owner-factory-binding.ts';
import {factoryExecutionConfigurationHash} from '../lib/engineering/factory-configuration-hash.ts';
const now=Date.now();
const objectId=(kind,bytes)=>createHash('sha1').update(`${kind} ${bytes.length}\0`).update(bytes).digest('hex');
function publicWriterVector(workId, ownerId) {
    const pair = generateKeyPairSync('ed25519');
    const tree = (body) => Buffer.concat([Buffer.from('100644 input.txt\0'), Buffer.from(objectId('blob', Buffer.from(body)), 'hex')]);
    const inputTree = tree('before\n'), inputTreeId = objectId('tree', inputTree);
    const base = Buffer.from(`tree ${inputTreeId}\nauthor Synthetic <codec@example.invalid> 1793016000 +0000\ncommitter Synthetic <codec@example.invalid> 1793016000 +0000\n\nSynthetic admitted input\n`);
    const inputCommit = objectId('commit', base), candidateTree = tree('after\n'), candidateTreeId = objectId('tree', candidateTree);
    const commit = Buffer.from(`tree ${candidateTreeId}\nparent ${inputCommit}\nauthor Synthetic <codec@example.invalid> 1793016001 +0000\ncommitter Synthetic <codec@example.invalid> 1793016001 +0000\n\nSynthetic candidate\n`);
    const candidate = objectId('commit', commit), patch = Buffer.from('diff --git a/input.txt b/input.txt\n--- a/input.txt\n+++ b/input.txt\n@@ -1 +1 @@\n-before\n+after\n'), log = Buffer.from('Synthetic producer check; not independent verification\n');
    const configuration = { model: 'openai/gpt-5.4-mini', executor: 'codex-cli', executorVersion: 'synthetic-codec-only', skillRevision: 'synthetic-skill', workerProfile: 'mac', verificationImage: 'synthetic-verifier', nodeVersion: 'v24.18.1', platform: 'darwin', architecture: 'arm64', commands: ['node --test synthetic.test.mjs'], allowedPaths: ['input.txt'], timeoutMs: 1000 };
    const sourceDigest = '1'.repeat(64), configurationDigest = codec.digest(configuration), factoryId = 'synthetic-v4-factory';
    const request = { ownerId, workId, workVersion: 1, criteriaVersion: 1, profile: { id: 'synthetic-local-profile', version: 1, configuration } };
    const execution = { version: 4, factoryId, factoryVersion: codec.digest({ sourceDigest, configurationDigest }), sourceDigest, configurationDigest, configuration, requestId: randomUUID(), requestDigest: codec.digest(request), workOrderId: '11111111-1111-4111-8111-111111111111', runId: '22222222-2222-4222-8222-222222222222', attemptNumber: 1, inputCommit, inputTree: inputTreeId, workspace: { kind: 'GIT_WORKTREE', path: '/synthetic/owned-worktrees/attempt-one', branch: null }, capturedAt: '2026-10-26T10:00:00.000Z' };
    const metadata = [['commit', 'git-commit', commit], ['tree', 'git-tree', candidateTree], ['patch', 'patch', patch], ['check', 'check-log', log]];
    const artifacts = metadata.map(([id, , bytes]) => ({ id, base64: bytes.toString('base64') }));
    const artifactMetadata = metadata.map(([id, kind, bytes]) => ({ id, kind, producer: factoryId, runId: execution.runId, candidateCommit: candidate, sha256: codec.sha256(bytes), size: bytes.length, createdAt: '2026-10-26T10:00:00.200Z' }));
    const evidence = [{ id: 'synthetic-check', producer: factoryId, runId: execution.runId, candidateCommit: candidate, command: configuration.commands[0], status: 'passed', exitCode: 0, startedAt: '2026-10-26T10:00:00.100Z', finishedAt: '2026-10-26T10:00:00.200Z', logArtifactId: 'check' }];
    const manifest = { protocol: codec.RESULT_PROTOCOL, keyId: 'synthetic-key', producer: factoryId, operationId: codec.digest([codec.RESULT_PROTOCOL, factoryId, execution.requestId, execution.workOrderId, execution.runId]), execution, status: 'COMPLETED', candidate: { commit: candidate, tree: candidateTreeId, base: inputCommit, patchDigest: codec.sha256(patch), commitArtifactId: 'commit', treeArtifactId: 'tree', patchArtifactId: 'patch' }, evidence, artifacts: artifactMetadata, evidenceDigest: codec.digest(evidence), artifactDigest: codec.digest(artifactMetadata), completedAt: '2026-10-26T10:00:00.300Z', issuedAt: '2026-10-26T10:00:00.400Z' };
    const { version, workspace, capturedAt, ...expected } = structuredClone(execution);
    const key = { factoryId, keyId: manifest.keyId, publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(), activeFrom: '2020-01-01T00:00:00Z', notAfter: '2099-01-01T00:00:00Z' };
    return { manifest, artifacts, expected, privateKey: pair.privateKey, options: { expected, keys: [key], now }, request };
}

function publicProfile(repository){return {id:'synthetic-public-writer',version:1,repository,privateQualification:true,baseBranch:'main',allowedPaths:['input.txt'],
 checks:[{id:'synthetic-never-executed',program:'input.txt',input:'',expectedOutput:'',expectedExitCode:0,criterionIds:[randomUUID()]}],requiredCI:['public-fixture'],reviewerLogins:['synthetic-reviewer'],policyVersion:1,
 executor:'claude-code',image:'synthetic@sha256:'+'a'.repeat(64),maxRuns:1,maxModelRequests:1,maxOutputTokens:256};}
const port=process.env.MYEVE_FACTORY_RECEIPT_TEST_PORT;
if(!/^[1-9][0-9]{4}$/.test(port??'')||Number(port)<49152||Number(port)>65535)throw Error('Owned ephemeral loopback port required');
const admin=new Client({host:'127.0.0.1',port:Number(port),user:'q37_admin',database:'postgres'});
const name='q37_v4writer_'+randomBytes(16).toString('hex'),roles=[],unexpected=[];
admin.on('error',error=>unexpected.push(error));await admin.connect();
let pool,count=0;const pass=name=>{count++;console.log('PASS '+name)};
try{
 await admin.query('CREATE DATABASE '+name);
 pool=new Pool({host:'127.0.0.1',port:Number(port),user:'q37_admin',database:name,max:12});pool.on('error',error=>unexpected.push(error));
 const query=async(sql,values)=>(await pool.query(sql,values)).rows;
 const migrations=await loadMigrations();assert.equal(migrations.at(-1).name,CURRENT_DATABASE_MIGRATION);
 await runMigrations({query,transaction:async statements=>{const c=await pool.connect();try{await c.query('BEGIN');for(const s of statements)await c.query(s.sql,s.params);await c.query('COMMIT')}catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}}},migrations,()=>{});
 assert.equal((await pool.query('SELECT count(*)::int n FROM sofie_schema_migrations')).rows[0].n,migrations.length);pass('full current canonical migration chain including0099and0104');
 for(const migration of ['migration','enforcement','decisions','ordering','lifecycle'])await pool.query(await readFile(new URL('../../../docs/capability-control/'+migration+'.sql',import.meta.url),'utf8'));
 async function scenario(){
 const env={name,owner:randomUUID(),agentId:'fixture-agent-'+randomUUID(),pool,policy:{factoryVersion:'a'.repeat(64)},db:{query}};
 env.store=new WorkStore({scopeId:env.owner,scopeKind:'personal',actorId:env.owner},env.db);
 env.seedWork=async()=>{
 const id=randomUUID(),w=canonicalAlphaTasksWork('fixture/myeve-alpha-workspace-01',env.owner);
 await pool.query(`INSERT INTO engineering_work(id,scope_id,scope_kind,created_by,title,objective,repository,lifecycle,control,version,generation,criteria_version,max_cost_usd,max_duration_seconds,idempotency_key,request_hash) VALUES($1,$2,'personal',$2,$3,$4,$5,'active','agent',1,1,1,1.3,180,$6,'synthetic')`,[id,env.owner,w.title,w.objective,w.repository,randomUUID()]);
 await pool.query("INSERT INTO engineering_work_criteria(scope_id,scope_kind,work_id,version,items,created_by)VALUES($1,'personal',$2,1,$3::jsonb,$1)",[env.owner,id,JSON.stringify(w.criteria)]);
 await pool.query("INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary,status,max_estimated_cost_usd,max_runtime_seconds,max_steps) VALUES($2,$1,'Synthetic','synthetic','engineer','Public data-only fixture',true,'active',1,180,1)",[env.owner,env.agentId]);
 return env.store.get(id);
 };
 let role,database,store,fixture,pair;const files=['input.txt'];

    role = 'mc_v4_' + randomBytes(12).toString('hex');roles.push(role);
    database = { ...env.db, atomic: async action => {
      const client = await env.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE ' + role);
        const result = await action({ query: async (sql, values) => (await client.query(sql, values)).rows });
        await client.query('COMMIT'); return result;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    } };
    const work = await env.seedWork();
    fixture = permitFixture({ ownerId: env.owner, workId: work.id, workVersion: work.version,
      workGeneration: work.generation, tupleSha256: alphaTasksTupleSha256, maxCostMicrousd: 1300000, maxDurationSeconds: 180 });
    fixture.enrollment.factoryVersion = fixture.document.admission.factoryVersion = env.policy.factoryVersion;
    env.policy.repository=work.repository;
    const e = fixture.enrollment;
    await env.pool.query('INSERT INTO missioncontrol_owner_enrollments(owner_id,installation_id,revision,document) VALUES($1,$2,$3,$4)',
      [env.owner, e.installationId, e.revision, e]);
    await env.pool.query(`CREATE ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    await env.pool.query(`GRANT USAGE ON SCHEMA public,capability_control TO ${role}`);
    await env.pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public,capability_control TO ${role}`);
    await env.pool.query(`GRANT UPDATE ON engineering_work TO ${role}`);
    await env.pool.query(`GRANT INSERT,UPDATE ON missioncontrol_control_attempts TO ${role}`);
    await env.pool.query(`GRANT INSERT ON missioncontrol_work_bindings,missioncontrol_execution_permits,missioncontrol_admission_receipts,missioncontrol_permit_controls,missioncontrol_factory_readbacks,missioncontrol_control_acknowledgments TO ${role}`);
    await env.pool.query(`GRANT EXECUTE ON FUNCTION capability_control.lock_admission_policy(text,text,text),missioncontrol_capability_snapshot(text,text,text,text),missioncontrol_enrollment_document(text) TO ${role}`);
    const installation=e.installationId, ids=capabilityRegistry.capabilities.map(item=>item.id);
    const facts=Object.fromEntries(capabilityRegistry.capabilities.map(item=>[item.id,{supported:true,deployed:true,entitled:true,
      administrator:'ALLOW',setup:Object.fromEntries(item.setupRequirements.map(key=>[key,true])),
      qualification:Object.fromEntries(item.qualificationRequirements.map(key=>[key,'QUALIFIED'])),lifecycle:'ACTIVE'}]));
    await env.pool.query("INSERT INTO capability_control.installations VALUES($1,'fixture-organization','qualification',true)",[installation]);
    await env.pool.query("INSERT INTO capability_control.platform_owner_bindings VALUES($1,'fixture-organization',$2,'fixture-binding-'||$2,1,'fixture-auth','fixture-admin','fixture-member','fixture-installation','fixture-audit','ACTIVE',clock_timestamp()+interval '1 hour')",[installation,env.owner]);
    await env.pool.query('INSERT INTO capability_control.owner_state(installation_id,owner_id,preferences) VALUES($1,$2,$3)',
      [installation,env.owner,Object.fromEntries(ids.map(id=>[id,'ENABLED']))]);
    await env.pool.query("INSERT INTO capability_control.evidence VALUES($1,'fixture-organization',$2,$3,$4,clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','fixture-evidence')",
      [installation,env.owner,capabilityRegistry.version,facts]);
    await env.pool.query("INSERT INTO capability_control.relay_agent_evidence VALUES($1,$2,'fixture-organization',$4,1,$3,'ACTIVE',clock_timestamp()+interval '1 hour','fixture-agent-record')",
      [installation,env.owner,JSON.stringify(ids),env.agentId]);
    await env.pool.query("INSERT INTO capability_control.policy_destinations VALUES($1,$2,'fixture-mc','fixture-incarnation',1,'fixture-key','{}')",[installation,env.owner]);
    await env.pool.query("INSERT INTO capability_control.policy_changes(installation_id,owner_id,revision,policy_id,organization_id,capability_id,operation,destinations,status) VALUES($1,$2,1,'fixture-policy','fixture-organization','enterprise.fleet','enable','[]','ACKNOWLEDGED')",[installation,env.owner]);
    const source={kind:'PERMIT',authority:'myeve',ownerId:env.owner,organizationId:'fixture-organization',installationId:installation,
      backendId:'fixture-mc',incarnation:'fixture-incarnation',enrollmentVersion:1,version:1,policyId:'fixture-policy',
      referenceId:fixture.challenge.commandId,capabilityId:'enterprise.fleet',requiredCapabilities:['work','missioncontrol','enterprise.fleet'],
      registryVersion:capabilityRegistry.version,agentId:env.agentId,agentRevision:1,workId:work.id,missionId:fixture.document.missionId,
      workGeneration:1,actionDigest:'a'.repeat(64),budgetMicros:1300000,issuedAt:fixture.now,expiresAt:fixture.now+30000,sourcePermitHash:'SELF'};
    // The signed MC receipt authenticates the exact pair. This fixture exercises
    // PostgreSQL currentness; independent wire tests exercise both policy signatures.
    pair={myeve:{message:JSON.stringify(source),keyId:'fixture-key',signature:'fixture'},
      relay:{message:JSON.stringify({...source,authority:'relay',sourcePermitHash:'a'.repeat(64)}),keyId:'fixture-key',signature:'fixture'}};
    fixture.challenge.policyPairSha256=capabilityPairDigest(pair);
    store = new MissionControlBindings(database, env.owner);
  async function ownerFixture(signedResult=false) {
    const work=await env.store.get(fixture.document.work.id);
    const v=publicWriterVector(work.id,env.owner),profile=publicProfile(work.repository);
    const config={engineering:{ownerId:env.owner,agentId:env.agentId,profile},routing:{intent:'PRODUCE'},commands:v.expected.configuration.commands,
      connection:{factoryId:v.expected.factoryId,sourceDigest:v.expected.sourceDigest,configurationDigest:v.expected.configurationDigest,factoryVersion:v.expected.factoryVersion,
       qualification:{scopeId:env.owner,profileHash:digest(profile),qualifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),mode:'LOCAL_FIXTURE',evidenceRef:'synthetic-public'}}};
    config.connection.qualification.profileHash=digest(config.engineering.profile);
    fixture.enrollment.revision++;fixture.document.enrollmentRevision++;
    fixture.enrollment.factoryVersion=fixture.document.admission.factoryVersion=config.connection.factoryVersion;
    fixture.enrollment.ownerFactoryAdapter={factoryId:config.connection.factoryId,sourceDigest:config.connection.sourceDigest,
      configurationDigest:config.connection.configurationDigest,configurationHash:factoryExecutionConfigurationHash(config),
      profileHash:config.connection.qualification.profileHash,repository:work.repository,agentId:env.agentId};
    await env.pool.query('UPDATE missioncontrol_owner_enrollments SET revision=$2,document=$3 WHERE owner_id=$1',[env.owner,fixture.enrollment.revision,fixture.enrollment]);
    await env.pool.query(`GRANT INSERT ON missioncontrol_owner_work_origins TO ${role}`);
    const workStore=new WorkStore({scopeId:env.owner,scopeKind:'personal',actorId:env.owner},database);
    const input={proposalId:'owner-proposal',workOrderId:fixture.document.workOrderId,expectedWorkOrderRevisionId:fixture.document.workOrderRevisionId,expectedPlanDigest:fixture.document.planDigest};
    const origin=await prepareOwnerFactoryOrigin(workStore,work,config,input);
    fixture.document.work.tupleSha256=origin.tupleSha256;
    return {work,workStore,config,input,v,profile,source:{sha:v.expected.inputCommit,files:{'input.txt':'before\n'}}};
  }
  async function ownerRoute(includeProof=true,admitted=true,signedResult=false) {
    const x=await ownerFixture(signedResult),requestId=randomUUID(),decisionId=randomUUID(),runId=randomUUID();
    const deadline=new Date(Date.now()+60000).toISOString(),binding=prepareAuthenticatedLocalFactoryInputV4({...x.v.expected,localSnapshotVersion:4,
      agentId:env.agentId,workId:x.work.id,workVersion:1,workGeneration:1,criteriaVersion:1});
    await env.pool.query(`INSERT INTO engineering_factory_requests(id,scope_id,scope_kind,work_id,actor_id,agent_id,factory_id,operation_id,binding)
      VALUES($1,$2,'personal',$3,$2,$7,$6,$4,$5)`,[requestId,env.owner,x.work.id,binding.operationId,binding,binding.factoryId,env.agentId]);
    const snapshot={contract:{deadline},factory:{requestId,repository:x.work.repository,baseSha:binding.inputCommit,
      profileHash:x.config.connection.qualification.profileHash,allowedPaths:x.profile.allowedPaths,deadline},
      ...(includeProof?{missionControl:{permitId:fixture.document.permitId,commandId:fixture.challenge.commandId,
        tupleSha256:fixture.document.work.tupleSha256,factoryRequestId:requestId}}:{})};
    await env.pool.query(`INSERT INTO engineering_routing_decisions(id,scope_id,scope_kind,work_id,work_version,selected_route,reason,source,profile,
      eligible_routes,rejected_routes,constraints,provider_id,provider_version,actor_id,admission_authority_snapshot,factory_preparation)
      VALUES($1,$2,'personal',$3,1,'MYFACTORY','synthetic','POLICY','{}','[]','[]','[]',$7,$4,$2,$5,$6)`,
      [decisionId,env.owner,x.work.id,binding.factoryVersion,snapshot,{configurationHash:factoryExecutionConfigurationHash(x.config),request:{workId:x.work.id,workGeneration:1,repository:x.work.repository,requestId:binding.requestId,deadline}},binding.factoryId]);
    if(admitted)await env.pool.query(`UPDATE engineering_routing_decisions SET status='ADMITTED',admitted_at=clock_timestamp(),admission_reason='synthetic',
      admission_policy_id='fixture',admission_policy_version=1,admission_request='{}',admission_context_snapshot='{}',
      admission_context_hash=$2,admission_authority_hash=$2 WHERE id=$1`,[decisionId,'sha256:'+'1'.repeat(64)]);
    const insert=()=>env.pool.query(`INSERT INTO engineering_route_runs(id,scope_id,scope_kind,work_id,route,provider_id,provider_version,status,decision_id,work_version,work_generation)
      VALUES($1,$2,'personal',$3,'MYFACTORY',$6,$4,'QUEUED',$5,1,1) RETURNING *`,[runId,env.owner,x.work.id,binding.factoryVersion,decisionId,binding.factoryId]);
    return {...x,insert,runId,decisionId,requestId,binding};
  }
 const x=await ownerRoute();
 await store.accept(fixture.signPermit(),fixture.signReceipt(),fixture.challenge,pair,fixture.document.work.id,env.policy.repository);
 await x.insert();
 const writers=new FactoryWriterStore(env.store),run=await writers.inspect(x.work.id,x.runId);
 assert.ok(run.missioncontrol_binding);
 const receipts=new FactoryReceiptStore(env.store.principal,env.db);
 const result=codec.signLocalResultV4(x.v.manifest,x.v.artifacts,x.v.privateKey),options={keys:async()=>x.v.options.keys};
 const admitted=await admitLocalFactoryResultV4(receipts,x.requestId,result,options);assert.equal(admitted.status,'ADMITTED');assert.equal(admitted.independentVerification,'NOT_RUN');assert.equal(admitted.readiness,'NOT_READY');
 const terminal=async(state='COMPLETED')=>writers.reconcile(run,{observe:async()=>({...await writers.identity(run),state,quiescent:true,evidenceRef:'public-controlled-no-productive-process'})});
 const take=(receiptId=admitted.receiptId,writer=run)=>writers.takeLocalCustodyV4(writer,receiptId,x.source,x.profile,options);
 const empty=async()=>assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_direct_workspaces WHERE work_id=$1',[x.work.id])).rows[0].n,0);
 return {...x,env,writers,run,receipts,result,options,admitted,terminal,take,empty,store,fixture};
 }
 const a=await scenario();await a.terminal();const custody=await a.take();
 assert.equal(custody.factory_candidate.receiptId,a.admitted.receiptId);
 const candidate=custody.factory_candidate.candidates[0];assert.equal(candidate.sha,a.v.manifest.candidate.commit);assert.equal(candidate.tree,a.v.manifest.candidate.tree);
 assert.equal(candidate.rawCommit,Buffer.from(a.v.artifacts.find(x=>x.id==='commit').base64,'base64').toString());assert.deepEqual(candidate.files,{'input.txt':'after\n'});
 const workspace=(await pool.query('SELECT * FROM engineering_direct_workspaces WHERE work_id=$1',[a.work.id])).rows[0];
 assert.equal(workspace.phase,'VERIFICATION_REQUESTED');assert.equal(workspace.factory_receipt_id,a.admitted.receiptId);pass('current canonical V4 data enters exact raw producer custody and requests verification only');
 assert.deepEqual((await a.take()).factory_candidate,custody.factory_candidate);pass('exact handoff replay converges on immutable custody');
 const conflict=structuredClone(custody.factory_candidate);conflict.files['input.txt']='conflict';
 await assert.rejects(pool.query('SELECT engineering_writer_handoff($1::jsonb)',[JSON.stringify({...a.env.store.principal,workId:a.work.id,runId:a.run.id,writerGeneration:a.run.writer_generation,action:'custody',custody:conflict})]),/replay conflict/);pass('actual SQL rejects conflicting custody replay');
 const u=await scenario();await assert.rejects(u.writers.dispatch(u.run,{dispatch:async()=>{throw Error('SYNTHETIC_LOST_RESPONSE')}}),/SYNTHETIC_LOST_RESPONSE/);
 assert.equal((await u.writers.inspect(u.work.id,u.run.id)).dispatch_state,'UNKNOWN');await assert.rejects(u.take(),/Exact completed/);await u.empty();pass('UNKNOWN writer cannot materialize or hand off a candidate');
 await assert.rejects(pool.query(`INSERT INTO engineering_route_runs(id,scope_id,scope_kind,work_id,route,provider_id,provider_version,status,decision_id,work_version,work_generation)
  SELECT $1,scope_id,scope_kind,work_id,route,provider_id,provider_version,'QUEUED',decision_id,work_version,work_generation FROM engineering_route_runs WHERE id=$2`,[randomUUID(),u.run.id]));
 assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_route_runs WHERE work_id=$1',[u.work.id])).rows[0].n,1);pass('UNKNOWN attempt cannot overlap another admitted writer');
 const revoked=await scenario();await revoked.terminal();const revoke=revoked.fixture.signControl();await revoked.store.fence(revoked.fixture.document.permitId,revoke,controlDigest(revoke.document));
 await assert.rejects(revoked.take(),/MISSIONCONTROL_WORK_FENCED/);await revoked.empty();pass('current signed revoke blocks actual SQL custody');
 const isolation=await scenario();await isolation.terminal();const previous=isolation.env.store.database.query;
 isolation.env.store.database.query=async(sql,values)=>{
  if(!sql.startsWith('SELECT engineering_writer_handoff'))return previous(sql,values);
  const c=await pool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');return (await c.query(sql,values)).rows}finally{await c.query('ROLLBACK');c.release()}
 };
 await assert.rejects(isolation.take(),/MISSIONCONTROL_ADMISSION_ISOLATION_REQUIRED/);await isolation.empty();pass('0104 non-READ_COMMITTED custody denial survives V4 materialization');
 const cancelled=await scenario();await cancelled.writers.stop(cancelled.run,{stop:async()=>{}},'cancel');await cancelled.terminal('CANCELLED');
 await assert.rejects(cancelled.take(),/Exact completed/);await cancelled.empty();pass('cancelled terminal writer cannot hand off');
 for(const target of ['HUMAN','AGENT']){
  const f=await scenario();await f.terminal();await f.writers.advance(f.run,1,target);await assert.rejects(f.take(),/canonical/);await f.empty();pass(target==='HUMAN'?'human takeover preserves historical receipt without custody':'new Work generation preserves historical receipt without custody');
 }
 const alias=await scenario();await alias.terminal();const variant=structuredClone(alias.result);variant.artifacts.reverse();const delivery=await alias.receipts.receive(alias.requestId,variant);
 assert.notEqual(delivery.id,alias.admitted.receiptId);await assert.rejects(alias.take(delivery.id),/canonical/);await alias.empty();pass('noncanonical delivery alias is refused by explicit writer API');
 const stale=await scenario();await stale.terminal();await assert.rejects(stale.take(stale.admitted.receiptId,{...stale.run,writer_generation:stale.run.writer_generation+1}),/Exact completed/);await stale.empty();pass('stale immutable writer fence is refused');
 const retired=await scenario();await retired.terminal();retired.options.keys=async()=>retired.v.options.keys.map(k=>({...k,revokedAt:new Date().toISOString()}));
 await assert.rejects(retired.take(),/canonical/);await retired.empty();pass('revoked producer key cannot authorize new custody');
 assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_direct_verification_jobs')).rows[0].n,0);
 assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_native_results')).rows[0].n,0);
 assert.deepEqual(unexpected,[]);pass('no protected verification jobs or native Results are produced');
 console.log(JSON.stringify({passed:count,fullCurrentChain:true,productiveDispatch:false,protectedVerification:'NOT_RUN',readiness:'NOT_READY'}));
}finally{
 await pool?.end();
 try{
  if(!/^q37_v4writer_[a-f0-9]{32}$/.test(name))throw Error('Owned database required');
  let quiet=false;for(let i=0;i<100;i++){if((await admin.query('SELECT count(*)::int n FROM pg_stat_activity WHERE datname=$1',[name])).rows[0].n===0){quiet=true;break}await new Promise(resolve=>setTimeout(resolve,25))}
  if(!quiet)throw Error('Owned fixture sessions remain');await admin.query('DROP DATABASE IF EXISTS '+name);
  for(const role of roles){if(!/^mc_v4_[a-f0-9]{24}$/.test(role))throw Error('Owned role required');await admin.query('DROP ROLE IF EXISTS '+role)}
 }finally{await admin.end()}
 assert.deepEqual(unexpected,[]);
}
