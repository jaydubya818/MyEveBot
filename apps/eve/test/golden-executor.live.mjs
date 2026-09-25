import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomUUID,randomBytes} from 'node:crypto';
import {Pool,Client} from 'pg';
import {gateway} from 'ai';
import {fixture} from './engineering-fixtures.ts';
import {loadMigrations,runMigrations} from '../scripts/migration-runner.ts';
import {WorkStore} from '../lib/engineering/store.ts';
import {ExecutionStore} from '../lib/engineering/execution-store.ts';
import {makeContract} from '../lib/engineering/contract.ts';
import {queueRun} from '../lib/engineering/execution.ts';
import {DockerClaudeExecutor,DockerProtectedVerifier,docker} from '../lib/engineering/docker-executor.ts';
import {brokerMessage} from '../lib/engineering/model-broker.ts';

assert.equal(process.env.GOLDEN_LIVE_EXECUTOR,'1','Explicit live executor opt-in required');
const auth=parseEnv(await readFile('/private/tmp/myeve-golden-private/development.env','utf8')).VERCEL_OIDC_TOKEN;
assert.ok(auth);process.env.VERCEL_OIDC_TOKEN=auth;
const catalog=await gateway.getAvailableModels(),pricing=catalog.models.find(m=>m.id==='anthropic/claude-sonnet-5')?.pricing;
assert.ok(pricing,'Exact model pricing is required');
const rates={maxInputRate:Math.max(...[pricing.input,pricing.cachedInputTokens??pricing.input,pricing.cacheCreationInputTokens??pricing.input].map(Number)),outputRate:Number(pricing.output)};
const admin=new Client({connectionString:'postgresql://postgres@127.0.0.1:55468/postgres'});await admin.connect();
const name=`golden_live_${randomBytes(8).toString('hex')}`,secret=randomBytes(32).toString('hex');let pool,server,run,executor;
const report={classification:'LIVE Claude Code 2.1.282 / Gateway model; REAL isolated Docker and PostgreSQL; no GitHub publication',status:'FAIL',requests:[],pricing:rates};
try {
  await admin.query(`CREATE DATABASE ${name}`);pool=new Pool({connectionString:`postgresql://postgres@127.0.0.1:55468/${name}`});const client=await pool.connect();
  await runMigrations({query:async(q,p)=>(await client.query(q,p)).rows,transaction:async statements=>{await client.query('BEGIN');try{for(const s of statements)await client.query(s.sql,s.params);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}}},await loadMigrations());client.release();
  const f=fixture(),principal={scopeId:f.work.scopeId,scopeKind:'personal',actorId:f.work.scopeId},store=new WorkStore(principal,{query:async(q,p)=>(await pool.query(q,p)).rows}),execution=new ExecutionStore(store);
  const {work:prepared}=await store.create({title:f.work.title,objective:f.work.objective,repository:f.work.repository,criteria:f.work.criteria,maxCostUsd:8,maxDurationSeconds:900,idempotencyKey:randomUUID()});
  const contract=makeContract(prepared,principal,f.profile,{number:1,url:f.contract.issueUrl,body:'Read stdin as a quantity. Print exactly one JSON line: {"quantity":n} for positive integer n, otherwise {"error":"invalid_quantity"}. Exit 0. Only edit quantity.mjs.'},f.contract.baseSha,'sofie');
  await execution.admit(prepared,contract);const work=await store.get(prepared.id),state=await execution.get(work.id);run=queueRun(state,work,'Implement issue',contract.baseSha);run.status='running';await execution.save(work,state,'live_executor_admitted');
  server=createServer(async(req,res)=>{try {
    if(req.url!=='/broker/'+work.id+'/'+run.attemptId||req.method!=='POST'){res.writeHead(403).end();return;}
    let body='';for await(const chunk of req){body+=chunk;if(body.length>180000)throw Error('bound');}
    const response=await brokerMessage({store:execution,workId:work.id,attemptId:run.attemptId,token:String(req.headers.authorization??'').replace(/^Bearer /,''),secret,body,model:'claude-sonnet-5',...rates,
      upstream:request=>fetch('https://ai-gateway.vercel.sh/v1/messages',{method:'POST',headers:{authorization:'Bearer '+auth,'content-type':'application/json','anthropic-version':'2023-06-01'},body:request,signal:AbortSignal.timeout(90000)})});
    report.requests.push({status:response.status,inputBytes:body.length});res.writeHead(response.status,{'content-type':response.headers.get('content-type')});res.end(Buffer.from(await response.arrayBuffer()));
  }catch(e){report.requests.push({error:e.message});res.writeHead(403,{'content-type':'application/json'}).end(JSON.stringify({type:'error',error:{type:'permission_error',message:e.message}}));}});
  await new Promise(resolve=>server.listen(3101,'0.0.0.0',resolve));
  executor=new DockerClaudeExecutor({brokerPort:3101,brokerSecret:secret,model:'claude-sonnet-5'});
  const snapshot={sha:contract.baseSha,files:{'quantity.mjs':'// Implement bounded quantity normalization here.\n'}};
  await executor.start(contract,run,snapshot);
  const isolation=await docker(['exec',run.resource,'node','-e',`console.log(JSON.stringify({credentials:Object.keys(process.env).filter(k=>/GITHUB|VERCEL|DATABASE|OPENAI|PRODUCTION/.test(k)),uid:process.getuid()}));try{await fetch('https://example.com',{signal:AbortSignal.timeout(2000)});process.exit(2)}catch{}`]);
  report.isolation={code:isolation.code,output:isolation.out};assert.equal(isolation.code,0);assert.match(isolation.out,/'credentials':\[\]|"credentials":\[\]/);
  let status='running';for(let i=0;i<100&&status==='running';i++){await new Promise(r=>setTimeout(r,1000));status=await executor.observe(run);}
  if(status!=='completed'){const logs=await docker(['logs',run.resource]);report.executorOutput=logs.out.slice(-8000);throw Error('Executor did not complete: '+status);}
  const candidate=await executor.collectCandidate(contract,run,snapshot);state.candidates.push(candidate);run.status='candidate';run.candidate=candidate.sha;state.phase='verifying';await execution.save(await store.get(work.id),state,'candidate_retained');
  await executor.cleanup(run);const restored=await execution.get(work.id);assert.equal(restored.candidates[0].sha,candidate.sha);
  const evidence=await new DockerProtectedVerifier().verify(contract,candidate);assert.ok(evidence.every(e=>e.result==='PASS'));
  state.evidence.push(...evidence);
  const firstRun=structuredClone(run);
  run=queueRun(state,work,'Manual same-executor replacement qualification: add the source comment "MyEve supervised candidate" to quantity.mjs, preserving all behavior.',candidate.sha);
  run.status='running';await execution.save(work,state,'manual_executor_replacement');
  await executor.start(contract,run,{sha:candidate.sha,files:candidate.files});
  status='running';for(let i=0;i<100&&status==='running';i++){await new Promise(r=>setTimeout(r,1000));status=await executor.observe(run);}
  if(status!=='completed'){const logs=await docker(['logs',run.resource]);report.executorOutput=logs.out.slice(-8000);throw Error('Replacement executor did not complete: '+status);}
  const replacement=await executor.collectCandidate(contract,run,{sha:candidate.sha,files:candidate.files});assert.notEqual(replacement.sha,candidate.sha);
  state.candidates.push(replacement);run.status='candidate';run.candidate=replacement.sha;state.phase='verifying';await execution.save(work,state,'replacement_candidate_retained');await executor.cleanup(run);
  const replacementEvidence=await new DockerProtectedVerifier().verify(contract,replacement);assert.ok(replacementEvidence.every(e=>e.result==='PASS'));
  assert.equal((await execution.get(work.id)).candidates.length,2);
  report.status='PASS';report.workId=work.id;report.runs=[firstRun,run];report.candidates=[candidate,replacement].map(({files,...value})=>value);report.evidence=[...evidence,...replacementEvidence];report.budget={reservedUsd:(await execution.get(work.id)).reservedUsd,coverage:'Conservative model reservations; infrastructure excluded'};
  console.log(JSON.stringify({status:report.status,classification:report.classification,workId:work.id,candidate:candidate.sha,requests:report.requests.length,budget:report.budget},null,2));
}catch(e){report.error=e.message;throw e;}finally{
  if(executor&&run)try{await executor.cleanup(run);report.cleanup='PASS';}catch(e){report.cleanup=e.message;}
  if(server)await new Promise(resolve=>server.close(resolve));
  await writeFile('/private/tmp/myeve-golden-executor-live-report.json',JSON.stringify(report,null,2));
  if(pool)await pool.end();await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);await admin.end();
}
