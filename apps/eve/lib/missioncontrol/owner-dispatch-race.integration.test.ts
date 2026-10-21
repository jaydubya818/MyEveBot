import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {capabilityRegistry} from '@mission-control/capability-control';
import {Env,connection,files} from '../external-alpha/work-test-fixture.ts';
import {alphaTasksTupleSha256} from '../external-alpha/work-tuple.ts';
import {WorkStore,type WorkDatabase} from '../engineering/store.ts';
import {FactoryWriterStore,type FactoryExecutionIdentity,type FactoryQuiescence} from '../engineering/factory-writer.ts';
import {prepareAuthenticatedFactoryInput} from '../engineering/factory-authenticated-result.ts';
import {digest} from '../engineering/contract.ts';
import {readJourneyAccounting} from '../engineering/journey-accounting.ts';
import {legacyWorkSpendSchema} from '../engineering/factory-spend.ts';
import {MissionControlBindings} from './permit-store.ts';
import {permitFixture} from './permit-test-fixture.ts';
import {capabilityPairDigest,type CapabilityPair} from './installed-client.ts';
import {controlDigest} from './execution-permit.ts';
import {prepareOwnerFactoryOrigin} from './owner-factory-binding.ts';
import {factoryExecutionConfigurationHash} from '../engineering/factory-configuration-hash.ts';
import {ownerResultFixtureConfig} from './owner-result-test-fixture.ts';
import {applyOwnerFactoryControl} from './owner-control-runtime.ts';

// Disposable PostgreSQL only. Real writer claim, signed revoke, and handoff SQL;
// transport and provider accounting observations are controlled fixtures.
describe.skipIf(!connection)('PostgreSQL owner dispatch/revoke race', () => {
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
  const accept=()=>store.accept(fixture.signPermit(),fixture.signReceipt(),fixture.challenge,pair,fixture.document.work.id,env.policy.repository);
  const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};};

  for(const outcome of ['response','lost-response','stopped-response'] as const)it(`retains UNKNOWN when revoke commits during transport: ${outcome}`,async()=>{
    const x=await ownerRoute();await accept();await x.insert();
    const writers=new FactoryWriterStore(env.store),run=await writers.inspect(x.work.id,x.runId);
    const original=await writers.identity(run),entered=deferred(),release=deferred();
    let sends=0,stops=0;let observed:FactoryQuiescence|null=null;
    const transport={dispatch:async(identity:FactoryExecutionIdentity)=>{
      expect(identity).toEqual(original);sends++;entered.resolve();await release.promise;
      if(outcome==='lost-response')throw Error('INJECTED_LOST_RESPONSE');
    },stop:async(identity:FactoryExecutionIdentity)=>{expect(identity).toEqual(original);stops++;},observe:async()=>observed};
    const pending=writers.dispatch(run,transport).then(value=>({value,error:null}),error=>({value:null,error}));
    await entered.promise;
    const claimed=await writers.inspect(x.work.id,x.runId);
    expect(claimed.dispatch_state).toBe('UNKNOWN');
    expect((claimed as any).dispatch_claimed_at).toBeTruthy();
    const spend=legacyWorkSpendSchema.parse({status:'UNKNOWN',currency:'USD',unit:'microUSD',workId:x.work.id,workGeneration:1,
      requestId:x.binding.requestId,workOrderId:x.binding.workOrderId,deadline:original.deadline,ceilingMicrousd:1300000,
      settledMicrousd:0,retainedMicrousd:50000,availableMicrousd:1250000,cancelled:false,operations:[{
        operationId:'controlled-dispatched-call',workId:x.work.id,workGeneration:1,dispatchIdentity:original.dispatchIdentity,
        requestId:x.binding.requestId,workOrderId:x.binding.workOrderId,factoryVersion:x.binding.factoryVersion,runId:x.binding.runId,
        model:'controlled-no-provider',pricingRevision:'controlled-no-pricing',reservedMicrousd:50000,actualMicrousd:null,
        providerRequestId:null,usage:null,state:'unknown'}]});
    await env.pool.query('UPDATE engineering_routing_decisions SET factory_observation=$2 WHERE id=$1',
      [x.decisionId,{value:{state:'UNKNOWN',identity:original,spend},backendObservedAt:new Date().toISOString()}]);
    const revoke=fixture.signControl(),controlHash=controlDigest(revoke.document);
    await store.fence(fixture.document.permitId,revoke,controlHash);
    if(outcome==='stopped-response')await writers.stop(run,transport,'cancel');
    release.resolve();const result=await pending;
    if(outcome==='stopped-response')expect(result.error).toBeNull();
    else expect(result.error?.message).toContain(outcome==='response'?'MISSIONCONTROL_WORK_FENCED':'INJECTED_LOST_RESPONSE');
    const pendingState=outcome==='stopped-response'?'STOPPING':'UNKNOWN';
    expect((await writers.inspect(x.work.id,x.runId)).dispatch_state).toBe(pendingState);
    expect(await writers.identity(run)).toEqual(original);
    expect((await writers.dispatch(run,transport)).dispatched).toBe(false);
    expect(sends).toBe(1);
    await writers.reconcile(run,transport);
    expect((await writers.inspect(x.work.id,x.runId)).dispatch_state).toBe(pendingState);
    expect(await readJourneyAccounting(env.store,x.work.id)).toMatchObject({coverage:'UNSETTLED',reservedMicrousd:50000,unknownExposureMicrousd:50000});

    const client={readControl:async()=>({status:'CONTROL',control:revoke,controlDigest:controlHash}),acknowledgeControl:async(value:any)=>({
      permitId:value.permitId,sequence:value.sequence,authority:value.authority,cleanup:value.cleanup,accounting:'UNCHANGED'})};
    const driver={store:env.store,stopRun:async()=>{await writers.stop(run,transport,'cancel');await writers.reconcile(run,transport);}};
    const ack=await applyOwnerFactoryControl(x.workStore,driver,{status:'CONTROL',control:revoke,controlDigest:controlHash},client);
    expect(ack).toMatchObject({authority:'FENCED',cleanup:'PENDING_BACKEND'});
    expect(stops).toBe(outcome==='stopped-response'?2:1);
    expect((await writers.inspect(x.work.id,x.runId)).dispatch_state).toBe('STOPPING');
    expect((await writers.inspect(x.work.id,x.runId)) as any).toMatchObject({quiescence:null});
    expect((await writers.dispatch(run,transport)).dispatched).toBe(false);
    expect(sends).toBe(1);

    observed={...original,requestId:randomUUID(),state:'CANCELLED',quiescent:true,evidenceRef:'controlled-authenticated-terminal'};
    await expect(writers.reconcile(run,transport)).rejects.toThrow('another writer or scope');
    observed={...original,state:'CANCELLED',quiescent:true,evidenceRef:'controlled-authenticated-terminal'};
    await writers.reconcile(run,transport);
    expect((await writers.inspect(x.work.id,x.runId)).dispatch_state).toBe('TERMINAL');
    // Even exact resource quiescence does not reconcile provider charges.
    expect(await readJourneyAccounting(env.store,x.work.id)).toMatchObject({coverage:'UNSETTLED',reservedMicrousd:50000,unknownExposureMicrousd:50000});
    expect((await applyOwnerFactoryControl(x.workStore,driver,{status:'CONTROL',control:revoke,controlDigest:controlHash},client)).cleanup).toBe('PENDING_BACKEND');
    expect((await env.pool.query('SELECT binding FROM engineering_factory_requests WHERE id=$1',[x.requestId])).rows[0].binding).toEqual(x.binding);
    expect(await env.count('engineering_route_runs')).toBe(1);
    expect(await env.count('engineering_factory_requests')).toBe(1);
    expect((await env.pool.query('SELECT factory_observation FROM engineering_routing_decisions WHERE id=$1',[x.decisionId])).rows[0].factory_observation.value.spend).toEqual(spend);
  },30000);

  it('denies dispatch before transport when revoke wins the claim ordering',async()=>{
    const x=await ownerRoute();await accept();await x.insert();
    const writers=new FactoryWriterStore(env.store),run=await writers.inspect(x.work.id,x.runId),dispatch=vi.fn();
    const revoke=fixture.signControl();await store.fence(fixture.document.permitId,revoke,controlDigest(revoke.document));
    await expect(writers.dispatch(run,{dispatch,stop:async()=>{},observe:async()=>null})).rejects.toThrow('MISSIONCONTROL_WORK_FENCED');
    expect(dispatch).not.toHaveBeenCalled();
    expect((await writers.inspect(x.work.id,x.runId)).dispatch_state).toBe('PREPARED');
  });
});
