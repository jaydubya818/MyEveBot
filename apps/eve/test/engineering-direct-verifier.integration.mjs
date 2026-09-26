import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {Client,Pool} from "pg";
import {loadMigrations,runMigrations} from "../scripts/migration-runner.ts";
import {manifestForSnapshot} from "../lib/engineering/base-preflight.ts";
import {digest,profileSchema} from "../lib/engineering/contract.ts";
import {DirectDevelopmentStore} from "../lib/engineering/direct-development.ts";
import {DirectVerificationDriver} from "../lib/engineering/direct-verification-driver.ts";
import {RouteAdmissionService} from "../lib/engineering/route-admission.ts";
import {RoutingStore} from "../lib/engineering/routing-store.ts";
import {WorkStore} from "../lib/engineering/store.ts";

const url=new URL(process.env.ENGINEERING_TEST_ADMIN_URL??"postgresql://postgres@127.0.0.1:55468/postgres");
assert.equal(url.hostname,"127.0.0.1");
assert(["55468","55469"].includes(url.port));
assert.equal(url.pathname,"/postgres");
const admin=new Client({connectionString:url.href});
await admin.connect();
const name=`direct_verifier_${randomBytes(8).toString("hex")}`;
let pool;
try {
  await admin.query(`CREATE DATABASE ${name}`);
  url.pathname=`/${name}`;
  pool=new Pool({connectionString:url.href});
  const client=await pool.connect();
  try {
    await runMigrations({query:async(sql,params)=>(await client.query(sql,params)).rows,
      transaction:async statements=>{
        await client.query("BEGIN");
        try {for(const statement of statements)await client.query(statement.sql,statement.params);
          await client.query("COMMIT");}
        catch(error){await client.query("ROLLBACK");throw error;}
      }},await loadMigrations());
  } finally {client.release();}

  const database={query:async(sql,params)=>(await pool.query(sql,params)).rows};
  const owner="verifier-owner",agentId="sofie-primary";
  const scope={kind:"personal",id:owner};
  const principal={scopeId:owner,scopeKind:"personal",actorId:owner};
  const workStore=new WorkStore(principal,database);
  const criterion={id:randomUUID(),statement:"Positive integer prints",method:"test"};
  const objective="Implement a bounded quantity parser.";
  const source={sha:"a".repeat(40),files:{"README.md":"Parser fixture\n"}};
  const profile=profileSchema.parse({id:"native-verifier",version:1,repository:"fixture/parser",
    privateQualification:true,baseBranch:"main",allowedPaths:["quantity.mjs"],
    checks:[{id:"positive",program:"quantity.mjs",input:"1\n",expectedOutput:"1\n",
      expectedExitCode:0,criterionIds:[criterion.id]}],requiredCI:["quantity-ci"],
    reviewerLogins:["owner"],policyVersion:1,executor:"claude-code",
    image:`node@sha256:${"b".repeat(64)}`,maxRuns:3,maxModelRequests:5,maxOutputTokens:1024});
  const config={profile,approvedBase:manifestForSnapshot(source),objective,
    criteria:[criterion],agentId,issueNumber:1};
  const direct=new DirectDevelopmentStore(workStore,config);
  const {work:created}=await workStore.create({title:"Parser",objective,
    repository:profile.repository,criteria:[criterion],maxCostUsd:2,
    maxDurationSeconds:300,idempotencyKey:randomUUID()});
  const work=await workStore.change(created.id,{operation:"resume",expectedVersion:created.version});
  const routingProfile={profileVersion:1,workShape:"bounded edit",decomposition:"single task",
    interaction:"none",parallelism:"none",verification:"deterministic",duration:"short",
    ambiguity:"low",externalExpertise:"none",humanJudgment:"none",risk:"low"};
  const provider={id:"native-sofie",version:1};
  const operations=["deep-agent.start","repository.read","sandbox.write","candidate.create","verification.request"];
  const resourceRefs=[`repository:${profile.repository}`,
    `engineering-profile:sha256:${digest({profile,approvedBase:config.approvedBase})}`];
  const proposal=await new RoutingStore(workStore).recordProposal(work.id,{
    expectedWorkVersion:work.version,selectedRoute:"DEEP_AGENT",reason:"Bounded native edit",
    source:"RULE",profile:routingProfile,eligibleRoutes:["DEEP_AGENT","HUMAN"],
    rejectedRoutes:[],constraints:[],providerId:provider.id,providerVersion:String(provider.version)});
  const authority={read:async current=>{
    const now=Date.now();
    const contract={contractVersion:2,workId:current.id,workVersion:current.version,
      criteriaVersion:current.criteriaVersion,scope,humanOwnerId:owner,coordinatingAgentId:agentId,
      objective:current.objective,criteria:current.criteria.map(item=>({id:item.id,statement:item.statement,evidence:"deterministic"})),
      resourceRefs,allowedOperations:operations,budgetUsd:2,deadline:new Date(now+180_000).toISOString(),
      policyVersion:1,composition:{role:{id:"software-engineer",version:1},capabilityPacks:[],mode:{id:"normal",version:1}},
      definitionOfDone:["Protected checks pass"],allowedRoutes:["DEEP_AGENT"],routingProfile,
      routePolicy:{id:"personal-native-harness",version:1}};
    const context={contractVersion:2,workId:current.id,workVersion:current.version,scope,agentId,
      assembledAt:new Date(now).toISOString(),maxTokens:500,estimatedTokens:50,items:[]};
    const qualification={provider,scope,status:"QUALIFIED",health:"HEALTHY",
      evidenceRef:"qualification:native-v1",observedAt:new Date(now).toISOString(),
      expiresAt:new Date(now+180_000).toISOString()};
    const facts={currentWorkVersion:current.version,currentCriteriaVersion:current.criteriaVersion,
      currentPolicyVersion:1,workActive:true,scope,agentId,authority:"ALLOW",remainingBudgetUsd:2,
      allowedRoutes:["DEEP_AGENT"],allowedOperations:operations,allowedResourceRefs:resourceRefs,
      routePolicy:{id:"personal-native-harness",version:1,allowedRoutes:["DEEP_AGENT"],
        providers:{DIRECT:null,DEEP_AGENT:provider,EXECUTOR:null,MYFACTORY:null,RELAY:null}},
      qualifications:{DIRECT:null,DEEP_AGENT:qualification,EXECUTOR:null,MYFACTORY:null,RELAY:null},
      writerState:"NONE",factoryAdmission:"UNKNOWN",relayGrant:"UNKNOWN",peerPolicy:"UNKNOWN",
      observedAt:new Date(now).toISOString()};
    return {contract,context,facts};
  }};
  await new RouteAdmissionService(workStore,authority).admit(work.id,{
    decisionId:proposal.id,expectedWorkVersion:work.version,
    request:{route:"DEEP_AGENT",requiredOperations:operations,resourceRefs}});
  const opened=await direct.open(work.id,source);
  const planned=await direct.plan(work.id,opened.revision,"Implement and submit for protected check.");
  const written=await direct.write(work.id,planned.revision,"quantity.mjs","process.stdout.write('1\\n');\n");
  const submitted=await direct.submit(work.id,written.revision);
  const candidate=submitted.candidate;
  const evidenceFor=frozen=>{
    const artifact=JSON.stringify({exitCode:0,stdout:"1\n",stderr:""});
    return [{id:randomUUID(),workId:work.id,candidate:frozen.sha,base:source.sha,
      criteriaVersion:work.criteriaVersion,profileHash:digest(profile),environment:profile.image,
      check:"positive",producer:"protected-supervisor",attemptId:frozen.attemptId,
      observedAt:new Date().toISOString(),result:"PASS",artifact,artifactHash:digest(artifact)}];
  };

  let releaseCheck,startedCheck;
  const started=new Promise(resolve=>{startedCheck=resolve;});
  const hold=new Promise(resolve=>{releaseCheck=resolve;});
  let calls=0;
  const blockedVerifier={verify:async(_contract,frozen)=>{calls++;startedCheck();await hold;return evidenceFor(frozen);}};
  const firstDriver=new DirectVerificationDriver(direct,blockedVerifier);
  const firstRun=firstDriver.run(work.id);
  await started;
  const otherDriver=new DirectVerificationDriver(new DirectDevelopmentStore(new WorkStore(principal,database),config),
    {verify:async()=>{calls++;return [];}});
  assert.equal((await otherDriver.run(work.id)).status,"RUNNING");
  assert.equal(calls,1);
  await pool.query(`UPDATE engineering_direct_verification_jobs
    SET lease_until=clock_timestamp()-interval '1 second' WHERE work_id=$1`,[work.id]);
  assert.equal((await otherDriver.run(work.id)).status,"RECOVERY_REQUIRED");
  releaseCheck();
  await assert.rejects(firstRun,/lease|fenced/);
  assert.equal((await direct.inspect(work.id)).workspace.phase,"VERIFICATION_REQUESTED");
  assert.equal((await direct.inspect(work.id)).workspace.evidence.length,0);
  await assert.rejects(otherDriver.retryAfterResourceCheck(work.id,candidate.sha,
    {resourcesAbsent:async()=>false}),/resources remain/);
  assert.equal((await otherDriver.inspectJob(work.id,candidate.sha)).status,"RECOVERY_REQUIRED");

  const resumed=new DirectVerificationDriver(new DirectDevelopmentStore(new WorkStore(principal,database),config),
    {verify:async(_contract,frozen)=>{calls++;return evidenceFor(frozen);}});
  assert.equal((await resumed.retryAfterResourceCheck(work.id,candidate.sha,
    {resourcesAbsent:async()=>true})).status,"QUEUED");
  assert.equal((await resumed.run(work.id)).status,"COMPLETED");
  assert.equal(calls,2);
  assert.equal((await direct.inspect(work.id)).workspace.phase,"VERIFICATION_PASSED");
  assert.equal((await direct.inspect(work.id)).workspace.evidence.length,1);
  const completed=await resumed.inspectJob(work.id,candidate.sha);
  assert.equal(completed.attempt,2);
  assert.equal(completed.evidenceCount,1);

  // Crash after evidence custody but before job completion: a fresh worker
  // observes the bound evidence and completes the job without rerunning checks.
  await pool.query(`UPDATE engineering_direct_verification_jobs
    SET status='RUNNING',lease_token=$2,lease_until=clock_timestamp()-interval '1 second'
    WHERE work_id=$1`,[work.id,randomUUID()]);
  const recovered=await otherDriver.run(work.id);
  assert.equal(recovered.status,"COMPLETED");
  assert.equal(calls,2);
  console.log("M1 protected verifier driver: one claimant, expired-lease fence, explicit clean retry, exact evidence, restart reconciliation passed");
} finally {
  await pool?.end();
  url.pathname="/postgres";
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}
