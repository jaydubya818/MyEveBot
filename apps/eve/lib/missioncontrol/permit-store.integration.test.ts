import {ownerResultFixtureConfig,retainOwnerResultFixture} from './owner-result-test-fixture.ts';
import {prepareAuthenticatedFactoryInput} from '../engineering/factory-authenticated-result.ts';
import {RouteAdmissionService} from '../engineering/route-admission.ts';
import {ENGINEERING_COMPOSITION_V1} from '../digital-worker/packs.ts';
import {applyOwnerFactoryControl,pollOwnerFactoryWorkControl} from './owner-control-runtime.ts';
import {prepareOwnerFactoryOrigin,assertOwnerFactoryConfiguration} from './owner-factory-binding.ts';
import {factoryExecutionConfigurationHash} from '../engineering/factory-configuration-hash.ts';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Env, connection, files } from '../external-alpha/work-test-fixture.ts';
import { alphaTasksTupleSha256 } from '../external-alpha/work-tuple.ts';
import type { WorkDatabase } from '../engineering/store.ts';
import { MissionControlBindings } from './permit-store.ts';
import { permitFixture } from './permit-test-fixture.ts';
import { readFile } from 'node:fs/promises';
import { capabilityRegistry } from '@mission-control/capability-control';
import { capabilityPairDigest, type CapabilityPair } from './installed-client.ts';
import { controlDigest,permitDigest } from './execution-permit.ts';
import { missionControlResultReadback } from './result-readback.ts';
import { FakeFactory } from '../external-alpha/factory-test-fixture.ts';
import { ExternalAlphaWorkController, receiptKeys } from '../external-alpha/work-controller.ts';
import { ExternalAlphaWorkAuthority,publicKeyId } from '../external-alpha/work-authority.ts';
import { buildSignedResult } from '../external-alpha/result-test-fixture.ts';
import { generateKeyPairSync,randomUUID,sign } from 'node:crypto';
import { issueMissionControlSourcePermit } from './capability-source.ts';
import { signPolicyMessage,verifyPolicyMessage,parsePolicyMessage,admissionActionDigest,policyMessageHash } from '../../../../packages/capability-enforcement/src/ordering-wire.ts';
import { applyMissionControlControl,pollMissionControlControls } from './control-runtime.ts';
import { WorkStore } from '../engineering/store.ts';
import { digest } from '../engineering/contract.ts';
import { READBACK_DOMAIN } from '../external-alpha/dispatch-readback.ts';
import { prepareMissionControlExecution } from './prepare-execution.ts';
import { externalAlphaFactoryAction } from '../external-alpha/work-action.ts';
import { externalAlphaFactoryPinSha256 } from '../external-alpha/work-config.ts';
import { relayLeaseEnrollmentDigest } from './relay-lease-client.ts';

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
    await env.pool.query(`GRANT INSERT,UPDATE ON missioncontrol_control_attempts TO ${role}`);
    await env.pool.query(`GRANT INSERT ON missioncontrol_work_bindings,missioncontrol_execution_permits,missioncontrol_admission_receipts,missioncontrol_permit_controls,missioncontrol_factory_readbacks,missioncontrol_control_acknowledgments TO ${role}`);
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
    vi.unstubAllGlobals();vi.unstubAllEnvs();
    await env?.close();
    if (role) { const client=await import('pg').then(pg=>new pg.default.Pool({connectionString:connection}));
      try { await client.query('DROP ROLE IF EXISTS '+role); } finally { await client.end(); } }
  });
  async function ownerFixture(signedResult=false) {
    const work=await env.store.get(fixture.document.work.id);
    const config:any=signedResult?ownerResultFixtureConfig(work,env.resultKeys):{engineering:{ownerId:env.owner,agentId:'fixture-agent',profile:{repository:work.repository,allowedPaths:files}},
      routing:{intent:'PRODUCE'},commands:['node --test'],connection:{factoryId:'owner-fixture',sourceDigest:'1'.repeat(64),configurationDigest:'2'.repeat(64),
        qualification:{scopeId:env.owner,profileHash:'',qualifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),mode:'LOCAL_FIXTURE',evidenceRef:'synthetic'},
        factoryVersion:digest({sourceDigest:'1'.repeat(64),configurationDigest:'2'.repeat(64)})}};
    config.connection.qualification.profileHash=digest(config.engineering.profile);
    fixture.enrollment.revision++;fixture.document.enrollmentRevision++;
    fixture.enrollment.factoryVersion=fixture.document.admission.factoryVersion=config.connection.factoryVersion;
    fixture.enrollment.ownerFactoryAdapter={factoryId:config.connection.factoryId,sourceDigest:config.connection.sourceDigest,
      configurationDigest:config.connection.configurationDigest,configurationHash:factoryExecutionConfigurationHash(config),
      profileHash:config.connection.qualification.profileHash,repository:work.repository,agentId:'fixture-agent'};
    await env.pool.query('UPDATE missioncontrol_owner_enrollments SET revision=$2,document=$3 WHERE owner_id=$1',[env.owner,fixture.enrollment.revision,fixture.enrollment]);
    await env.pool.query(`GRANT INSERT ON missioncontrol_owner_work_origins TO ${role}`);
    const workStore=new WorkStore({scopeId:env.owner,scopeKind:'personal',actorId:env.owner},database);
    const input={proposalId:'owner-proposal',workOrderId:fixture.document.workOrderId,expectedWorkOrderRevisionId:fixture.document.workOrderRevisionId,expectedPlanDigest:fixture.document.planDigest};
    const origin=await prepareOwnerFactoryOrigin(workStore,work,config,input);
    fixture.document.work.tupleSha256=origin.tupleSha256;
    return {work,workStore,config,input};
  }
  async function ownerRoute(includeProof=true,admitted=true,signedResult=false) {
    const x=await ownerFixture(signedResult),requestId=randomUUID(),decisionId=randomUUID(),runId=randomUUID();
    const deadline=new Date(Date.now()+60000).toISOString(),binding=prepareAuthenticatedFactoryInput({factoryId:x.config.connection.factoryId,agentId:'fixture-agent',workId:x.work.id,workVersion:1,workGeneration:1,criteriaVersion:1,
      factoryVersion:x.config.connection.factoryVersion,sourceDigest:x.config.connection.sourceDigest,configurationDigest:x.config.connection.configurationDigest,
      inputCommit:'1'.repeat(40),requestId:randomUUID(),requestDigest:'3'.repeat(64),workOrderId:randomUUID(),runId:randomUUID(),attemptNumber:1});
    await env.pool.query(`INSERT INTO engineering_factory_requests(id,scope_id,scope_kind,work_id,actor_id,agent_id,factory_id,operation_id,binding)
      VALUES($1,$2,'personal',$3,$2,'fixture-agent',$6,$4,$5)`,[requestId,env.owner,x.work.id,binding.operationId,binding,binding.factoryId]);
    const snapshot={contract:{deadline},factory:{requestId,repository:x.work.repository,baseSha:binding.inputCommit,
      profileHash:x.config.connection.qualification.profileHash,allowedPaths:files,deadline},
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
  it('durably marks owner Work before approval and denies native and legacy SQL admission',async()=>{
    const x=await ownerFixture();
    await expect(env.pool.query(`INSERT INTO engineering_route_runs(id,scope_id,scope_kind,work_id,route,provider_id,provider_version,status,work_version,work_generation)
      VALUES($1,$2,'personal',$3,'DIRECT','fixture','1','QUEUED',1,1)`,[randomUUID(),env.owner,x.work.id])).rejects.toThrow('MISSIONCONTROL_OWNER_ROUTE_REQUIRED');
    await expect(env.pool.query(`INSERT INTO engineering_execution(scope_id,scope_kind,work_id,revision,state) VALUES($1,'personal',$2,1,'{}')`,[env.owner,x.work.id])).rejects.toThrow('MISSIONCONTROL_OWNER_ROUTE_REQUIRED');
    await expect(env.pool.query('DELETE FROM missioncontrol_owner_work_origins WHERE owner_id=$1',[env.owner])).rejects.toThrow('MISSIONCONTROL_ORIGIN_IMMUTABLE');
    expect(await env.count('engineering_route_runs')).toBe(0);
    expect(await env.count('missioncontrol_execution_permits')).toBe(0);
  });
  it('fails closed on missing exact owner metadata and changed qualified configuration',async()=>{
    const x=await ownerFixture();
    expect(()=>assertOwnerFactoryConfiguration(x.work,{...fixture.enrollment,ownerFactoryAdapter:undefined},x.config)).toThrow('BINDING_DENIED');
    expect(()=>assertOwnerFactoryConfiguration(x.work,fixture.enrollment,{...x.config,commands:['changed']})).toThrow('BINDING_DENIED');
    expect(()=>assertOwnerFactoryConfiguration({...x.work,scopeId:'foreign'},fixture.enrollment,x.config)).toThrow('BINDING_DENIED');
    await expect(prepareOwnerFactoryOrigin(x.workStore,x.work,x.config,{...x.input,workOrderId:'foreign'})).rejects.toThrow('BINDING_DENIED');
  });
  it('denies owner writer SQL admission before signed approval and when correlation is missing',async()=>{
    const x=await ownerRoute(false);
    await expect(x.insert()).rejects.toThrow('MISSIONCONTROL_FACTORY_CORRELATION_REQUIRED');
    await accept();
    await expect(x.insert()).rejects.toThrow('MISSIONCONTROL_FACTORY_CORRELATION_REQUIRED');
  });
  it('retains exact original Factory request attempt and writer under the signed owner permit',async()=>{
    const x=await ownerRoute();await accept();
    const run=(await x.insert()).rows[0];
    expect(run.missioncontrol_binding).toMatchObject({permitId:fixture.document.permitId,commandId:fixture.challenge.commandId,
      factoryRequestId:x.requestId,factoryBinding:x.binding,routeRunId:x.runId,dispatchIdentity:x.requestId,writerGeneration:1});
    await expect(x.insert()).rejects.toThrow();
    expect(await env.count('engineering_route_runs')).toBe(1);
    await expect(env.pool.query("UPDATE engineering_route_runs SET missioncontrol_binding='{}' WHERE id=$1",[x.runId])).rejects.toThrow('IMMUTABLE');
  });
  it('preserves admitted owner authority on ordinary disable and fences revoke claim and late ACK',async()=>{
    const x=await ownerRoute();await accept();await x.insert();
    const disable=fixture.signControl({...fixture.controlDocument(),operation:'disable_new'});
    await store.fence(fixture.document.permitId,disable,controlDigest(disable.document));
    await env.pool.query("UPDATE engineering_route_runs SET dispatch_state='UNKNOWN' WHERE id=$1",[x.runId]);
    const revoke=fixture.signControl({...fixture.controlDocument(),sequence:2});
    await store.fence(fixture.document.permitId,revoke,controlDigest(revoke.document));
    await expect(env.pool.query("UPDATE engineering_route_runs SET dispatch_state='DISPATCHED' WHERE id=$1",[x.runId])).rejects.toThrow('MISSIONCONTROL_WORK_FENCED');
    await expect(env.pool.query("UPDATE engineering_route_runs SET factory_candidate='{}' WHERE id=$1",[x.runId])).rejects.toThrow('MISSIONCONTROL_WORK_FENCED');
    expect((await env.pool.query('SELECT dispatch_state FROM engineering_route_runs WHERE id=$1',[x.runId])).rows[0].dispatch_state).toBe('UNKNOWN');
    await env.pool.query("UPDATE engineering_route_runs SET dispatch_state='STOPPING' WHERE id=$1",[x.runId]);
    expect(await env.count('missioncontrol_execution_permits')).toBe(1);
  });
  it('does not use another current permit to reauthorize an obsolete selected receipt',async()=>{
    const x=await ownerRoute();await accept();
    fixture.enrollment.revision++;fixture.document.enrollmentRevision++;
    await env.pool.query('UPDATE missioncontrol_owner_enrollments SET revision=$2,document=$3 WHERE owner_id=$1',[env.owner,fixture.enrollment.revision,fixture.enrollment]);
    fixture.document.permitId=randomUUID();fixture.challenge.commandId=randomUUID();await accept();
    await expect(x.insert()).rejects.toThrow('MISSIONCONTROL_EXACT_ADMISSION_REQUIRED');
  });
  it('rolls back owner permit retention when the receiving transaction fails',async()=>{
    await ownerFixture();
    await expect(database.atomic!(async db=>{
      await store.acceptInTransaction(db,fixture.signPermit(),fixture.signReceipt(),fixture.challenge,pair,fixture.document.work.id,env.policy.repository);
      throw Error('INJECTED_ADMISSION_FAILURE');
    })).rejects.toThrow('INJECTED_ADMISSION_FAILURE');
    expect(await env.count('missioncontrol_execution_permits')).toBe(0);
    expect(await env.count('missioncontrol_admission_receipts')).toBe(0);
  });

  it('denies fresh owner admission after concurrent policy disable while preserving retained proof',async()=>{
    const x=await ownerRoute();await accept();
    await env.pool.query("UPDATE capability_control.owner_state SET revision=revision+1,preferences=jsonb_set(preferences,'{missioncontrol}','\"DISABLED\"') WHERE owner_id=$1",[env.owner]);
    await expect(x.insert()).rejects.toThrow('MISSIONCONTROL_CAPABILITY_CURRENTNESS_REQUIRED');
    expect(await env.count('engineering_route_runs')).toBe(0);
    expect(await env.count('missioncontrol_execution_permits')).toBe(1);
  });
  it('fences an owner writer before claim and freezes its original request',async()=>{
    const x=await ownerRoute();await accept();await x.insert();
    await expect(env.pool.query("UPDATE engineering_factory_requests SET binding=binding||'{\"attemptNumber\":2}' WHERE id=$1",[x.requestId])).rejects.toThrow('MISSIONCONTROL_FACTORY_REQUEST_IMMUTABLE');
    const revoke=fixture.signControl();await store.fence(fixture.document.permitId,revoke,controlDigest(revoke.document));
    await expect(env.pool.query("UPDATE engineering_route_runs SET dispatch_state='UNKNOWN' WHERE id=$1",[x.runId])).rejects.toThrow('MISSIONCONTROL_WORK_FENCED');
    expect((await env.pool.query('SELECT dispatch_state FROM engineering_route_runs WHERE id=$1',[x.runId])).rows[0].dispatch_state).toBe('PREPARED');
  });
  it('serializes simultaneous owner admissions into one original writer',async()=>{
    const x=await ownerRoute();await accept();
    const outcomes=await Promise.allSettled([x.insert(),x.insert()]);
    expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect(await env.count('engineering_route_runs')).toBe(1);
  });
  it('isolates owner origin evidence under the runtime role',async()=>{
    await ownerFixture();
    const rows=await database.atomic!(async db=>{
      await db.query("SELECT set_config('myeve.missioncontrol_owner','foreign',true)");
      return db.query('SELECT * FROM missioncontrol_owner_work_origins');
    });
    expect(rows).toEqual([]);
  });

  async function canonicalOwnerRoute(race=false,signedResult=false){
    const x=await ownerRoute(false,false,signedResult),scope={kind:'personal',id:env.owner},provider={id:x.binding.factoryId,version:x.binding.factoryVersion};
    await env.pool.query(`INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary,status,max_estimated_cost_usd,max_runtime_seconds,max_steps)
      VALUES('fixture-agent',$1,'Sofie','sofie','engineer','synthetic owner fixture',true,'active',1.3,180,30)`,[env.owner]);
    await env.pool.query(`GRANT UPDATE ON agents,business_partnership TO ${role}`);
    await env.pool.query(`GRANT EXECUTE ON FUNCTION business_assert_effect(text,uuid,integer,integer,text,jsonb) TO ${role}`);
    await env.pool.query(`GRANT INSERT,UPDATE ON engineering_routing_decisions,engineering_route_runs,engineering_route_transitions,engineering_native_runtime TO ${role}`);
    vi.stubEnv('MYEVE_CAPABILITY_CONTROL_ENABLED','true');vi.stubEnv('MYEVE_CAPABILITY_INSTALLATION_ID',fixture.enrollment.installationId);
    vi.stubEnv('MYEVE_CAPABILITY_ENVIRONMENT','qualification');vi.stubEnv('MYEVE_CAPABILITY_DATABASE_URL',connection!);
    vi.stubEnv('MYEVE_CAPABILITY_ORIGIN','http://127.0.0.1:3000');vi.stubEnv('VERCEL','');vi.stubEnv('VERCEL_ENV','');
    const now=new Date().toISOString(),deadline=new Date(Date.now()+60000).toISOString(),routePolicy={id:'owner-policy',version:1};
    const contract={contractVersion:2,workId:x.work.id,workVersion:1,criteriaVersion:1,scope,humanOwnerId:env.owner,coordinatingAgentId:'fixture-agent',
      objective:x.work.objective,criteria:x.work.criteria.map(c=>({id:c.id,statement:c.statement,evidence:c.method==='test'?'deterministic':'human'})),
      resourceRefs:['repository:'+x.work.repository],allowedOperations:['factory.submit'],allowedRoutes:['MYFACTORY'],budgetUsd:1.3,deadline,policyVersion:1,
      composition:ENGINEERING_COMPOSITION_V1,routingProfile:{profileVersion:1,workShape:'bounded',decomposition:'single-thread',interaction:'interactive',parallelism:'low',
        verification:'standard',duration:'short',ambiguity:'low',externalExpertise:'none',humanJudgment:'possible',risk:'medium'},routePolicy,definitionOfDone:['Independent protected verification']};
    const context={contractVersion:2,workId:x.work.id,workVersion:1,scope,agentId:'fixture-agent',assembledAt:now,maxTokens:1000,estimatedTokens:0,items:[]};
    const facts={currentWorkVersion:1,currentCriteriaVersion:1,currentPolicyVersion:1,workActive:true,scope,agentId:'fixture-agent',authority:'ALLOW',remainingBudgetUsd:1.3,
      allowedRoutes:['MYFACTORY'],allowedOperations:['factory.submit'],allowedResourceRefs:contract.resourceRefs,routePolicy:{...routePolicy,allowedRoutes:['MYFACTORY'],
        providers:{DIRECT:null,DEEP_AGENT:null,EXECUTOR:null,MYFACTORY:provider,RELAY:null}},
      qualifications:{DIRECT:null,DEEP_AGENT:null,EXECUTOR:null,RELAY:null,MYFACTORY:{provider,scope,status:'QUALIFIED',health:'HEALTHY',evidenceRef:'synthetic',observedAt:now,expiresAt:deadline}},
      writerState:'NONE',factoryAdmission:'ALLOW',relayGrant:'DENY',peerPolicy:'DENY',observedAt:now};
    const proof={permit:fixture.signPermit(),receipt:fixture.signReceipt(),request:fixture.challenge,pair,tupleSha256:fixture.document.work.tupleSha256};
    const service=new RouteAdmissionService(x.workStore,{read:async()=>{
      if(race)await env.pool.query("UPDATE engineering_routing_decisions SET provider_version=$2 WHERE id=$1",[x.decisionId,'f'.repeat(64)]);
      return {contract,context,facts,factory:{requestId:x.requestId,repository:x.work.repository,baseSha:x.binding.inputCommit,
        profileHash:x.config.connection.qualification.profileHash,allowedPaths:files,deadline}};
    }},proof);
    return {x,admit:()=>service.admit(x.work.id,{decisionId:x.decisionId,expectedWorkVersion:1,expectedWorkGeneration:1,
      request:{route:'MYFACTORY',requiredOperations:['factory.submit'],resourceRefs:contract.resourceRefs}})};
  }
  it('composes both canonical capability checks, signed approval and original Factory writer in one receiving transaction',async()=>{
    const {x,admit}=await canonicalOwnerRoute();const result=await admit();
    expect(result).toMatchObject({route:'MYFACTORY',status:'QUEUED',workVersion:1,workGeneration:1});
    const [run]=(await env.pool.query('SELECT * FROM engineering_route_runs WHERE id=$1',[result.runId])).rows;
    expect(run.missioncontrol_binding).toMatchObject({permitId:fixture.document.permitId,factoryRequestId:x.requestId,commandId:fixture.challenge.commandId});
    expect(await env.count('missioncontrol_admission_receipts')).toBe(1);
  });
  it('reads original signed owner Gate C Result and canonical NativeResultStore Proof from retained custody',async()=>{
    const {x,admit}=await canonicalOwnerRoute(false,true),admitted=await admit();
    // The runtime principal remains restricted; fixture custody writes use only this disposable database's test owner.
    const fixtureStore=new WorkStore(x.workStore.principal,env.db);
    const retained=await retainOwnerResultFixture({store:fixtureStore,config:x.config,keys:env.resultKeys,work:x.work,
      binding:x.binding,requestId:x.requestId,runId:admitted.runId,decisionId:x.decisionId});
    const e=fixture.enrollment,request={schema:'mc-result-request/v1' as const,connectionId:e.connectionId,installationId:e.installationId,
      ownerId:env.owner,projectId:e.projectId,issuer:e.issuer,audience:e.audience,permitId:fixture.document.permitId,
      commandId:randomUUID(),challenge:'a'.repeat(64),issuedAt:Date.now(),expiresAt:Date.now()+30000};
    const result=await missionControlResultReadback(database,request);
    expect(result.status).toBe('SETTLED');
    expect(result.result).toMatchObject({resultId:retained.receiptId,nativeResultId:retained.native.id,proofHash:retained.native.contentHash,
      signedResult:retained.signed,cleanupConfirmed:true,exposureUnknown:false,acceptance:null});
    expect(result.result?.proof).toEqual(retained.native.proof);
    expect(retained.native.proof.evidence).toHaveLength(x.work.criteria.length);
    expect(retained.native.proof.evidence.every(e=>e.state==='PASS')).toBe(true);
    expect(await env.count('external_alpha_work_authority')).toBe(0);
    await env.pool.query("UPDATE engineering_routing_decisions SET factory_observation=jsonb_set(factory_observation,'{backendObservedAt}',to_jsonb((clock_timestamp()-interval '1 minute')::text)) WHERE id=$1",[x.decisionId]);
    await expect(missionControlResultReadback(database,request)).rejects.toThrow('MISSIONCONTROL_RESULT_REQUEST_EXPIRED');
  });
  it('rolls back signed approval and policy evidence if route proposal changes before receiving commit',async()=>{
    const {admit}=await canonicalOwnerRoute(true);await expect(admit()).rejects.toThrow('changed');
    expect(await env.count('missioncontrol_admission_receipts')).toBe(0);
    expect(await env.count('missioncontrol_execution_permits')).toBe(0);
    expect(await env.count('engineering_route_runs')).toBe(0);
  });
  it('targets signed owner revoke at the original writer and reports unavailable cleanup without losing the fence',async()=>{
    const x=await ownerRoute();await accept();await x.insert();
    const stopRun=vi.fn(async(workId:string,runId:string)=>{expect(workId).toBe(x.work.id);expect(runId).toBe(x.runId);throw Error('backend unavailable');});
    const control=fixture.signControl();
    const client={readControl:vi.fn(),acknowledgeControl:async(value:any)=>acknowledgmentResponse(value)};
    const result=await applyOwnerFactoryControl(x.workStore,{store:x.workStore,stopRun},{status:'CONTROL',control,controlDigest:controlDigest(control.document)},client);
    expect(result).toMatchObject({authority:'FENCED',cleanup:'PENDING_BACKEND'});expect(stopRun).toHaveBeenCalledOnce();
    await expect(env.pool.query("UPDATE engineering_route_runs SET dispatch_state='UNKNOWN' WHERE id=$1",[x.runId])).rejects.toThrow('MISSIONCONTROL_WORK_FENCED');
  });

  async function seedOwnerCustody(x:Awaited<ReturnType<typeof ownerRoute>>){
    const receiptId=randomUUID(),candidateId=randomUUID(),candidateSha='c'.repeat(40),profileHash=x.config.connection.qualification.profileHash;
    await env.pool.query(`INSERT INTO engineering_factory_receipts(id,request_id,envelope_digest,envelope) VALUES($1,$2,$3,'{}')`,[receiptId,x.requestId,'a'.repeat(64)]);
    const candidates=[{id:candidateId,sha:candidateSha}],custody={receiptId,candidates,sourceFiles:{},files:{},profileHash};
    await env.pool.query(`UPDATE engineering_route_runs SET dispatch_state='TERMINAL',status='COMPLETED',fenced_at=clock_timestamp(),
      quiescence='{"quiescent":true}',factory_candidate=$2 WHERE id=$1`,[x.runId,custody]);
    await env.pool.query(`INSERT INTO engineering_direct_workspaces(scope_id,scope_kind,work_id,decision_id,route_run_id,work_version,work_generation,
      criteria_version,repository,base_sha,profile_hash,deadline,source_files,draft_files,candidates,producer,factory_receipt_id,phase)
      VALUES($1,'personal',$2,$3,$4,1,1,1,$5,$6,$7,clock_timestamp()+interval '60 seconds','{}','{}',$8,'MYFACTORY',$9,'VERIFICATION_REQUESTED')`,
      [env.owner,x.work.id,x.decisionId,x.runId,x.work.repository,x.binding.inputCommit,profileHash,JSON.stringify(candidates),receiptId]);
    const token=randomUUID();
    await env.pool.query(`INSERT INTO engineering_direct_verification_jobs(scope_id,scope_kind,work_id,candidate_id,candidate_sha,workspace_revision,status,
      lease_token,lease_until,route_run_id) VALUES($1,'personal',$2,$3,$4,1,'RUNNING',$5,clock_timestamp()+interval '30 seconds',$6)`,
      [env.owner,x.work.id,candidateId,candidateSha,token,x.runId]);
    return {candidateSha,candidateId,token};
  }
  it('invalidates active verifier renewal and current lease after revoke while allowing recovery evidence',async()=>{
    const x=await ownerRoute();await accept();await x.insert();const v=await seedOwnerCustody(x);
    expect((await env.pool.query("SELECT engineering_candidate_verifiable($1,'personal',$2) AS allowed",[env.owner,x.work.id])).rows[0].allowed).toBe(true);
    const control=fixture.signControl();await store.fence(fixture.document.permitId,control,controlDigest(control.document));
    expect((await env.pool.query("SELECT engineering_candidate_verifiable($1,'personal',$2) AS allowed",[env.owner,x.work.id])).rows[0].allowed).toBe(false);
    await expect(env.pool.query("UPDATE engineering_direct_verification_jobs SET lease_until=clock_timestamp()+interval '1 minute' WHERE work_id=$1",[x.work.id])).rejects.toThrow('MISSIONCONTROL_WORK_FENCED');
    await expect(env.pool.query("UPDATE engineering_direct_verification_jobs SET status='COMPLETED',lease_token=NULL,lease_until=NULL WHERE work_id=$1",[x.work.id])).rejects.toThrow('MISSIONCONTROL_WORK_FENCED');
    await expect(env.pool.query("UPDATE engineering_direct_workspaces SET phase='VERIFICATION_PASSED' WHERE work_id=$1",[x.work.id])).rejects.toThrow('MISSIONCONTROL_WORK_FENCED');
    await expect(env.pool.query(`INSERT INTO engineering_native_results(id,scope_id,scope_kind,work_id,candidate_sha,work_version,work_generation,proof,content_hash)
      VALUES($1,$2,'personal',$3,$4,1,1,'{}',$5)`,[randomUUID(),env.owner,x.work.id,v.candidateSha,'a'.repeat(64)])).rejects.toThrow('MISSIONCONTROL_WORK_FENCED');
    await env.pool.query("UPDATE engineering_direct_verification_jobs SET status='RECOVERY_REQUIRED',lease_token=NULL,lease_until=NULL WHERE work_id=$1",[x.work.id]);
    expect((await env.pool.query('SELECT status FROM engineering_direct_verification_jobs WHERE work_id=$1',[x.work.id])).rows[0].status).toBe('RECOVERY_REQUIRED');
  });
  it('does not stop a newer writer when a delayed old owner revoke is delivered',async()=>{
    const x=await ownerRoute();await accept();await x.insert();await seedOwnerCustody(x);
    // A later current decision exists; stop(workId) would select it. The control
    // must use the original runId even when the current decision has moved on.
    const newerDecision=randomUUID();
    await env.pool.query(`INSERT INTO engineering_routing_decisions(id,scope_id,scope_kind,work_id,work_version,selected_route,reason,source,profile,eligible_routes,rejected_routes,constraints,actor_id)
      VALUES($1,$2,'personal',$3,2,'HUMAN','next revision','POLICY','{}','[]','[]','[]',$2)`,[newerDecision,env.owner,x.work.id]);
    const stopped:string[]=[];
    const driver={store:x.workStore,stopRun:async(_work:string,run:string)=>{stopped.push(run);return {} as any;}};
    const control=fixture.signControl(),client={readControl:vi.fn(),acknowledgeControl:async(value:any)=>acknowledgmentResponse(value)};
    await applyOwnerFactoryControl(x.workStore,driver,{status:'CONTROL',control,controlDigest:controlDigest(control.document)},client);
    expect(stopped).toEqual([x.runId]);
    expect((await env.pool.query('SELECT status FROM engineering_routing_decisions WHERE id=$1',[newerDecision])).rows[0].status).toBe('PROPOSED');
  });
  it('retries an older lost control ACK after checking the newer writer and keeps its stop exact',async()=>{
    const x=await ownerRoute();await accept();await x.insert();await seedOwnerCustody(x);
    const oldPermit=fixture.document.permitId,control=fixture.signControl();
    await store.fence(oldPermit,control,controlDigest(control.document));
    await env.pool.query('UPDATE engineering_work SET version=2 WHERE id=$1',[x.work.id]);
    const nextWork=await x.workStore.get(x.work.id);
    fixture.document.workOrderRevisionId=randomUUID();
    const nextOrigin=await prepareOwnerFactoryOrigin(x.workStore,nextWork,x.config,{...x.input,expectedWorkOrderRevisionId:fixture.document.workOrderRevisionId});
    fixture.document.work={...fixture.document.work,version:2,tupleSha256:nextOrigin.tupleSha256};
    fixture.document.permitId=randomUUID();fixture.challenge.commandId=randomUUID();
    const source=JSON.parse(pair.myeve.message);source.referenceId=fixture.challenge.commandId;
    pair.myeve.message=JSON.stringify(source);pair.relay.message=JSON.stringify({...source,authority:'relay',sourcePermitHash:'a'.repeat(64)});
    fixture.challenge.policyPairSha256=capabilityPairDigest(pair);await accept();
    const requestId=randomUUID(),decisionId=randomUUID(),runId=randomUUID();
    const binding={...x.binding,workVersion:2,requestId:randomUUID(),runId:randomUUID()};
    await env.pool.query('UPDATE engineering_factory_requests SET current=false WHERE id=$1',[x.requestId]);
    await env.pool.query(`INSERT INTO engineering_factory_requests(id,scope_id,scope_kind,work_id,actor_id,agent_id,factory_id,operation_id,binding)
      VALUES($1,$2,'personal',$3,$2,'fixture-agent','owner-fixture',$4,$5)`,[requestId,env.owner,x.work.id,'5'.repeat(64),binding]);
    const [prior]=(await env.pool.query('SELECT * FROM engineering_routing_decisions WHERE id=$1',[x.decisionId])).rows;
    const snapshot={...prior.admission_authority_snapshot,factory:{...prior.admission_authority_snapshot.factory,requestId},
      missionControl:{permitId:fixture.document.permitId,commandId:fixture.challenge.commandId,tupleSha256:fixture.document.work.tupleSha256,factoryRequestId:requestId}};
    const preparation={...prior.factory_preparation,request:{...prior.factory_preparation.request,requestId:binding.requestId}};
    await env.pool.query(`INSERT INTO engineering_routing_decisions(id,scope_id,scope_kind,work_id,work_version,selected_route,reason,source,profile,
      eligible_routes,rejected_routes,constraints,provider_id,provider_version,actor_id,admission_authority_snapshot,factory_preparation)
      VALUES($1,$2,'personal',$3,2,'MYFACTORY','next writer','POLICY','{}','[]','[]','[]','owner-fixture',$4,$2,$5,$6)`,
      [decisionId,env.owner,x.work.id,binding.factoryVersion,snapshot,preparation]);
    await env.pool.query(`UPDATE engineering_routing_decisions SET status='ADMITTED',admitted_at=clock_timestamp(),admission_reason='synthetic',
      admission_policy_id='fixture',admission_policy_version=1,admission_request='{}',admission_context_snapshot='{}',
      admission_context_hash=$2,admission_authority_hash=$2 WHERE id=$1`,[decisionId,'sha256:'+'1'.repeat(64)]);
    await env.pool.query(`INSERT INTO engineering_route_runs(id,scope_id,scope_kind,work_id,route,provider_id,provider_version,status,decision_id,work_version,work_generation)
      VALUES($1,$2,'personal',$3,'MYFACTORY','owner-fixture',$4,'QUEUED',$5,2,1)`,[runId,env.owner,x.work.id,binding.factoryVersion,decisionId]);
    const checked:string[]=[],stopped:string[]=[],driver={store:x.workStore,stopRun:async(_work:string,run:string)=>{stopped.push(run);return {} as any;}};
    const client={readControl:async(id:string)=>{checked.push(id);return id===oldPermit?{status:'CONTROL',control,controlDigest:controlDigest(control.document)}:{status:'NO_CONTROL'};},
      acknowledgeControl:async(value:any)=>acknowledgmentResponse(value)};
    await pollOwnerFactoryWorkControl(x.workStore,driver,x.work.id,{NODE_ENV:'test'},client);
    expect(checked).toEqual([fixture.document.permitId,oldPermit]);expect(stopped).toEqual([x.runId]);
    expect((await env.pool.query('SELECT dispatch_state FROM engineering_route_runs WHERE id=$1',[runId])).rows[0].dispatch_state).toBe('PREPARED');
    expect((await env.pool.query('SELECT permit_id FROM missioncontrol_control_acknowledgments')).rows).toEqual([{permit_id:oldPermit}]);
    client.readControl=async()=>{throw Error('offline');};
    await expect(pollOwnerFactoryWorkControl(x.workStore,driver,x.work.id,{NODE_ENV:'test'},client)).rejects.toThrow('offline');
  });

  const alphaReadback=(value:Awaited<ReturnType<typeof missionControlResultReadback>>)=>{
    if(!value.admission||!('originalSignedReadback' in value.admission))throw Error('Expected original alpha readback');
    return value.admission.originalSignedReadback;
  };
  const accept = () => store.accept(fixture.signPermit(), fixture.signReceipt(), fixture.challenge, pair,
    fixture.document.work.id, env.policy.repository);
  const admission=()=>({permitId:fixture.document.permitId,commandId:fixture.challenge.commandId});
  const acknowledgmentResponse=(value:any)=>({permitId:value.permitId,sequence:value.sequence,authority:value.authority,cleanup:value.cleanup,accounting:'UNCHANGED'});
  it('composes fresh signed MC and Relay admission into the original Factory action exactly once',async()=>{
    const receiver=generateKeyPairSync('ec',{namedCurve:'P-256'}),source=generateKeyPairSync('ec',{namedCurve:'P-256'}),relay=generateKeyPairSync('ec',{namedCurve:'P-256'});
    const destination={backend_id:'fixture-mc',incarnation:'fixture-incarnation',enrollment_version:1,
      key_id:'fixture-receiver',public_jwk:receiver.publicKey.export({format:'jwk'})};
    await env.pool.query('UPDATE capability_control.policy_destinations SET key_id=$1,public_jwk=$2 WHERE owner_id=$3',[destination.key_id,destination.public_jwk,env.owner]);
    await env.pool.query('UPDATE capability_control.policy_changes SET destinations=$1 WHERE owner_id=$2',[JSON.stringify([destination]),env.owner]);
    await env.pool.query("UPDATE capability_control.relay_agent_evidence SET agent_id='agt_fixtureagent' WHERE owner_id=$1",[env.owner]);
    await env.pool.query(`GRANT INSERT ON capability_control.policy_decisions TO ${role}`);
    const factory=new FakeFactory({myeveKeys:new Map([[env.signer.keyId,env.signer.publicKey]]),policy:env.policy,allowedFiles:files,now:Date.now});
    const config=env.workConfig([{keyId:publicKeyId(factory.receiptKey.publicKey),publicKey:factory.receiptKey.publicKey.export({type:'spki',format:'pem'}) as string}]);
    const e=fixture.enrollment,publicRelay=relay.publicKey.export({format:'jwk'});
    e.revision=fixture.document.enrollmentRevision=2;
    const runtime={NODE_ENV:'test' as const,VERCEL:'1',VERCEL_ENV:'production',VERCEL_PROJECT_ID:env.policy.projectId,
      EVE_PROJECT_NAME:'myeve-alpha-tester-1',MYEVE_OWNER_ID:env.owner,MYEVE_EXTERNAL_ALPHA_POLICY:JSON.stringify(env.policy),
      MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY:generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}).toString(),
      MYEVE_EXTERNAL_ALPHA_POLICY_SHA256:digest(env.policy),MYEVE_EXTERNAL_ALPHA_WORK_CONFIG:JSON.stringify(config),
      MYEVE_EXTERNAL_ALPHA_FACTORY_ORIGIN:config.factory.origin,MYEVE_EXTERNAL_ALPHA_FACTORY_PIN_SHA256:externalAlphaFactoryPinSha256(env.policy,config),
      MYEVE_MISSIONCONTROL_MODE:'APPROVED_NONPRODUCTION',MYEVE_MISSIONCONTROL_URL:e.issuer,MYEVE_MISSIONCONTROL_AUDIENCE:e.audience,
      MYEVE_MISSIONCONTROL_CONNECTION_ID:e.connectionId,MYEVE_MISSIONCONTROL_INSTALLATION_ID:e.installationId,
      MYEVE_MISSIONCONTROL_SECRET:'synthetic-connection-secret-32-characters',MYEVE_CAPABILITY_CONTROL_ENABLED:'true',
      MYEVE_CAPABILITY_ENVIRONMENT:'qualification',MYEVE_CAPABILITY_INSTALLATION_ID:e.installationId,
      MYEVE_MISSIONCONTROL_CAPABILITY_BACKEND_ID:'fixture-mc',MYEVE_MISSIONCONTROL_CAPABILITY_AGENT_ID:'agt_fixtureagent',
      MYEVE_CAPABILITY_PROPAGATION_JSON:JSON.stringify({signer:{keyId:'fixture-source',jwk:source.privateKey.export({format:'jwk'})}}),
      MYEVE_MISSIONCONTROL_RELAY_RUNTIME_CREDENTIAL:'synthetic-runtime-credential',MYEVE_MISSIONCONTROL_RELAY_WORKLOAD_TOKEN:'synthetic-workload-token',
      MYEVE_MISSIONCONTROL_RELAY_LEASE_JSON:JSON.stringify({schema:'mc-relay-lease-enrollment/v1',ownerId:env.owner,installationId:e.installationId,
        connectionId:e.connectionId,enrollmentRevision:e.revision,origin:'https://relay.example.test',activeFrom:Date.now()-1000,expiresAt:Date.now()+60000,
        accountId:'acct_fixtureaccount',agentId:'agt_fixtureagent',runtimeClientId:'rtc_fixtureruntime',taskId:'tsk_fixturetask',workloadId:'wkl_fixtureworkload',
        audience:'fixture-audience',capability:{name:'resource.lease.execute',version:'1.0'},resource:{type:'target',ids:['synthetic']},parameters:{},
        relayKey:{keyId:'fixture-relay',jwk:{kty:publicRelay.kty,crv:publicRelay.crv,x:publicRelay.x,y:publicRelay.y}}})};
    e.relayLeaseEnrollmentSha256=relayLeaseEnrollmentDigest(JSON.parse(runtime.MYEVE_MISSIONCONTROL_RELAY_LEASE_JSON));
    await env.pool.query('UPDATE missioncontrol_owner_enrollments SET revision=$2,document=$3 WHERE owner_id=$1',[env.owner,e.revision,e]);
    const calls:string[]=[];
    vi.stubGlobal('fetch',async(url:string,options:RequestInit)=>{
      const body=JSON.parse(String(options.body));
      if(url==='https://relay.example.test/api/v2/runtime/capability-leases/prepare'){
        calls.push('relay-prepare');return Response.json({decision:{decisionId:'dec_fixturedecision',expiresAt:new Date(Date.now()+60000).toISOString(),outcome:'ALLOW',reasonCodes:[],obligations:{},matchedRuleIds:[]},approvalRequest:null});
      }
      if(url==='https://relay.example.test/api/v2/runtime/capability-leases'){
        calls.push('relay');const proof=await verifyPolicyMessage(body.remoteAdmission,{keyId:'fixture-source',jwk:source.publicKey.export({format:'jwk'})});
        if(proof.kind!=='PERMIT')throw Error('expected permit');
        expect(body.action.parameters.capabilityAdmissionDigest).toBe(await policyMessageHash(proof));
        return Response.json({leaseId:'lse_fixturelease',token:'synthetic-token',expiresAt:new Date(proof.expiresAt).toISOString(),maxCalls:1,onlineRequired:true,
          remotePermit:await signPolicyMessage({...proof,authority:'relay',referenceId:'lse_fixturelease',version:2,policyId:'relay-policy',agentRevision:7,
            sourcePermitHash:await policyMessageHash(proof)},{keyId:'fixture-relay',jwk:relay.privateKey.export({format:'jwk'})})});
      }
      const packet=body.args[0],input=JSON.parse(packet.payloadJson);calls.push(body.path);
      if(body.path==='sofieExecutionPermits:readApproved'){
        const {requiredCapabilities:_required,agentRevision:_revision,sourcePermitHash:_hash,...base}=JSON.parse(pair.myeve.message);
        const challenge=parsePolicyMessage({...base,kind:'CHALLENGE',referenceId:randomUUID(),agentId:'agt_fixtureagent',issuedAt:Date.now(),expiresAt:Date.now()+28000,
          actionDigest:await admissionActionDigest({workId:fixture.document.work.id,missionId:fixture.document.missionId,generation:1,
            nativeSnapshot:{permitSha256:permitDigest(fixture.document)},args:{operation:'enterprise.authorizeAdmission',permitId:fixture.document.permitId,
              challenge:input.challenge,commandId:input.admissionCommandId}})});
        return Response.json({status:'success',value:{permit:fixture.signPermit(),capabilityChallenge:await signPolicyMessage(challenge,{keyId:destination.key_id,jwk:receiver.privateKey.export({format:'jwk'})})}});
      }
      expect(body.path).toBe('sofieExecutionPermits:authorizeAdmission');
      return Response.json({status:'success',value:fixture.signReceipt({...fixture.receiptDocument(),commandId:packet.envelope.commandId,
        challenge:input.challenge,policyPairSha256:capabilityPairDigest(input.capabilityPermits),issuedAt:Date.now(),expiresAt:Date.now()+9000})});
    });
    const workStore=new WorkStore({scopeKind:'personal',scopeId:env.owner,actorId:env.owner},database);
    const input={operation:'start',expectedWorkVersion:1,expectedWorkGeneration:1};
    const dependencies={database:env.db,factory,signer:env.signer,env:runtime};
    const effect={sessionId:randomUUID(),callId:randomUUID()};
    const started=await externalAlphaFactoryAction(workStore,fixture.document.work.id,input,effect,dependencies);
    expect(started).toMatchObject({state:'STARTED',authority:'CONSUMED'});
    expect(calls).toEqual(['sofieExecutionPermits:readApproved','relay-prepare','relay','sofieExecutionPermits:authorizeAdmission']);
    expect((await store.forWork(fixture.document.work.id))?.binding.missionId).toBe(fixture.document.missionId);
    expect((await externalAlphaFactoryAction(workStore,fixture.document.work.id,input,effect,dependencies)).state).toBe('ALREADY_CONSUMED');
    expect(calls).toHaveLength(4);expect(factory.posts).toBe(1);
    expect(await env.count('external_alpha_cohort_admission')).toBe(1);
  });
  it('prepares owner approval for only the exact canonical Work without reserving execution',async()=>{
    const e=fixture.enrollment;
    const runtime={NODE_ENV:'test' as const,VERCEL:'1',VERCEL_ENV:'production',VERCEL_PROJECT_ID:env.policy.projectId,
      EVE_PROJECT_NAME:'myeve-alpha-tester-1',MYEVE_OWNER_ID:env.owner,MYEVE_EXTERNAL_ALPHA_POLICY:JSON.stringify(env.policy),
      MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY:generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}).toString(),
      MYEVE_EXTERNAL_ALPHA_POLICY_SHA256:digest(env.policy),MYEVE_MISSIONCONTROL_MODE:'APPROVED_NONPRODUCTION',
      MYEVE_MISSIONCONTROL_URL:e.issuer,MYEVE_MISSIONCONTROL_AUDIENCE:e.audience,MYEVE_MISSIONCONTROL_CONNECTION_ID:e.connectionId,
      MYEVE_MISSIONCONTROL_INSTALLATION_ID:e.installationId,MYEVE_MISSIONCONTROL_SECRET:'synthetic-connection-secret-32-characters'};
    const input={operation:'enterprise.prepare_execution',proposalId:'proposal',workOrderId:fixture.document.workOrderId,
      expectedWorkOrderRevisionId:fixture.document.workOrderRevisionId,expectedPlanDigest:fixture.document.planDigest,idempotencyKey:'prepare-alpha',
      workId:fixture.document.work.id,expectedWorkVersion:1,expectedWorkGeneration:1};
    const workStore=new WorkStore({scopeKind:'personal',scopeId:env.owner,actorId:env.owner},database);
    let sent:unknown;
    const send:typeof fetch=async(_url,request)=>{sent=JSON.parse(String(request?.body));return Response.json({status:'success',value:{requestId:'request',status:'OWNER_APPROVAL_REQUIRED'}});};
    expect(await prepareMissionControlExecution(workStore,input,'prepare-command',runtime,send)).toMatchObject({status:'OWNER_APPROVAL_REQUIRED'});
    expect(JSON.parse((sent as any).args[0].payloadJson)).toMatchObject({work:fixture.document.work,admission:fixture.document.admission});
    await expect(prepareMissionControlExecution(workStore,{...input,expectedWorkGeneration:2},'stale-command',runtime,send)).rejects.toThrow('MISSIONCONTROL_PREPARE_WORK_CHANGED');
    expect(await env.count('external_alpha_cohort_admission')).toBe(0);expect(await env.count('external_alpha_work_authority')).toBe(0);
  });

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
  it('issues, claims and refreshes through the ordinary runtime role without policy-write privileges',async()=>{
    await accept();
    await env.pool.query(`GRANT EXECUTE ON FUNCTION missioncontrol_assert_dispatch(text,uuid,integer,integer,boolean,text),
      missioncontrol_assert_alpha_admission(text,uuid,integer,integer,text,text,text),external_alpha_missioncontrol_work_admit(jsonb),external_alpha_missioncontrol_work_claim(jsonb),external_alpha_work_admit(jsonb),external_alpha_admit(jsonb),external_alpha_work_claim(jsonb),external_alpha_work_finish(jsonb),external_alpha_dispatch_bind(jsonb) TO ${role}`);
    await env.pool.query(`GRANT UPDATE(owner_id) ON external_alpha_policy TO ${role}`);
    await env.pool.query(`GRANT INSERT,UPDATE ON external_alpha_work_authority,external_alpha_allowance TO ${role}`);
    await env.pool.query(`GRANT INSERT ON external_alpha_shared_binding,external_alpha_work_dispatch TO ${role}`);
    const runtime={...database,query:async(sql:string,values?:unknown[])=>database.atomic!(transaction=>transaction.query(sql,values))};
    const authority=new ExternalAlphaWorkAuthority(runtime,env.policy,env.signer);
    const factory=new FakeFactory({myeveKeys:new Map([[env.signer.keyId,env.signer.publicKey]]),policy:env.policy,allowedFiles:files,now:Date.now});
    const config=env.workConfig([{keyId:publicKeyId(factory.receiptKey.publicKey),publicKey:factory.receiptKey.publicKey.export({type:'spki',format:'pem'}) as string}]);
    const controller=new ExternalAlphaWorkController(authority,factory,config,receiptKeys(config),Date.now,
      (record,original)=>store.retainFactoryReadback(record,original));
    const work=await env.store.get(fixture.document.work.id);
    expect((await controller.start(work,undefined,admission())).authority.state).toBe('CONSUMED');
    expect(await controller.refreshReadback(fixture.document.work)).toMatchObject({state:'RUNNING'});
    expect(factory.posts).toBe(1);
    const custody=await database.atomic!(async tx=>{
      await tx.query("SELECT set_config('myeve.missioncontrol_owner',$1,true)",[env.owner]);
      return tx.query('SELECT stage,permit_id,command_id FROM missioncontrol_alpha_admission_bindings ORDER BY stage');
    });
    expect(custody).toEqual(['DISPATCH','ISSUE'].map(stage=>({stage,permit_id:fixture.document.permitId,command_id:fixture.challenge.commandId})));
    await expect(runtime.query("UPDATE missioncontrol_alpha_admission_bindings SET command_id='forged'")).rejects.toThrow('permission denied');
    await expect(runtime.query("INSERT INTO missioncontrol_alpha_admission_bindings SELECT * FROM missioncontrol_alpha_admission_bindings")).rejects.toThrow('permission denied');
    await expect(runtime.query('UPDATE external_alpha_policy SET activated_at=NULL')).rejects.toThrow('permission denied');
    await expect(runtime.query("UPDATE capability_control.owner_state SET preferences='{}'")).rejects.toThrow('permission denied');
    await expect(runtime.query('UPDATE missioncontrol_owner_enrollments SET revision=revision+1')).rejects.toThrow('permission denied');
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
  it('requires the explicit accepted command before reserving any shared money',async()=>{
    await accept();const work=await env.store.get(fixture.document.work.id);
    await expect(env.svc.issue(work,files)).rejects.toThrow('MISSIONCONTROL_EXACT_ADMISSION_REQUIRED');
    await expect(env.svc.issue(work,files,{missionControl:{...admission(),commandId:randomUUID()}})).rejects.toThrow('MISSIONCONTROL_EXACT_ADMISSION_REQUIRED');
    expect(await env.count('external_alpha_cohort_admission')).toBe(0);
    expect(await env.count('external_alpha_work_authority')).toBe(0);
  });
  it('refuses a different permit at claim and the legacy direct claim without the exact command',async()=>{
    await accept();const original=admission(),work=await env.store.get(fixture.document.work.id);
    const authority=await env.svc.issue(work,files,{missionControl:original});
    fixture.document.permitId=randomUUID();fixture.challenge.commandId=randomUUID();await accept();
    await expect(env.svc.claim(authority,admission())).rejects.toThrow('MISSIONCONTROL_ALPHA_PERMIT_CHANGED');
    await expect(env.svc.claim(authority)).rejects.toThrow('MISSIONCONTROL_EXACT_ADMISSION_REQUIRED');
    expect(await env.count('missioncontrol_alpha_admission_bindings')).toBe(1);
    expect(await env.count('external_alpha_cohort_dispatch')).toBe(0);
    expect((await env.svc.claim(authority,original)).claimed).toBe(true);
    expect((await env.svc.claim(authority,original)).claimed).toBe(false);
    expect(await env.count('missioncontrol_alpha_admission_bindings')).toBe(2);
    await expect(env.pool.query("DELETE FROM missioncontrol_alpha_admission_bindings")).rejects.toThrow('MISSIONCONTROL_BINDING_IMMUTABLE');
  });
  it('retains a refreshed command only for the original permit at dispatch',async()=>{
    await accept();const first=admission(),work=await env.store.get(fixture.document.work.id);
    const authority=await env.svc.issue(work,files,{missionControl:first});
    fixture.challenge.commandId=randomUUID();await accept();
    expect((await env.svc.claim(authority,admission())).claimed).toBe(true);
    const rows=(await env.pool.query('SELECT stage,permit_id,command_id FROM missioncontrol_alpha_admission_bindings ORDER BY stage')).rows;
    expect(rows).toEqual([
      {stage:'DISPATCH',permit_id:first.permitId,command_id:fixture.challenge.commandId},
      {stage:'ISSUE',permit_id:first.permitId,command_id:first.commandId},
    ]);
  });
  it('does not replace an explicitly expired command with another current receipt',async()=>{
    await accept();const valid=admission(),expired=fixture.signReceipt({...fixture.receiptDocument(),commandId:randomUUID(),
      issuedAt:Date.now()-20000,expiresAt:Date.now()-10000});
    // Superuser test seed: an already expired historical receipt remains immutable.
    await env.pool.query(`INSERT INTO missioncontrol_admission_receipts
      SELECT owner_id,$2,permit_id,$3,$4,to_timestamp($5::double precision/1000),to_timestamp($6::double precision/1000),
        capability_agent,capability_backend,capability_snapshot_sha256,capability_expires_at,clock_timestamp()
      FROM missioncontrol_admission_receipts WHERE command_id=$1`,
      [valid.commandId,expired.document.commandId,expired,digest(expired),expired.document.issuedAt,expired.document.expiresAt]);
    await expect(env.svc.issue(await env.store.get(fixture.document.work.id),files,{missionControl:{...valid,commandId:expired.document.commandId}}))
      .rejects.toThrow('MISSIONCONTROL_EXACT_ADMISSION_REQUIRED');
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
    const authority=await env.svc.issue(await env.store.get(fixture.document.work.id),files,{missionControl:admission()});
    await env.pool.query("UPDATE capability_control.owner_state SET revision=revision+1,preferences=jsonb_set(preferences,'{enterprise.fleet}','\"DISABLED\"') WHERE owner_id=$1",[env.owner]);
    await expect(env.svc.claim(authority,admission())).rejects.toThrow('MISSIONCONTROL_CAPABILITY_CURRENTNESS_REQUIRED');
    expect((await env.svc.forWork(fixture.document.work.id))?.state).toBe('ISSUED');
    expect(await env.count('external_alpha_cohort_dispatch')).toBe(0);
    // Reservation remains canonical historical accounting; a refusal never refunds it.
    expect(await env.count('external_alpha_cohort_admission')).toBe(1);
  });
  it('serializes a queued revoke before a concurrent canonical dispatch claim',async()=>{
    await accept();
    const authority=await env.svc.issue(await env.store.get(fixture.document.work.id),files,{missionControl:admission()});
    const blocker=await env.pool.connect();
    const waitForLock=async(fragment:string)=>{
      for(let attempt=0;attempt<200;attempt++){
        const rows=(await env.pool.query("SELECT pid FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE $2",[env.name,'%'+fragment+'%'])).rows;
        if(rows.length)return;
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      throw Error('Synthetic lock barrier did not engage');
    };
    let fence:Promise<unknown>|undefined,claim:Promise<unknown>|undefined;
    try{
      await blocker.query('BEGIN');await blocker.query('SELECT id FROM engineering_work WHERE id=$1 FOR UPDATE',[fixture.document.work.id]);
      const control=fixture.signControl();
      fence=store.fence(fixture.document.permitId,control,controlDigest(control.document));
      await waitForLock('SELECT id FROM engineering_work');
      claim=env.svc.claim(authority,admission()).catch(error=>error);
      await waitForLock('external_alpha_missioncontrol_work_claim');
      await blocker.query('COMMIT');await fence;
      expect(await claim).toBeInstanceOf(Error);
      expect(String(await claim)).toContain('MISSIONCONTROL_WORK_FENCED');
      expect((await env.svc.forWork(fixture.document.work.id))?.state).toBe('ISSUED');
      expect(await env.count('external_alpha_cohort_dispatch')).toBe(0);
    }finally{await blocker.query('ROLLBACK');blocker.release();await Promise.allSettled([fence,claim]);}
  },10000);
  it('rejects a capability decision that expires while acceptance waits for the canonical Work lock',async()=>{
    const source=JSON.parse(pair.myeve.message);source.expiresAt=Date.now()+1000;
    pair.myeve.message=JSON.stringify(source);fixture.challenge.policyPairSha256=capabilityPairDigest(pair);
    const blocker=await env.pool.connect();
    let pending:Promise<unknown>|undefined;
    try{
      await blocker.query('BEGIN');await blocker.query('SELECT id FROM engineering_work WHERE id=$1 FOR UPDATE',[fixture.document.work.id]);
      pending=accept().catch(error=>error);
      await blocker.query('SELECT pg_sleep(1.2)');await blocker.query('COMMIT');
      expect(await pending).toBeInstanceOf(Error);
      expect(await env.count('missioncontrol_admission_receipts')).toBe(0);
      expect(await env.count('external_alpha_cohort_admission')).toBe(0);
    }finally{await blocker.query('ROLLBACK');blocker.release();await pending;}
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
    const work=await env.store.get(fixture.document.work.id),started=await controller.start(work,undefined,admission());
    if(!started.sent)throw Error('Expected synthetic Factory dispatch');
    const request={schema:'mc-result-request/v1' as const,connectionId:fixture.enrollment.connectionId,
      installationId:fixture.enrollment.installationId,ownerId:env.owner,projectId:fixture.enrollment.projectId,
      permitId:fixture.document.permitId,commandId:'read-result',challenge:'a'.repeat(64),issuer:fixture.enrollment.issuer,
      audience:fixture.enrollment.audience,issuedAt:Date.now(),expiresAt:Date.now()+30000};
    const running=await missionControlResultReadback(database,request);
    expect(running).toMatchObject({status:'PENDING',missionId:fixture.document.missionId,result:null,
      admission:{authorityId:started.authority.id,requestId:started.authority.requestId}});
    expect(alphaReadback(running).readbackSignature).toBeTruthy();
    factory.state='COMPLETED';factory.quiescent=true;
    factory.resultPayload=buildSignedResult({authority:started.authority,work,workOrderId:started.readback.workOrderId,keys:env.resultKeys,
      opts:{requestDigest:factory.requestDigest(started.authority.requestId)}}).signed;
    await controller.reconcile(work.id,{work});
    const completed=await missionControlResultReadback(database,request);
    expect(completed.status).toBe('SETTLED');
    expect(completed.result).toMatchObject({cleanupConfirmed:true,exposureUnknown:false,settlementState:'SETTLED'});
    expect(completed.result?.proof).toBeTruthy();
    expect(alphaReadback(completed).readbackAttestation.state).toBe('COMPLETED');
    const count=await env.count('missioncontrol_factory_readbacks');
    await controller.refreshReadback(fixture.document.work);
    expect(await env.count('missioncontrol_factory_readbacks')).toBe(count+1);
    await expect(controller.refreshReadback({...fixture.document.work,version:999})).rejects.toThrow('EXTERNAL_ALPHA_READBACK_WORK_CHANGED');
    factory.readbackMutate=value=>{
      value.readbackAttestation.expiresAt=new Date(Date.now()+1000).toISOString();
      value.readbackSignature=sign(null,Buffer.concat([Buffer.from(READBACK_DOMAIN),Buffer.from([0]),Buffer.from(digest(value.readbackAttestation),'ascii')]),factory.receiptKey.privateKey).toString('base64url');
    };
    await controller.refreshReadback(fixture.document.work);
    const brief=await missionControlResultReadback(database,request);
    expect(brief.status).toBe('SETTLED');
    expect(brief.expiresAt).toBe(Date.parse(alphaReadback(brief).readbackAttestation.expiresAt));
    const slow:WorkDatabase={...database,atomic:async action=>database.atomic!(async transaction=>action({
      query:async(sql,values)=>{if(sql.includes('LEFT JOIN LATERAL'))await transaction.query('SELECT pg_sleep(1.1)');return transaction.query(sql,values);},
    }))};
    expect((await missionControlResultReadback(slow,request)).status).toBe('PENDING');
    factory.readbackMutate=null;factory.state='UNKNOWN';factory.quiescent=false;
    factory.ops=[{id:'uncertain',phase:'productive',state:'unknown'}];
    await controller.refreshReadback(fixture.document.work);
    const uncertain=await missionControlResultReadback(database,request);
    expect(uncertain.status).toBe('PENDING');
    expect(uncertain.result?.proof).toBeTruthy();
    expect(alphaReadback(uncertain).readbackAttestation.state).toBe('UNKNOWN');
    expect(factory.posts).toBe(1);
    fixture.document.permitId=randomUUID();fixture.challenge.commandId=randomUUID();await accept();
    const foreignPermit=await missionControlResultReadback(database,{...request,permitId:fixture.document.permitId});
    expect(foreignPermit).toMatchObject({status:'PENDING',admission:null,result:null});
    await expect(missionControlResultReadback(database,{...request,connectionId:'foreign-connection'})).rejects.toThrow('MISSIONCONTROL_RESULT_ACCESS_DENIED');
    await expect(env.pool.query('DELETE FROM missioncontrol_factory_readbacks')).rejects.toThrow('MISSIONCONTROL_BINDING_IMMUTABLE');
  });
  it('commits a denying control before acknowledgment and preserves its history on retry', async () => {
    await accept();const control=fixture.signControl(),digest=controlDigest(control.document);
    const acknowledgments=await Promise.all([store.fence(fixture.document.permitId,control,digest),store.fence(fixture.document.permitId,control,digest)]);
    expect(acknowledgments[0]).toEqual(acknowledgments[1]);
    expect(acknowledgments[0]).toMatchObject({authority:'FENCED',cleanup:'PENDING_BACKEND'});
    expect(await env.count('missioncontrol_permit_controls')).toBe(1);
    await expect(env.svc.issue(await env.store.get(fixture.document.work.id),files,{missionControl:admission()})).rejects.toThrow('MISSIONCONTROL_WORK_FENCED');
    expect(await env.count('external_alpha_cohort_admission')).toBe(0);
    await expect(env.pool.query('DELETE FROM missioncontrol_permit_controls')).rejects.toThrow('MISSIONCONTROL_BINDING_IMMUTABLE');
  });
  it('delivers revocation through canonical stop and ACKs only authenticated cleanup',async()=>{
    await accept();
    const factory=new FakeFactory({myeveKeys:new Map([[env.signer.keyId,env.signer.publicKey]]),policy:env.policy,allowedFiles:files,now:Date.now});
    const config=env.workConfig([{keyId:publicKeyId(factory.receiptKey.publicKey),publicKey:factory.receiptKey.publicKey.export({type:'spki',format:'pem'}) as string}]);
    const controller=new ExternalAlphaWorkController(env.svc,factory,config,receiptKeys(config),Date.now,
      (authority,original)=>store.retainFactoryReadback(authority,original));
    const work=await env.store.get(fixture.document.work.id);await controller.start(work,undefined,admission());
    const control=fixture.signControl(),delivery={status:'CONTROL',control,controlDigest:controlDigest(control.document)};
    const acknowledgments:unknown[]=[];
    const client={readControl:async()=>delivery,acknowledgeControl:async(value:unknown)=>{
      expect(await env.count('missioncontrol_permit_controls')).toBe(1);acknowledgments.push(value);
      return acknowledgmentResponse(value);
    }};
    const workStore=new WorkStore({scopeKind:'personal',scopeId:env.owner,actorId:env.owner},database);
    const out=await pollMissionControlControls(workStore,controller,undefined,client);
    expect(out.checked).toBe(1);
    expect(acknowledgments[0]).toMatchObject({authority:'FENCED',cleanup:'CONFIRMED'});
    expect(factory.posts).toBe(1);expect(factory.stops).toHaveLength(1);
    expect((await env.svc.forWork(work.id))?.state).toBe('CANCELLED');
    await applyMissionControlControl(workStore,controller,delivery,client);
    expect(factory.stops).toHaveLength(1);
  });
  it('disable-new preserves running Work and UNKNOWN never becomes cleanup success',async()=>{
    await accept();
    const factory=new FakeFactory({myeveKeys:new Map([[env.signer.keyId,env.signer.publicKey]]),policy:env.policy,allowedFiles:files,now:Date.now});
    const config=env.workConfig([{keyId:publicKeyId(factory.receiptKey.publicKey),publicKey:factory.receiptKey.publicKey.export({type:'spki',format:'pem'}) as string}]);
    const controller=new ExternalAlphaWorkController(env.svc,factory,config,receiptKeys(config));
    const work=await env.store.get(fixture.document.work.id);await controller.start(work,undefined,admission());
    const control=fixture.signControl({...fixture.controlDocument(),operation:'disable_new'});
    const client={readControl:async()=>({status:'NO_CONTROL'}),acknowledgeControl:async(value:unknown)=>acknowledgmentResponse(value)};
    const workStore=new WorkStore({scopeKind:'personal',scopeId:env.owner,actorId:env.owner},database);
    expect(await applyMissionControlControl(workStore,controller,{status:'CONTROL',control,controlDigest:controlDigest(control.document)},client))
      .toMatchObject({authority:'NEW_ADMISSIONS_DENIED',cleanup:'PENDING_BACKEND'});
    expect(factory.stops).toHaveLength(0);expect((await env.svc.forWork(work.id))?.state).toBe('CONSUMED');
    const authority=(await env.svc.forWork(work.id))!;
    await env.svc.finish(authority.id,'UNKNOWN',{reason:'SYNTHETIC_UNCERTAINTY'});
    const revoke=fixture.signControl({...fixture.controlDocument(),sequence:2});
    expect(await applyMissionControlControl(workStore,controller,{status:'CONTROL',control:revoke,controlDigest:controlDigest(revoke.document)},client))
      .toMatchObject({authority:'FENCED',cleanup:'PENDING_BACKEND'});
    expect((await env.svc.forWork(work.id))?.state).toBe('UNKNOWN');
    expect(await env.count('external_alpha_cohort_admission')).toBe(1);
  });
  it.each(['lost-confirmed-ack','pending-then-terminal'] as const)('recovers %s after execution permit expiry from durable control history',async scenario=>{
    fixture.document.expiresAt=Date.now()+1500;
    await store.accept(fixture.signPermit(),fixture.signReceipt({...fixture.receiptDocument(),expiresAt:fixture.document.expiresAt}),
      fixture.challenge,pair,fixture.document.work.id,env.policy.repository);
    const factory=new FakeFactory({myeveKeys:new Map([[env.signer.keyId,env.signer.publicKey]]),policy:env.policy,allowedFiles:files,now:Date.now});
    const config=env.workConfig([{keyId:publicKeyId(factory.receiptKey.publicKey),publicKey:factory.receiptKey.publicKey.export({type:'spki',format:'pem'}) as string}]);
    const controller=new ExternalAlphaWorkController(env.svc,factory,config,receiptKeys(config));
    const work=await env.store.get(fixture.document.work.id);await controller.start(work,undefined,admission());
    const operation=scenario==='lost-confirmed-ack'?'revoke':'disable_new';
    const control=fixture.signControl({...fixture.controlDocument(),operation});
    const delivery={status:'CONTROL',control,controlDigest:controlDigest(control.document)};
    const workStore=new WorkStore({scopeKind:'personal',scopeId:env.owner,actorId:env.owner},database);
    const client={readControl:async()=>delivery,acknowledgeControl:async(value:unknown)=>{
      if(scenario==='lost-confirmed-ack')throw Error('SYNTHETIC_ACK_CONNECTION_LOSS');
      return acknowledgmentResponse(value);
    }};
    if(scenario==='lost-confirmed-ack')await expect(applyMissionControlControl(workStore,controller,delivery,client)).rejects.toThrow('SYNTHETIC_ACK_CONNECTION_LOSS');
    else expect(await applyMissionControlControl(workStore,controller,delivery,client)).toMatchObject({cleanup:'PENDING_BACKEND'});
    await env.pool.query('SELECT pg_sleep(1.6)');
    if(scenario==='pending-then-terminal')await controller.stop(work.id,{work});
    expect(await new MissionControlBindings(database,env.owner).controlCandidates()).toContain(fixture.document.permitId);
    const stops=factory.stops.length;
    const restartedStore=new WorkStore(workStore.principal,database);
    const recovered=await pollMissionControlControls(restartedStore,controller,undefined,{readControl:async()=>delivery,
      acknowledgeControl:async(value:unknown)=>acknowledgmentResponse(value)});
    expect(recovered).toMatchObject({checked:1,failures:[],outcomes:[{cleanup:'CONFIRMED'}]});
    expect(await store.controlCandidates()).toEqual([]);
    expect(factory.posts).toBe(1);expect(factory.stops).toHaveLength(stops);
    expect(await env.count('external_alpha_cohort_admission')).toBe(1);
    await expect(env.pool.query('DELETE FROM missioncontrol_control_acknowledgments')).rejects.toThrow('MISSIONCONTROL_BINDING_IMMUTABLE');
  });
  it('a failed acknowledgment does not starve a later permit and malformed delivery receipts remain pending',async()=>{
    await accept();const first=fixture.signControl(),firstId=fixture.document.permitId;
    fixture.document.permitId=randomUUID();fixture.challenge.commandId=randomUUID();await accept();const second=fixture.signControl();
    const factory=new FakeFactory({myeveKeys:new Map([[env.signer.keyId,env.signer.publicKey]]),policy:env.policy,allowedFiles:files,now:Date.now});
    const config=env.workConfig([{keyId:publicKeyId(factory.receiptKey.publicKey),publicKey:factory.receiptKey.publicKey.export({type:'spki',format:'pem'}) as string}]);
    const controller=new ExternalAlphaWorkController(env.svc,factory,config,receiptKeys(config));
    const workStore=new WorkStore({scopeKind:'personal',scopeId:env.owner,actorId:env.owner},database);
    const result=await pollMissionControlControls(workStore,controller,undefined,{
      readControl:async permitId=>{const control=permitId===firstId?first:second;return {status:'CONTROL',control,controlDigest:controlDigest(control.document)};},
      acknowledgeControl:async value=>value.permitId===firstId?{}:acknowledgmentResponse(value),
    });
    expect(result.failures).toEqual([firstId]);expect(result.outcomes).toHaveLength(1);
    expect(result.failureCodes).toEqual([{permitId:firstId,code:'CONTROL_RESPONSE_INVALID'}]);
    expect(await env.count('missioncontrol_permit_controls')).toBe(2);
    expect(await env.count('missioncontrol_control_acknowledgments')).toBe(1);
    expect(factory.posts).toBe(0);
  });
  it('prioritizes a fresh revoke over 101 pending controls without starving retries under continuing arrivals',async()=>{
    await accept();
    const factory=new FakeFactory({myeveKeys:new Map([[env.signer.keyId,env.signer.publicKey]]),policy:env.policy,allowedFiles:files,now:Date.now});
    const config=env.workConfig([{keyId:publicKeyId(factory.receiptKey.publicKey),publicKey:factory.receiptKey.publicKey.export({type:'spki',format:'pem'}) as string}]);
    const controller=new ExternalAlphaWorkController(env.svc,factory,config,receiptKeys(config));
    const work=await env.store.get(fixture.document.work.id);await controller.start(work,undefined,admission());
    const authority=(await env.svc.forWork(work.id))!;await env.svc.finish(authority.id,'UNKNOWN',{reason:'SYNTHETIC_UNCERTAINTY'});
    // Old deliveries are unavailable. Their signed fences and UNKNOWN authority
    // stay retained; scheduling observations must not be mistaken for delivery.
    for(let i=0;i<101;i++){
      const document={...fixture.document,permitId:'pending-'+String(i).padStart(3,'0')};
      const envelope=fixture.signPermit(document);
      await env.pool.query(`INSERT INTO missioncontrol_execution_permits(owner_id,permit_id,work_id,work_version,work_generation,permit_sha256,envelope,created_at)
        VALUES($1,$2,$3,1,1,$4,$5,clock_timestamp()-interval '1 minute')`,[env.owner,document.permitId,work.id,permitDigest(document),envelope]);
      const control=fixture.signControl({...fixture.controlDocument(),permitId:document.permitId,permitSha256:permitDigest(document)});
      await env.pool.query(`INSERT INTO missioncontrol_permit_controls(owner_id,permit_id,sequence,operation,control_digest,envelope)
        VALUES($1,$2,1,'revoke',$3,$4)`,[env.owner,document.permitId,controlDigest(control.document),control]);
    }
    const control=fixture.signControl(),delivered:string[]=[],requested:string[]=[];
    const client={readControl:async(permitId:string)=>{
      requested.push(permitId);
      if(permitId.startsWith('fresh-'))return {status:'NO_CONTROL'};
      if(permitId!==fixture.document.permitId)throw Error('SYNTHETIC_TRANSPORT_OUTAGE');
      delivered.push(permitId);return {status:'CONTROL',control,controlDigest:controlDigest(control.document)};
    },acknowledgeControl:async(value:unknown)=>acknowledgmentResponse(value)};
    const principal={scopeKind:'personal' as const,scopeId:env.owner,actorId:env.owner};
    const first=await pollMissionControlControls(new WorkStore(principal,database),controller,undefined,client);
    expect(first.checked).toBe(100);expect(first.pageFull).toBe(true);
    expect(requested[0]).toBe(fixture.document.permitId);expect(delivered).toEqual([fixture.document.permitId]);
    expect(first.outcomes).toMatchObject([{authority:'FENCED',cleanup:'PENDING_BACKEND'}]);
    // Each new poll has more than a page of fresh arrivals. Pending UNKNOWN
    // controls must still rotate through a reserved half-page in durable polls.
    const retried=new Set<string>();
    for(let page=0;page<3;page++){
      for(let i=0;i<101;i++){
        const document={...fixture.document,permitId:`fresh-${page}-${String(i).padStart(3,'0')}`};
        await env.pool.query(`INSERT INTO missioncontrol_execution_permits(owner_id,permit_id,work_id,work_version,work_generation,permit_sha256,envelope)
          VALUES($1,$2,$3,1,1,$4,$5)`,[env.owner,document.permitId,work.id,permitDigest(document),fixture.signPermit(document)]);
      }
      // A previously polled NO_CONTROL permit can acquire a remote revoke.
      // Never-attempted arrivals must not indefinitely outrank its older poll.
      const previouslyPolled=`fresh-${page}-100`;
      await store.recordControlAttempt(previouslyPolled);
      await env.pool.query(`UPDATE missioncontrol_control_attempts SET attempted_at=clock_timestamp()-interval '1 minute'
        WHERE owner_id=$1 AND permit_id=$2`,[env.owner,previouslyPolled]);
      requested.length=0;
      const next=await pollMissionControlControls(new WorkStore(principal,database),controller,undefined,client);
      expect(next.checked).toBe(100);expect(next.pageFull).toBe(true);
      expect(requested.slice(0,50).every(id=>id.startsWith('fresh-'))).toBe(true);
      expect(requested[0]).toBe(previouslyPolled);
      expect(requested.slice(50).every(id=>!id.startsWith('fresh-'))).toBe(true);
      for(const id of requested)if(id.startsWith('pending-'))retried.add(id);
    }
    expect(retried.size).toBe(101);
    expect((await env.svc.forWork(work.id))?.state).toBe('UNKNOWN');
    expect(await env.count('missioncontrol_control_acknowledgments')).toBe(1);
    expect(await env.count('external_alpha_cohort_admission')).toBe(1);expect(factory.posts).toBe(1);
    const foreign=new MissionControlBindings(database,'foreign-owner');
    await expect(foreign.recordControlAttempt(fixture.document.permitId)).rejects.toThrow();
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
