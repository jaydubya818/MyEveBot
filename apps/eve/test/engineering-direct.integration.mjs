import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Client, Pool } from "pg";
import { loadMigrations, runMigrations } from "../scripts/migration-runner.ts";
import { manifestForSnapshot } from "../lib/engineering/base-preflight.ts";
import { digest, profileSchema } from "../lib/engineering/contract.ts";
import { DirectDevelopmentStore } from "../lib/engineering/direct-development.ts";
import { RouteAdmissionService } from "../lib/engineering/route-admission.ts";
import { RoutingStore } from "../lib/engineering/routing-store.ts";
import { WorkStore } from "../lib/engineering/store.ts";

const url=new URL(process.env.ENGINEERING_TEST_ADMIN_URL??"postgresql://postgres@127.0.0.1:55468/postgres");
assert.equal(url.hostname,"127.0.0.1");
assert(["55468","55469"].includes(url.port));
assert.equal(url.pathname,"/postgres");
const admin=new Client({connectionString:url.href});
await admin.connect();
const name=`direct_work_${randomBytes(8).toString("hex")}`;
let pool;
try {
  await admin.query(`CREATE DATABASE ${name}`);
  url.pathname=`/${name}`;
  pool=new Pool({connectionString:url.href});
  const migrationClient=await pool.connect();
  try {
    await runMigrations({
      query:async(sql,params)=>(await migrationClient.query(sql,params)).rows,
      transaction:async statements=>{
        await migrationClient.query("BEGIN");
        try { for(const statement of statements)await migrationClient.query(statement.sql,statement.params);
          await migrationClient.query("COMMIT"); }
        catch(error){await migrationClient.query("ROLLBACK");throw error;}
      },
    },await loadMigrations());
  } finally { migrationClient.release(); }

  const database={query:async(sql,params)=>(await pool.query(sql,params)).rows};
  const owner="direct-owner";
  const principal={scopeId:owner,scopeKind:"personal",actorId:owner};
  const workStore=new WorkStore(principal,database);
  const criterion={id:randomUUID(),statement:"Positive integer quantities are parsed",method:"test"};
  const objective="Implement a small quantity parser.";
  const source={sha:"a".repeat(40),files:{
    ".github/workflows/quantity-ci.yml":"name: quantity-ci\n",
    "README.md":"A bounded parser fixture.\n",
  }};
  const profile=profileSchema.parse({id:"direct-fixture",version:1,repository:"fixture/parser",
    privateQualification:true,baseBranch:"main",allowedPaths:["quantity.mjs"],
    checks:[{id:"positive",program:"quantity.mjs",input:"1\n",expectedOutput:"1\n",
      expectedExitCode:0,criterionIds:[criterion.id]}],requiredCI:["quantity-ci"],
    reviewerLogins:["owner"],policyVersion:1,executor:"claude-code",
    image:`node@sha256:${"b".repeat(64)}`,maxRuns:3,maxModelRequests:5,maxOutputTokens:1024});
  const config={profile,approvedBase:manifestForSnapshot(source),objective,criteria:[criterion],
    agentId:"sofie-primary",issueNumber:1};
  const direct=new DirectDevelopmentStore(workStore,config);
  const {work:created}=await workStore.create({title:"Quantity parser",objective,repository:profile.repository,
    criteria:[criterion],maxCostUsd:2,maxDurationSeconds:300,idempotencyKey:randomUUID()});
  const work=await workStore.change(created.id,{operation:"resume",expectedVersion:created.version});

  await assert.rejects(direct.open(work.id,source),/admitted DEEP_AGENT route/);
  assert.equal((await direct.inspect(work.id)).workspace,null);
  const routingProfile={profileVersion:1,workShape:"bounded edit",decomposition:"single task",
    interaction:"none",parallelism:"none",verification:"deterministic",duration:"short",
    ambiguity:"low",externalExpertise:"none",humanJudgment:"none",risk:"low"};
  const provider={id:"native-sofie",version:1};
  const operations=["deep-agent.start","repository.read","sandbox.write","candidate.create","verification.request"];
  const resourceRefs=[`repository:${profile.repository}`,
    `engineering-profile:sha256:${digest({profile,approvedBase:config.approvedBase})}`];
  const proposal=await new RoutingStore(workStore).recordProposal(work.id,{
    expectedWorkVersion:work.version,selectedRoute:"DEEP_AGENT",reason:"Bounded native edit",
    source:"RULE",profile:routingProfile,eligibleRoutes:["DEEP_AGENT","HUMAN"],rejectedRoutes:[],
    constraints:[],providerId:provider.id,providerVersion:String(provider.version),
  });
  const authority={read:async current=>{
    const now=Date.now(),scope={kind:"personal",id:owner};
    const contract={contractVersion:2,workId:current.id,workVersion:current.version,
      criteriaVersion:current.criteriaVersion,scope,humanOwnerId:owner,
      coordinatingAgentId:config.agentId,objective:current.objective,
      criteria:current.criteria.map(item=>({id:item.id,statement:item.statement,evidence:"deterministic"})),
      resourceRefs,allowedOperations:operations,budgetUsd:2,
      deadline:new Date(now+180_000).toISOString(),policyVersion:1,
      composition:{role:{id:"software-engineer",version:1},capabilityPacks:[],mode:{id:"normal",version:1}},
      definitionOfDone:["Protected checks pass"],allowedRoutes:["DEEP_AGENT"],
      routingProfile,routePolicy:{id:"personal-native-harness",version:1}};
    const context={contractVersion:2,workId:current.id,workVersion:current.version,scope,
      agentId:config.agentId,assembledAt:new Date(now).toISOString(),maxTokens:500,
      estimatedTokens:50,items:[]};
    const qualification={provider,scope,status:"QUALIFIED",health:"HEALTHY",
      evidenceRef:"qualification:direct-v1",observedAt:new Date(now).toISOString(),
      expiresAt:new Date(now+180_000).toISOString()};
    const facts={currentWorkVersion:current.version,currentCriteriaVersion:current.criteriaVersion,
      currentPolicyVersion:1,workActive:true,scope,agentId:config.agentId,
      authority:"ALLOW",remainingBudgetUsd:2,allowedRoutes:["DEEP_AGENT"],
      allowedOperations:operations,allowedResourceRefs:resourceRefs,
      routePolicy:{id:"personal-native-harness",version:1,allowedRoutes:["DEEP_AGENT"],
        providers:{DIRECT:null,DEEP_AGENT:provider,EXECUTOR:null,MYFACTORY:null,RELAY:null}},
      qualifications:{DIRECT:null,DEEP_AGENT:qualification,EXECUTOR:null,MYFACTORY:null,RELAY:null},
      writerState:"NONE",factoryAdmission:"UNKNOWN",relayGrant:"UNKNOWN",peerPolicy:"UNKNOWN",
      observedAt:new Date(now).toISOString()};
    return {contract,context,facts};
  }};
  const admission=await new RouteAdmissionService(workStore,authority).admit(work.id,{
    decisionId:proposal.id,expectedWorkVersion:work.version,
    request:{route:"DEEP_AGENT",requiredOperations:operations,resourceRefs}});
  assert.equal(admission.status,"QUEUED");
  await assert.rejects(new DirectDevelopmentStore(workStore,{
    ...config,profile:{...profile,allowedPaths:["different.mjs"]},
  }).requireAdmission(work.id),/does not authorize/);

  const competingOpens=await Promise.allSettled([
    direct.open(work.id,source),direct.open(work.id,source),
  ]);
  assert.equal(competingOpens.filter(result=>result.status==="fulfilled").length,1);
  assert.equal(competingOpens.filter(result=>result.status==="rejected").length,1);
  const opened=competingOpens.find(result=>result.status==="fulfilled").value;
  assert.equal(opened.phase,"DRAFT");
  assert.equal(opened.routeRunId,admission.runId);
  assert.deepEqual(Object.keys(opened.sourceFiles).sort(),Object.keys(source.files).sort());
  assert.equal((await direct.read(work.id,"README.md")).content,source.files["README.md"]);
  await assert.rejects(direct.open(work.id,source),/already has a writer/);
  await assert.rejects(direct.write(work.id,opened.revision,"README.md","changed"),/approved source path/);
  await assert.rejects(direct.write(work.id,opened.revision,".github/workflows/quantity-ci.yml","changed"),/bounded source path|approved source path/);
  await assert.rejects(direct.write(work.id,opened.revision,"quantity.mjs","-----BEGIN PRIVATE KEY-----"),/credential/);

  const planned=await direct.plan(work.id,opened.revision,"Read README, implement parser, submit for independent verification.");
  const write=await direct.write(work.id,planned.revision,"quantity.mjs","process.stdout.write('1\\n');\n");
  await assert.rejects(direct.write(work.id,planned.revision,"quantity.mjs","stale"),/changed/);
  const {candidate,workspace:submitted}=await direct.submit(work.id,write.revision);
  assert.equal(submitted.phase,"VERIFICATION_REQUESTED");
  assert.deepEqual(candidate.changedPaths,["quantity.mjs"]);
  assert.equal(candidate.files["README.md"],source.files["README.md"]);
  assert.equal((await new DirectDevelopmentStore(new WorkStore(principal,database),config).inspect(work.id))
    .workspace.candidates[0].sha,candidate.sha);
  await assert.rejects(new DirectDevelopmentStore(new WorkStore({scopeId:"other",scopeKind:"personal",actorId:"other"},database),config)
    .inspect(work.id),/not found/);

  const evidenceFor=(frozen,result)=>{
    const artifact=JSON.stringify({exitCode:result==="PASS"?0:1,stdout:result==="PASS"?"1\n":"",stderr:""});
    return [{id:randomUUID(),workId:work.id,candidate:frozen.sha,base:source.sha,
      criteriaVersion:work.criteriaVersion,profileHash:digest(profile),environment:profile.image,
      check:"positive",producer:"protected-supervisor",attemptId:frozen.attemptId,
      observedAt:new Date().toISOString(),result,artifact,artifactHash:digest(artifact)}];
  };
  await pool.query("UPDATE engineering_route_runs SET status='BLOCKED' WHERE id=$1",[opened.routeRunId]);
  let verifierCalled=false;
  await assert.rejects(direct.verifyRequested(work.id,{verify:async()=>{verifierCalled=true;return [];}}),
    /current admitted DEEP_AGENT route/);
  assert.equal(verifierCalled,false);
  await pool.query("UPDATE engineering_route_runs SET status='RUNNING' WHERE id=$1",[opened.routeRunId]);
  await assert.rejects(direct.verifyRequested(work.id,{verify:async(_contract,frozen)=>
    evidenceFor(frozen,"PASS").map(item=>({...item,candidate:"c".repeat(40)}))}),/did not bind/);
  assert.equal((await direct.inspect(work.id)).workspace.phase,"VERIFICATION_REQUESTED");
  const failed=await direct.verifyRequested(work.id,{verify:async(_contract,frozen)=>evidenceFor(frozen,"FAIL")});
  assert.equal(failed.workspace.phase,"VERIFICATION_FAILED");
  const fixed=await direct.write(work.id,failed.workspace.revision,"quantity.mjs",
    "const text=require('fs').readFileSync(0,'utf8').trim();process.stdout.write(text+'\\n');\n");
  const replacement=await direct.submit(work.id,fixed.revision);
  assert.notEqual(replacement.candidate.sha,candidate.sha);
  const passed=await direct.verifyRequested(work.id,{verify:async(_contract,frozen)=>evidenceFor(frozen,"PASS")});
  assert.equal(passed.workspace.phase,"VERIFICATION_PASSED");
  assert.equal(passed.workspace.evidence[0].candidate,candidate.sha);
  assert.equal(passed.workspace.evidence[1].candidate,replacement.candidate.sha);
  assert.equal((await new RoutingStore(workStore).snapshot(work.id)).runs[0].status,"RUNNING");

  await workStore.change(work.id,{operation:"pause",expectedVersion:work.version});
  assert.equal((await direct.inspect(work.id)).current,false);
  await assert.rejects(direct.plan(work.id,passed.workspace.revision,"No more work"),/changed/);
  console.log("M1 direct: admitted native writer, path/revision fences, durable candidate, independent exact evidence, owner and control isolation passed");
} finally {
  await pool?.end();
  url.pathname="/postgres";
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}
