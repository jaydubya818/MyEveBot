import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import pg from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {capabilityRegistry} from '@mission-control/capability-control';
import {Env,connection,files} from '../external-alpha/work-test-fixture.ts';
import {alphaTasksTupleSha256} from '../external-alpha/work-tuple.ts';
import {WorkStore,type WorkDatabase} from '../engineering/store.ts';
import {prepareAuthenticatedFactoryInput} from '../engineering/factory-authenticated-result.ts';
import {digest} from '../engineering/contract.ts';
import {runtimeSchema} from '../engineering/runtime.ts';
import {factoryRuntimeSchema} from '../engineering/factory-routing.ts';
import {RouteAdmissionService} from '../engineering/route-admission.ts';
import {ENGINEERING_COMPOSITION_V1} from '../digital-worker/packs.ts';
import {MissionControlBindings} from './permit-store.ts';
import {permitFixture} from './permit-test-fixture.ts';
import {capabilityPairDigest,type CapabilityPair} from './installed-client.ts';
import {controlDigest} from './execution-permit.ts';
import {prepareOwnerFactoryOrigin} from './owner-factory-binding.ts';
import {factoryExecutionConfigurationHash} from '../engineering/factory-configuration-hash.ts';
import {ownerResultFixtureConfig,retainOwnerResultFixture} from './owner-result-test-fixture.ts';
import {ensureConfiguredLocalApps,closeLocalAppsBootstrap} from '../myapps/local-bootstrap.ts';
import {handleInstalledApps,consumeInstalledAppResponse} from '../myapps/hosting.ts';
import {digest as appDigest} from '../../../../packages/myapps/src/alpha-tasks/contracts.ts';
import {createWebSessionToken,WEB_SESSION_COOKIE} from '../web-auth.ts';
import installedApps from '../../agent/tools/installed_apps.ts';
// Public inert app source, executed only in the existing network-denied local Docker adapter.
// @ts-ignore Existing public Node fixture.
import {fixture as appProfileFixture} from '../../../../packages/myapps/test/alpha-tasks/fixtures.mjs';

// Keep the actual persistent-agent queries and policies, substituting only Neon HTTP
// with the ordinary-role localhost PostgreSQL transport in this disposable test.
const sqlTransport=vi.hoisted(()=>({query:undefined as undefined|((sql:string,args?:unknown[])=>Promise<unknown>)}));
vi.mock('../../agent/lib/receipts-db.ts',()=>({db:()=>({query:(sql:string,args?:unknown[])=>{
  if(!sqlTransport.query)throw Error('Fixture transport not ready');return sqlTransport.query(sql,args);
}})}));
const enabled=Boolean(connection&&process.env.MYAPPS_ALPHA_DOCKER_TEST==='1'),run=promisify(execFile);

/** Independently reconstruct the public closure's raw root tree for the signed producer artifact. */
function rawTree(files:{path:string;mode:string;base64:string}[],prefix=''):Buffer {
  const names=[...new Set(files.filter(f=>f.path.startsWith(prefix)).map(f=>f.path.slice(prefix.length).split('/')[0]))];
  const entries=names.map(name=>{const path=prefix+name,dir=files.some(f=>f.path.startsWith(path+'/'));
    const file=files.find(f=>f.path===path),bytes=dir?rawTree(files,path+'/'):Buffer.from(file!.base64,'base64'),kind=dir?'tree':'blob';
    return {name,dir,mode:dir?'40000':file!.mode,id:createHash('sha1').update(`${kind} ${bytes.length}\0`).update(bytes).digest()};});
  entries.sort((a,b)=>Buffer.compare(Buffer.from(a.name+(a.dir?'/':'')),Buffer.from(b.name+(b.dir?'/':''))));
  return Buffer.concat(entries.map(e=>Buffer.concat([Buffer.from(e.mode+' '+e.name+'\0'),e.id])));
}

describe.skipIf(!enabled)('registered local owner signed-Result MyApps journey (isolated PostgreSQL and Docker)',()=>{
  let sourceRoot:string,rolePassword:string,runtimePool:pg.Pool;
  let env: Env, database: WorkDatabase, store: MissionControlBindings, fixture: ReturnType<typeof permitFixture>, pair: CapabilityPair, role: string;
  beforeAll(async () => {
    env = await Env.create();sourceRoot=await mkdtemp(join(tmpdir(),'owner-app-journey-'));rolePassword=randomUUID();
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
    database.query=async(sql,values)=>database.atomic!(async tx=>{
      await tx.query("SELECT set_config('myeve.missioncontrol_owner',$1,true)",[env.owner]);
      return tx.query(sql,values);
    });
    const work = await env.seedWork();
    fixture = permitFixture({ ownerId: env.owner, workId: work.id, workVersion: work.version,
      workGeneration: work.generation, tupleSha256: alphaTasksTupleSha256, maxCostMicrousd: 1300000, maxDurationSeconds: 180 });
    fixture.enrollment.factoryVersion = fixture.document.admission.factoryVersion = env.policy.factoryVersion;
    const e = fixture.enrollment;
    await env.pool.query('INSERT INTO missioncontrol_owner_enrollments(owner_id,installation_id,revision,document) VALUES($1,$2,$3,$4)',
      [env.owner, e.installationId, e.revision, e]);
    for (const name of ['migration','enforcement','decisions','ordering','lifecycle'])
      await env.pool.query(await readFile(new URL('../../../../docs/capability-control/'+name+'.sql',import.meta.url),'utf8'));
    await env.pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    await env.pool.query(`GRANT USAGE ON SCHEMA public,capability_control TO ${role}`);
    await env.pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public,capability_control TO ${role}`);
    await env.pool.query(`GRANT UPDATE ON engineering_work TO ${role}`);
    await env.pool.query(`GRANT INSERT,UPDATE ON missioncontrol_control_attempts TO ${role}`);
    await env.pool.query(`GRANT INSERT ON missioncontrol_work_bindings,missioncontrol_execution_permits,missioncontrol_admission_receipts,missioncontrol_permit_controls,missioncontrol_factory_readbacks,missioncontrol_control_acknowledgments TO ${role}`);
    await env.pool.query(`GRANT EXECUTE ON FUNCTION capability_control.lock_admission_policy(text,text,text),missioncontrol_capability_snapshot(text,text,text,text),missioncontrol_enrollment_document(text) TO ${role}`);
    await env.pool.query(`GRANT EXECUTE ON FUNCTION missioncontrol_assert_dispatch(text,uuid,integer,integer,boolean,text),
      missioncontrol_assert_alpha_admission(text,uuid,integer,integer,text,text,text) TO ${role}`);
    await env.pool.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
    const tables=(await env.pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'myapps_%' OR tablename LIKE 'inbox_attention_%')")).rows;
    for(const {tablename} of tables)await env.pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ${tablename} TO ${role}`);
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
  afterAll(async () => {
    await closeLocalAppsBootstrap();await runtimePool?.end();vi.unstubAllGlobals();vi.unstubAllEnvs();if(sourceRoot)await rm(sourceRoot,{recursive:true,force:true});
    await env?.close();
    if (role) { const client=await import('pg').then(pg=>new pg.default.Pool({connectionString:connection}));
      try { await client.query('DROP ROLE IF EXISTS '+role); } finally { await client.end(); } }
  });
  async function ownerFixture() {
    const work=await env.store.get(fixture.document.work.id);
    const original=ownerResultFixtureConfig(work,env.resultKeys);
    const engineering=runtimeSchema.parse({mode:'production-cloud',ownerId:env.owner,agentId:'fixture-agent',
      objective:work.objective,criteria:work.criteria,profile:original.engineering.profile,
      approvedBase:{sha:'1'.repeat(40),files:[{path:'fixture.txt',sha256:'a'.repeat(64)}]},model:'none'});
    const factory=factoryRuntimeSchema.parse({routing:original.routing,commands:original.commands,
      connection:{...original.connection,origin:'http://127.0.0.1:1',token:'e'.repeat(64),repositoryPath:sourceRoot}});
    const config={engineering,...factory};
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
  async function ownerRoute() {
    const x=await ownerFixture(),requestId=randomUUID(),decisionId=randomUUID(),runId=randomUUID();
    const deadline=new Date(Date.now()+60000).toISOString(),binding=prepareAuthenticatedFactoryInput({factoryId:x.config.connection.factoryId,agentId:'fixture-agent',workId:x.work.id,workVersion:1,workGeneration:1,criteriaVersion:1,
      factoryVersion:x.config.connection.factoryVersion,sourceDigest:x.config.connection.sourceDigest,configurationDigest:x.config.connection.configurationDigest,
      inputCommit:'1'.repeat(40),requestId:randomUUID(),requestDigest:'3'.repeat(64),workOrderId:randomUUID(),runId:randomUUID(),attemptNumber:1});
    await env.pool.query(`INSERT INTO engineering_factory_requests(id,scope_id,scope_kind,work_id,actor_id,agent_id,factory_id,operation_id,binding)
      VALUES($1,$2,'personal',$3,$2,'fixture-agent',$6,$4,$5)`,[requestId,env.owner,x.work.id,binding.operationId,binding,binding.factoryId]);
    const snapshot={contract:{deadline},factory:{requestId,repository:x.work.repository,baseSha:binding.inputCommit,
      profileHash:x.config.connection.qualification.profileHash,allowedPaths:files,deadline}};
    await env.pool.query(`INSERT INTO engineering_routing_decisions(id,scope_id,scope_kind,work_id,work_version,selected_route,reason,source,profile,
      eligible_routes,rejected_routes,constraints,provider_id,provider_version,actor_id,admission_authority_snapshot,factory_preparation)
      VALUES($1,$2,'personal',$3,1,'MYFACTORY','synthetic','POLICY','{}','[]','[]','[]',$7,$4,$2,$5,$6)`,
      [decisionId,env.owner,x.work.id,binding.factoryVersion,snapshot,{configurationHash:factoryExecutionConfigurationHash(x.config),request:{workId:x.work.id,workGeneration:1,repository:x.work.repository,requestId:binding.requestId,deadline}},binding.factoryId]);
    return {...x,runId,decisionId,requestId,binding};
  }
  async function canonicalOwnerRoute(){
    const x=await ownerRoute(),scope={kind:'personal',id:env.owner},provider={id:x.binding.factoryId,version:x.binding.factoryVersion};
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
      return {contract,context,facts,factory:{requestId:x.requestId,repository:x.work.repository,baseSha:x.binding.inputCommit,
        profileHash:x.config.connection.qualification.profileHash,allowedPaths:files,deadline}};
    }},proof);
    return {x,admit:()=>service.admit(x.work.id,{decisionId:x.decisionId,expectedWorkVersion:1,expectedWorkGeneration:1,
      request:{route:'MYFACTORY',requiredOperations:['factory.submit'],resourceRefs:contract.resourceRefs}})};
  }
  it('keeps the same Mission through source intake, human installation, Sofie use, restart and current-policy denials',async()=>{
    const {x,admit}=await canonicalOwnerRoute(),admitted=await admit(),profile=appProfileFixture();
    const tree=rawTree(profile.closure.files);
    expect(createHash('sha1').update(`tree ${tree.length}\0`).update(tree).digest('hex')).toBe(profile.closure.tree);
    // Gate C verifies original signed bytes; only producer execution and terminal custody
    // are seeded. No provider, protected installation or installed FactoryVersion is used.
    const retained=await retainOwnerResultFixture({store:new WorkStore(x.workStore.principal,env.db),config:x.config,
      keys:env.resultKeys,work:x.work,binding:x.binding,requestId:x.requestId,runId:admitted.runId,decisionId:x.decisionId,rawTree:tree});
    expect(retained.manifest.candidate!.tree).toBe(profile.closure.tree);
    await writeFile(join(sourceRoot,profile.closure.tree+'.json'),JSON.stringify(profile.closure),{mode:0o600});
    const {engineering,...factory}=x.config;
    await writeFile(join(sourceRoot,'engineering.json'),JSON.stringify(engineering),{mode:0o600});
    await writeFile(join(sourceRoot,'factory.json'),JSON.stringify(factory),{mode:0o600});
    const url=new URL(connection!);url.pathname='/'+env.name;url.username=role;url.password=rolePassword;
    const registration={version:1,kind:'OWNER_FACTORY',ownerId:env.owner,installationId:fixture.enrollment.installationId,
      agentId:'fixture-agent',runtimeId:'synthetic-owner-host',target:'private-tasks',sourceRoot,runtime:profile.runtime};
    const localEnv:NodeJS.ProcessEnv={PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test',VERCEL:'',VERCEL_ENV:'',
      MYAPPS_LOCAL_INTEGRATION:'1',MYAPPS_LOCAL_REGISTRATION:JSON.stringify(registration),MYAPPS_LOCAL_REGISTRATION_SHA256:appDigest(registration),
      MYEVE_OWNER_ID:env.owner,MYEVE_MISSIONCONTROL_MODE:'APPROVED_NONPRODUCTION',MYEVE_CAPABILITY_CONTROL_ENABLED:'true',
      MYEVE_CAPABILITY_INSTALLATION_ID:registration.installationId,MYEVE_CAPABILITY_ENVIRONMENT:'qualification',
      MYEVE_CAPABILITY_ORIGIN:'http://localhost:3999',DATABASE_URL:url.href,MYEVE_CAPABILITY_DATABASE_URL:url.href,
      MYEVE_ACCESS_PASSWORD:randomUUID(),MYEVE_SESSION_SECRET:randomUUID()+randomUUID(),MYEVE_ENGINEERING_MODE:'dogfood',
      MYEVE_ENGINEERING_CONFIG:join(sourceRoot,'engineering.json'),MYEVE_FACTORY_CONFIG:join(sourceRoot,'factory.json')};
    for(const [key,value] of Object.entries(localEnv))vi.stubEnv(key,value);
    runtimePool=new pg.Pool({connectionString:url.href});
    sqlTransport.query=async(sql,args)=>(await runtimePool.query(sql,args)).rows;
    expect((await runtimePool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows)
      .toEqual([{rolsuper:false,rolbypassrls:false}]);
    const cookie=WEB_SESSION_COOKIE+'='+createWebSessionToken();
    const web=async(body:unknown,headers:Record<string,string>={cookie})=>{
      const response=await handleInstalledApps(new Request('http://localhost:3999/api/myapps/alpha',{method:'POST',
        headers:{origin:'http://localhost:3999','content-type':'application/json',...headers},body:JSON.stringify(body)}));
      return {status:response.status,body:await response.json()};
    };
    expect((await web({operation:'catalog'},{})).status).toBe(401);
    expect((await web({operation:'catalog'},{cookie,'x-myeve-browser-owner':'foreign'})).status).toBe(401);
    // First web call initializes the actual registration. No bindLocalApps call is made by the test.
    expect((await web({operation:'catalog'})).body).toEqual({apps:[]});
    const bootstrap=ensureConfiguredLocalApps()!;
    const prepared=await bootstrap.prepareResult(retained.receiptId,1),appId=prepared.appId;
    expect(prepared.installation).toBe('OWNER_DECISION_REQUIRED');
    const catalog=(await web({operation:'catalog'})).body.apps;
    expect(catalog).toHaveLength(1);expect(catalog[0].installedVersion).toBeNull();
    const preview=await web({operation:'preview',appId,version:1});expect(preview.status).toBe(200);
    expect(preview.body.previewId).toEqual(expect.any(String));
    const request=await web({operation:'requestInstall',appId,previewId:preview.body.previewId});expect(request.status).toBe(200);
    const item=request.body;
    const response=await bootstrap.alphaTasks.inbox(env.owner).respond({itemId:item.id,actionId:item.actionId,
      actionBinding:item.binding,expectedRevision:item.revision,idempotencyKey:randomUUID(),answer:'Install privately'});
    const consumed=await consumeInstalledAppResponse(response);expect(consumed).toMatchObject({status:'accepted'});
    const duplicate=await consumeInstalledAppResponse(response);expect(duplicate).toEqual(consumed);
    const installed=(await web({operation:'catalog'})).body.apps[0];
    expect(installed).toMatchObject({appId,installedVersion:1,installedDigest:prepared.packageDigest});
    const saved=(await env.pool.query('SELECT package FROM myapps_candidates WHERE owner_id=$1 AND app_id=$2',[env.owner,appId])).rows[0].package;
    expect(saved.origin).toMatchObject({missionId:fixture.document.missionId,workOrderId:fixture.document.workOrderId,
      resultId:retained.receiptId,nativeResultId:retained.native.id,proofHash:retained.native.contentHash,
      candidateTree:profile.closure.tree,routeRunId:admitted.runId});
    expect(await env.count('external_alpha_work_authority')).toBe(0);

    const threadId='owner-app-thread-'+randomUUID();
    await env.pool.query("INSERT INTO web_chat_threads(id,owner_id,title,updated_at,agent_id) VALUES($1,$2,'Same Mission app',1,'fixture-agent')",[threadId,env.owner]);
    const caller={principalId:env.owner,principalType:'user',attributes:{owner:'true',myeveAgentId:'fixture-agent',webThreadId:threadId}};
    const ctx:any={session:{id:randomUUID(),auth:{current:caller,initiator:caller},parent:null}};
    // Real authored eve resolver/execute callbacks and persistent agent queries; no model call.
    const discover=()=>installedApps.events['step.started']!({} as never,ctx) as Promise<any>;
    const tool=await discover();expect(tool).toBeTruthy();expect(tool.availableInSubagents).toBe(false);
    const args=(operation:string,input:unknown={})=>({profile:'alpha-tasks',operation,appId,version:1,digest:prepared.packageDigest,input,requestId:randomUUID()});
    expect(tool.inputSchema.safeParse(args('decideInstall')).success).toBe(false);
    const createdArgs=args('create',{title:'Same Mission task',priority:'Low'});
    const created=await tool.execute(createdArgs,ctx);expect(created.result.status).toBe('COMPLETED');
    expect(await tool.execute(createdArgs,ctx)).toEqual(created);
    const updated=await tool.execute(args('update',{id:1,patch:{priority:'High'}}),ctx);
    expect(updated.result.status).toBe('COMPLETED');
    const expected=[{id:1,title:'Same Mission task',done:false,priority:'High'}];
    expect((await tool.execute(args('list'),ctx)).result.output).toEqual(expected);
    await env.pool.query("UPDATE agents SET is_primary=false WHERE owner_id=$1",[env.owner]);
    expect(await discover()).toBeNull();await expect(tool.execute(args('list'),ctx)).rejects.toThrow();
    await env.pool.query("UPDATE agents SET is_primary=true WHERE owner_id=$1",[env.owner]);
    const foreignCtx={session:{...ctx.session,auth:{current:{...caller,principalId:'foreign'},initiator:{...caller,principalId:'foreign'}}}};
    expect(await installedApps.events['step.started']!({} as never,foreignCtx as any)).toBeNull();

    // Cold OS process: no prior singleton, manual binding, factoryConfig spy or synthetic authentication bypass.
    const {stdout}=await run(process.execPath,['--import','tsx','--input-type=module','-e',`
      import {handleInstalledApps} from './apps/eve/lib/myapps/hosting.ts';
      import {closeLocalAppsBootstrap} from './apps/eve/lib/myapps/local-bootstrap.ts';
      import {createWebSessionToken,WEB_SESSION_COOKIE} from './apps/eve/lib/web-auth.ts';
      const call=async body=>{const r=await handleInstalledApps(new Request('http://localhost:3999/api/myapps/alpha',{
        method:'POST',headers:{origin:'http://localhost:3999','content-type':'application/json',cookie:WEB_SESSION_COOKIE+'='+createWebSessionToken()},body:JSON.stringify(body)}));
        if(r.status!==200)throw Error('Cold request denied: '+await r.text());return r.json();};
      try{const catalog=await call({operation:'catalog'}),app=catalog.apps[0];
        const listed=await call({operation:'list',appId:app.appId,version:app.installedVersion,digest:app.installedDigest,requestKey:'cold-read'});
        process.stdout.write(JSON.stringify({catalog,listed}));
      }finally{await closeLocalAppsBootstrap();}
    `],{cwd:resolve('.'),env:localEnv,maxBuffer:20000,timeout:60000});
    const cold=JSON.parse(stdout);expect(cold.catalog.apps[0]).toMatchObject({appId,installedVersion:1,installedDigest:prepared.packageDigest});
    expect(cold.listed.output).toEqual(expected);
    const resumedTool=await discover();expect(resumedTool).toBeTruthy();
    expect((await resumedTool.execute(args('list'),ctx)).result.output).toEqual(expected);
    expect((await env.pool.query('SELECT owner_id,agent_id FROM web_chat_threads WHERE id=$1',[threadId])).rows)
      .toEqual([{owner_id:env.owner,agent_id:'fixture-agent'}]);
    const stateBefore=(await env.pool.query('SELECT state FROM myapps_installations WHERE owner_id=$1',[env.owner])).rows[0].state;
    await env.pool.query("UPDATE capability_control.owner_state SET preferences=jsonb_set(preferences,'{myapps}','\"DISABLED\"') WHERE owner_id=$1",[env.owner]);
    await expect(tool.execute(args('create',{title:'Denied',priority:'Low'}),ctx)).rejects.toThrow('POLICY_BLOCKED:myapps');
    expect((await env.pool.query('SELECT state FROM myapps_installations WHERE owner_id=$1',[env.owner])).rows[0].state).toEqual(stateBefore);
    await env.pool.query("UPDATE capability_control.owner_state SET preferences=jsonb_set(preferences,'{myapps}','\"ENABLED\"') WHERE owner_id=$1",[env.owner]);
    expect((await tool.execute(args('list'),ctx)).result.output).toEqual(expected);
    const observation=structuredClone(retained.observation),spend=observation.value.spend;
    Object.assign(spend,{status:'UNKNOWN',accountingComplete:false,retainedMicrousd:1000,availableMicrousd:1299000,
      productiveAllowanceRemainingMicrousd:1298000,unknownExposureMicrousd:1000,paidOperationsUsed:1,operations:[{
        operationId:randomUUID(),workId:x.work.id,workGeneration:1,dispatchIdentity:observation.value.identity.dispatchIdentity,
        requestId:x.binding.requestId,workOrderId:x.binding.workOrderId,factoryVersion:x.binding.factoryVersion,runId:x.binding.runId,
        model:'synthetic',pricingRevision:spend.pricingRevision,reservedMicrousd:1000,actualMicrousd:null,providerRequestId:null,usage:null,state:'unknown',phase:'productive'}]});
    await env.pool.query('UPDATE engineering_routing_decisions SET factory_observation=$2 WHERE id=$1',[x.decisionId,observation]);
    await expect(tool.execute(args('list'),ctx)).rejects.toThrow('APP_EVIDENCE_PENDING');
    const exposure=(await env.pool.query('SELECT factory_observation FROM engineering_routing_decisions WHERE id=$1',[x.decisionId])).rows[0].factory_observation;
    expect(exposure.value.spend.unknownExposureMicrousd).toBe(1000);
    const revoke=fixture.signControl();await store.fence(fixture.document.permitId,revoke,controlDigest(revoke.document));
    await expect(tool.execute(args('list'),ctx)).rejects.toThrow('APP_MISSION_BINDING');
    expect((await env.pool.query('SELECT state FROM myapps_installations WHERE owner_id=$1',[env.owner])).rows[0].state).toEqual(stateBefore);
    expect((await env.pool.query('SELECT factory_observation FROM engineering_routing_decisions WHERE id=$1',[x.decisionId])).rows[0].factory_observation).toEqual(exposure);
    expect((await env.pool.query('SELECT content_hash FROM engineering_native_results WHERE id=$1',[retained.native.id])).rows[0].content_hash).toBe(retained.native.contentHash);
  },120000);
});
