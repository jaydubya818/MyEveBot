import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { Env, connection, files } from '../external-alpha/work-test-fixture.ts';
import { alphaTasksTupleSha256 } from '../external-alpha/work-tuple.ts';
import type { WorkDatabase } from '../engineering/store.ts';
import { MissionControlBindings } from './permit-store.ts';
import { permitFixture } from './permit-test-fixture.ts';
import { readFile } from 'node:fs/promises';
import { capabilityRegistry } from '@mission-control/capability-control';
import { capabilityPairDigest, type CapabilityPair } from './installed-client.ts';
import { controlDigest } from './execution-permit.ts';
import { missionControlResultReadback } from './result-readback.ts';
import { FakeFactory } from '../external-alpha/factory-test-fixture.ts';
import { ExternalAlphaWorkController, receiptKeys } from '../external-alpha/work-controller.ts';
import { publicKeyId } from '../external-alpha/work-authority.ts';
import { buildSignedResult } from '../external-alpha/result-test-fixture.ts';
import { generateKeyPairSync,randomUUID } from 'node:crypto';
import { issueMissionControlSourcePermit } from './capability-source.ts';
import { signPolicyMessage,verifyPolicyMessage,parsePolicyMessage } from '../../../../packages/capability-enforcement/src/ordering-wire.ts';

describe.skipIf(!connection)('PostgreSQL MissionControl admission bindings', () => {
  let env: Env, database: WorkDatabase, store: MissionControlBindings, fixture: ReturnType<typeof permitFixture>, pair: CapabilityPair, role: string;
  beforeEach(async () => {
    env = await Env.create();
    role = 'mc_runtime_' + env.name.slice(8);
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
    const e = fixture.enrollment;
    await env.pool.query('INSERT INTO missioncontrol_owner_enrollments(owner_id,installation_id,revision,document) VALUES($1,$2,$3,$4)',
      [env.owner, e.installationId, e.revision, e]);
    for (const name of ['migration','enforcement','decisions','ordering','lifecycle'])
      await env.pool.query(await readFile(new URL('../../../../docs/capability-control/'+name+'.sql',import.meta.url),'utf8'));
    await env.pool.query(`CREATE ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    await env.pool.query(`GRANT USAGE ON SCHEMA public,capability_control TO ${role}`);
    await env.pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public,capability_control TO ${role}`);
    await env.pool.query(`GRANT UPDATE ON engineering_work TO ${role}`);
    await env.pool.query(`GRANT INSERT ON missioncontrol_work_bindings,missioncontrol_execution_permits,missioncontrol_admission_receipts,missioncontrol_permit_controls,missioncontrol_factory_readbacks TO ${role}`);
    await env.pool.query(`GRANT EXECUTE ON FUNCTION capability_control.lock_admission_policy(text,text,text),missioncontrol_capability_snapshot(text,text,text,text),missioncontrol_enrollment_document(text) TO ${role}`);
    const installation=e.installationId, ids=capabilityRegistry.capabilities.map(item=>item.id);
    const facts=Object.fromEntries(capabilityRegistry.capabilities.map(item=>[item.id,{supported:true,deployed:true,entitled:true,
      administrator:'ALLOW',setup:Object.fromEntries(item.setupRequirements.map(key=>[key,true])),
      qualification:Object.fromEntries(item.qualificationRequirements.map(key=>[key,'QUALIFIED'])),lifecycle:'ACTIVE'}]));
    await env.pool.query("INSERT INTO capability_control.installations VALUES($1,'fixture-organization','qualification',true)",[installation]);
    await env.pool.query("INSERT INTO capability_control.platform_owner_bindings VALUES($1,'fixture-organization',$2,'fixture-binding',1,'fixture-auth','fixture-admin','fixture-member','fixture-installation','fixture-audit','ACTIVE',clock_timestamp()+interval '1 hour')",[installation,env.owner]);
    await env.pool.query('INSERT INTO capability_control.owner_state(installation_id,owner_id,preferences) VALUES($1,$2,$3)',
      [installation,env.owner,Object.fromEntries(ids.map(id=>[id,'ENABLED']))]);
    await env.pool.query("INSERT INTO capability_control.evidence VALUES($1,'fixture-organization',$2,$3,$4,clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','fixture-evidence')",
      [installation,env.owner,capabilityRegistry.version,facts]);
    await env.pool.query("INSERT INTO capability_control.relay_agent_evidence VALUES($1,$2,'fixture-organization','fixture-agent',1,$3,'ACTIVE',clock_timestamp()+interval '1 hour','fixture-agent-record')",
      [installation,env.owner,JSON.stringify(ids)]);
    await env.pool.query("INSERT INTO capability_control.policy_destinations VALUES($1,$2,'fixture-mc','fixture-incarnation',1,'fixture-key','{}')",[installation,env.owner]);
    await env.pool.query("INSERT INTO capability_control.policy_changes(installation_id,owner_id,revision,policy_id,organization_id,capability_id,operation,destinations,status) VALUES($1,$2,1,'fixture-policy','fixture-organization','enterprise.fleet','enable','[]','ACKNOWLEDGED')",[installation,env.owner]);
    const source={kind:'PERMIT',authority:'myeve',ownerId:env.owner,organizationId:'fixture-organization',installationId:installation,
      backendId:'fixture-mc',incarnation:'fixture-incarnation',enrollmentVersion:1,version:1,policyId:'fixture-policy',
      referenceId:fixture.challenge.commandId,capabilityId:'enterprise.fleet',requiredCapabilities:['work','missioncontrol','enterprise.fleet'],
      registryVersion:capabilityRegistry.version,agentId:'fixture-agent',agentRevision:1,workId:work.id,missionId:fixture.document.missionId,
      workGeneration:1,actionDigest:'a'.repeat(64),budgetMicros:1300000,issuedAt:fixture.now,expiresAt:fixture.now+30000,sourcePermitHash:'SELF'};
    // The signed MC receipt authenticates the exact pair. This fixture exercises
    // PostgreSQL currentness; independent wire tests exercise both policy signatures.
    pair={myeve:{message:JSON.stringify(source),keyId:'fixture-key',signature:'fixture'},
      relay:{message:JSON.stringify({...source,authority:'relay',sourcePermitHash:'a'.repeat(64)}),keyId:'fixture-key',signature:'fixture'}};
    fixture.challenge.policyPairSha256=capabilityPairDigest(pair);
    store = new MissionControlBindings(database, env.owner);
  }, 30000);
  afterEach(async () => {
    await env?.close();
    if (role) { const client=await import('pg').then(pg=>new pg.default.Pool({connectionString:connection}));
      try { await client.query('DROP ROLE IF EXISTS '+role); } finally { await client.end(); } }
  });
  const accept = () => store.accept(fixture.signPermit(), fixture.signReceipt(), fixture.challenge, pair,
    fixture.document.work.id, env.policy.repository);

  it('issues the canonical source permit only for the pinned receiver and active policy',async()=>{
    const receiver=generateKeyPairSync('ec',{namedCurve:'P-256'}),source=generateKeyPairSync('ec',{namedCurve:'P-256'});
    const destination={backend_id:'fixture-mc',incarnation:'fixture-incarnation',enrollment_version:1,
      key_id:'fixture-receiver',public_jwk:receiver.publicKey.export({format:'jwk'})};
    await env.pool.query('UPDATE capability_control.policy_destinations SET key_id=$1,public_jwk=$2 WHERE owner_id=$3',[destination.key_id,destination.public_jwk,env.owner]);
    await env.pool.query('UPDATE capability_control.policy_changes SET destinations=$1 WHERE owner_id=$2',[JSON.stringify([destination]),env.owner]);
    await env.pool.query(`GRANT INSERT ON capability_control.policy_decisions TO ${role}`);
    const {requiredCapabilities:_required,agentRevision:_revision,sourcePermitHash:_hash,...base}=JSON.parse(pair.myeve.message);
    const challenge=parsePolicyMessage({...base,kind:'CHALLENGE',referenceId:randomUUID()});
    const packet=await signPolicyMessage(challenge,{keyId:destination.key_id,jwk:receiver.privateKey.export({format:'jwk'})});
    const processEnv={NODE_ENV:'test' as const,MYEVE_MISSIONCONTROL_MODE:'APPROVED_NONPRODUCTION',MYEVE_CAPABILITY_CONTROL_ENABLED:'true',
      MYEVE_CAPABILITY_ENVIRONMENT:'qualification',MYEVE_CAPABILITY_INSTALLATION_ID:fixture.enrollment.installationId,
      MYEVE_OWNER_ID:env.owner,MYEVE_MISSIONCONTROL_CAPABILITY_BACKEND_ID:'fixture-mc',MYEVE_MISSIONCONTROL_CAPABILITY_AGENT_ID:'fixture-agent',
      MYEVE_CAPABILITY_PROPAGATION_JSON:JSON.stringify({signer:{keyId:'fixture-source',jwk:source.privateKey.export({format:'jwk'})}})};
    const issued=await issueMissionControlSourcePermit(database,fixture.enrollment,packet,processEnv);
    expect(await verifyPolicyMessage(issued,{keyId:'fixture-source',jwk:source.publicKey.export({format:'jwk'})}))
      .toMatchObject({kind:'PERMIT',authority:'myeve',workId:fixture.document.work.id,missionId:fixture.document.missionId,sourcePermitHash:'SELF'});
    expect(await issueMissionControlSourcePermit(database,fixture.enrollment,packet,processEnv)).toEqual(issued);
    await expect(issueMissionControlSourcePermit(database,fixture.enrollment,{...packet,signature:'invalid'},processEnv)).rejects.toThrow();
    await env.pool.query("UPDATE capability_control.owner_state SET controls=jsonb_build_object('enterprise.fleet','REVOKE_REQUESTED') WHERE owner_id=$1",[env.owner]);
    await expect(issueMissionControlSourcePermit(database,fixture.enrollment,packet,processEnv)).rejects.toThrow('CONTROL_PENDING');
  });

  it('retains one binding and one permit under concurrent retries', async () => {
    const results = await Promise.all([accept(), accept(), accept()]);
    expect(results.every(result => result.work.id === fixture.document.work.id)).toBe(true);
    for (const table of ['missioncontrol_work_bindings','missioncontrol_execution_permits','missioncontrol_admission_receipts'])
      expect(await env.count(table)).toBe(1);
    expect((await store.forWork(fixture.document.work.id))?.binding.missionId).toBe(fixture.document.missionId);
    await expect(database.query('SELECT missioncontrol_assert_dispatch($1,$2,1,1,true)', [env.owner, fixture.document.work.id])).resolves.toHaveLength(1);
  });
  it('denies mismatched Work and cross-owner access before retaining evidence', async () => {
    const foreign = new MissionControlBindings(database, 'foreign-owner');
    await expect(foreign.enrollment()).rejects.toThrow('MISSIONCONTROL_BINDING_DENIED');
    fixture.document.work.generation++;
    await expect(accept()).rejects.toThrow('MISSIONCONTROL_PERMIT_DENIED');
    expect(await env.count('missioncontrol_work_bindings')).toBe(0);
    expect(await env.count('external_alpha_work_authority')).toBe(0);
  });
  it('rejects reuse of a permit id or Work tuple with another approved Mission', async () => {
    await accept(); fixture.document.missionId = 'different-mission';
    await expect(accept()).rejects.toThrow('MISSIONCONTROL_BINDING_DENIED');
    expect(await env.count('missioncontrol_execution_permits')).toBe(1);
  });
  it('enforces admission at the canonical authority even if application checks are bypassed', async () => {
    const work = await env.store.get(fixture.document.work.id);
    await expect(env.svc.issue(work, files)).rejects.toThrow('MISSIONCONTROL_CURRENT_ADMISSION_REQUIRED');
    expect(await env.count('external_alpha_work_authority')).toBe(0);
    expect(await env.count('external_alpha_cohort_admission')).toBe(0);
  });
  it('revocation fences current admission and preserves immutable historical evidence', async () => {
    await accept();
    const e = { ...fixture.enrollment, revision: 2, revokedAt: Date.now() };
    await env.pool.query('UPDATE missioncontrol_owner_enrollments SET revision=$2,document=$3 WHERE owner_id=$1', [env.owner, 2, e]);
    await expect(database.query('SELECT missioncontrol_assert_dispatch($1,$2,1,1,true)', [env.owner, fixture.document.work.id]))
      .rejects.toThrow('MISSIONCONTROL_ENROLLMENT_INACTIVE');
    await expect(accept()).rejects.toThrow('MISSIONCONTROL_PERMIT_DENIED');
    await expect(env.pool.query('DELETE FROM missioncontrol_execution_permits')).rejects.toThrow('MISSIONCONTROL_BINDING_IMMUTABLE');
    expect(await env.count('missioncontrol_execution_permits')).toBe(1);
  });
  it('a capability change after reservation denies the canonical dispatch claim', async () => {
    await accept();
    const authority=await env.svc.issue(await env.store.get(fixture.document.work.id),files);
    await env.pool.query("UPDATE capability_control.owner_state SET revision=revision+1,preferences=jsonb_set(preferences,'{enterprise.fleet}','\"DISABLED\"') WHERE owner_id=$1",[env.owner]);
    await expect(env.svc.claim(authority)).rejects.toThrow('MISSIONCONTROL_CAPABILITY_CURRENTNESS_REQUIRED');
    expect((await env.svc.forWork(fixture.document.work.id))?.state).toBe('ISSUED');
    expect(await env.count('external_alpha_cohort_dispatch')).toBe(0);
    // Reservation remains canonical historical accounting; a refusal never refunds it.
    expect(await env.count('external_alpha_cohort_admission')).toBe(1);
  });
  it('detects changed authoritative evidence even without a preference revision change', async () => {
    await accept();
    await env.pool.query("UPDATE capability_control.evidence SET facts=jsonb_set(facts,'{enterprise.fleet,administrator}','\"DENY\"') WHERE owner_id=$1",[env.owner]);
    await expect(database.query('SELECT missioncontrol_assert_dispatch($1,$2,1,1,true)',[env.owner,fixture.document.work.id]))
      .rejects.toThrow('MISSIONCONTROL_CAPABILITY_CURRENTNESS_REQUIRED');
    expect(await env.count('external_alpha_cohort_admission')).toBe(0);
  });
  it('denies a signed source decision from an older canonical agent revision', async () => {
    await env.pool.query('UPDATE capability_control.relay_agent_evidence SET revision=2 WHERE owner_id=$1',[env.owner]);
    await expect(accept()).rejects.toThrow('MISSIONCONTROL_BINDING_DENIED');
    expect(await env.count('missioncontrol_admission_receipts')).toBe(0);
  });
  it('denies a signed source decision for a replaced receiver incarnation', async () => {
    await env.pool.query("UPDATE capability_control.policy_destinations SET incarnation='replacement' WHERE owner_id=$1",[env.owner]);
    await expect(accept()).rejects.toThrow('MISSIONCONTROL_BINDING_DENIED');
    expect(await env.count('missioncontrol_admission_receipts')).toBe(0);
  });
  it('denies a source decision from a different policy at the same revision', async () => {
    const source=JSON.parse(pair.myeve.message);source.policyId='different-policy';
    pair.myeve.message=JSON.stringify(source);fixture.challenge.policyPairSha256=capabilityPairDigest(pair);
    await expect(accept()).rejects.toThrow('MISSIONCONTROL_BINDING_DENIED');
    expect(await env.count('missioncontrol_admission_receipts')).toBe(0);
  });
  it('does not extend Relay policy expiry to the later source expiry', async () => {
    const relay=JSON.parse(pair.relay.message);relay.expiresAt=Date.now()+2000;
    pair.relay.message=JSON.stringify(relay);fixture.challenge.policyPairSha256=capabilityPairDigest(pair);
    await accept();
    const row=(await env.pool.query('SELECT capability_expires_at FROM missioncontrol_admission_receipts')).rows[0];
    expect(new Date(row.capability_expires_at).getTime()).toBe(relay.expiresAt);
  });
  it('retains original authenticated Factory evidence and projects the same Mission Result', async () => {
    await accept();
    const factory=new FakeFactory({myeveKeys:new Map([[env.signer.keyId,env.signer.publicKey]]),policy:env.policy,allowedFiles:files,now:Date.now});
    const config=env.workConfig([{keyId:publicKeyId(factory.receiptKey.publicKey),publicKey:factory.receiptKey.publicKey.export({type:'spki',format:'pem'}) as string}]);
    const controller=new ExternalAlphaWorkController(env.svc,factory,config,receiptKeys(config),Date.now,
      (authority,original)=>store.retainFactoryReadback(authority,original));
    const work=await env.store.get(fixture.document.work.id),started=await controller.start(work);
    if(!started.sent)throw Error('Expected synthetic Factory dispatch');
    const request={schema:'mc-result-request/v1' as const,connectionId:fixture.enrollment.connectionId,
      installationId:fixture.enrollment.installationId,ownerId:env.owner,projectId:fixture.enrollment.projectId,
      permitId:fixture.document.permitId,commandId:'read-result',challenge:'a'.repeat(64),issuer:fixture.enrollment.issuer,
      audience:fixture.enrollment.audience,issuedAt:Date.now(),expiresAt:Date.now()+30000};
    const running=await missionControlResultReadback(database,request);
    expect(running).toMatchObject({status:'PENDING',missionId:fixture.document.missionId,result:null,
      admission:{authorityId:started.authority.id,requestId:started.authority.requestId}});
    expect(running.admission?.originalSignedReadback.readbackSignature).toBeTruthy();
    factory.state='COMPLETED';factory.quiescent=true;
    factory.resultPayload=buildSignedResult({authority:started.authority,work,workOrderId:started.readback.workOrderId,keys:env.resultKeys,
      opts:{requestDigest:factory.requestDigest(started.authority.requestId)}}).signed;
    await controller.reconcile(work.id,{work});
    const completed=await missionControlResultReadback(database,request);
    expect(completed.status).toBe('SETTLED');
    expect(completed.result).toMatchObject({cleanupConfirmed:true,exposureUnknown:false,settlementState:'SETTLED'});
    expect(completed.result?.proof).toBeTruthy();
    expect(completed.admission?.originalSignedReadback.readbackAttestation.state).toBe('COMPLETED');
    const count=await env.count('missioncontrol_factory_readbacks');
    await controller.refreshReadback(fixture.document.work);
    expect(await env.count('missioncontrol_factory_readbacks')).toBe(count+1);
    await expect(controller.refreshReadback({...fixture.document.work,version:999})).rejects.toThrow('EXTERNAL_ALPHA_READBACK_WORK_CHANGED');
    expect(factory.posts).toBe(1);
    await expect(missionControlResultReadback(database,{...request,connectionId:'foreign-connection'})).rejects.toThrow('MISSIONCONTROL_RESULT_ACCESS_DENIED');
    await expect(env.pool.query('DELETE FROM missioncontrol_factory_readbacks')).rejects.toThrow('MISSIONCONTROL_BINDING_IMMUTABLE');
  });
  it('commits a denying control before acknowledgment and preserves its history on retry', async () => {
    await accept();const control=fixture.signControl(),digest=controlDigest(control.document);
    const acknowledgments=await Promise.all([store.fence(fixture.document.permitId,control,digest),store.fence(fixture.document.permitId,control,digest)]);
    expect(acknowledgments[0]).toEqual(acknowledgments[1]);
    expect(acknowledgments[0]).toMatchObject({authority:'FENCED',cleanup:'PENDING_BACKEND'});
    expect(await env.count('missioncontrol_permit_controls')).toBe(1);
    await expect(env.svc.issue(await env.store.get(fixture.document.work.id),files)).rejects.toThrow('MISSIONCONTROL_WORK_FENCED');
    expect(await env.count('external_alpha_cohort_admission')).toBe(0);
    await expect(env.pool.query('DELETE FROM missioncontrol_permit_controls')).rejects.toThrow('MISSIONCONTROL_BINDING_IMMUTABLE');
  });
  it('retains the earliest policy-permit expiry instead of extending it to receipt expiry', async () => {
    const source=JSON.parse(pair.myeve.message),relay=JSON.parse(pair.relay.message);
    source.expiresAt=Date.now()+2000;relay.expiresAt=source.expiresAt+500;
    pair.myeve.message=JSON.stringify(source);pair.relay.message=JSON.stringify(relay);
    fixture.challenge.policyPairSha256=capabilityPairDigest(pair);
    await accept();
    const row=(await env.pool.query('SELECT capability_expires_at FROM missioncontrol_admission_receipts')).rows[0];
    expect(new Date(row.capability_expires_at).getTime()).toBe(source.expiresAt);
    await env.pool.query('SELECT pg_sleep(2.1)');
    await expect(database.query('SELECT missioncontrol_assert_dispatch($1,$2,1,1,true)',[env.owner,fixture.document.work.id]))
      .rejects.toThrow('MISSIONCONTROL_CAPABILITY_CURRENTNESS_REQUIRED');
    expect(await env.count('external_alpha_cohort_admission')).toBe(0);
  });
  it('RLS hides foreign rows from an ordinary runtime role', async () => {
    await accept();
    const client = await env.pool.connect();
    try {
      await client.query('CREATE ROLE mc_binding_test_reader');
      await client.query('GRANT SELECT ON missioncontrol_owner_enrollments,missioncontrol_work_bindings,missioncontrol_execution_permits,missioncontrol_admission_receipts TO mc_binding_test_reader');
      await client.query('SET ROLE mc_binding_test_reader');
      await client.query("SELECT set_config('myeve.missioncontrol_owner','foreign-owner',false)");
      expect((await client.query('SELECT * FROM missioncontrol_work_bindings')).rows).toEqual([]);
      await client.query("SELECT set_config('myeve.missioncontrol_owner',$1,false)", [env.owner]);
      expect((await client.query('SELECT * FROM missioncontrol_work_bindings')).rows).toHaveLength(1);
    } finally {
      await client.query('RESET ROLE');
      await client.query('DROP OWNED BY mc_binding_test_reader');
      await client.query('DROP ROLE mc_binding_test_reader'); client.release();
    }
  });
});
