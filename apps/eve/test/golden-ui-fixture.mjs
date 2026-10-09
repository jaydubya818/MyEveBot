// Browser fixture only: real Next routes/auth/SQL/worker; simulated GitHub state, no provider writes.
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Pool,Client} from 'pg';
import {spawn} from 'node:child_process';
import {loadMigrations,runMigrations} from '../scripts/migration-runner.ts';
import {WorkStore} from '../lib/engineering/store.ts';
import {ExecutionStore} from '../lib/engineering/execution-store.ts';
import {RoutingStore} from '../lib/engineering/routing-store.ts';
import {EngineeringWorker} from '../lib/engineering/worker.ts';
import {digest} from '../lib/engineering/contract.ts';
import {nowIso} from '../lib/engineering/execution.ts';
import {syntheticCandidate} from './golden-ui-candidate.mjs';

if(process.env.GOLDEN_UI_FIXTURE!=='1')throw Error('Explicit simulated browser fixture opt-in required');
const liveChat=process.env.GOLDEN_UI_LIVE_CHAT==='1';
if(liveChat&&!process.env.VERCEL_OIDC_TOKEN)throw Error('Live chat fixture requires a fresh VERCEL_OIDC_TOKEN');
if(liveChat){
  let expiresAt;
  try{expiresAt=JSON.parse(Buffer.from(process.env.VERCEL_OIDC_TOKEN.split('.')[1],'base64url').toString()).exp;}
  catch{throw Error('Live chat fixture requires a valid VERCEL_OIDC_TOKEN');}
  if(typeof expiresAt!=='number'||expiresAt*1000<=Date.now()+60_000)throw Error('Live chat fixture requires a non-expired VERCEL_OIDC_TOKEN');
}
const reuse=process.env.GOLDEN_UI_REUSE==='1';
const name='golden_ui',port=3103,sqlPort=3102;
const admin=new Client({connectionString:'postgresql://postgres@127.0.0.1:55468/postgres'});await admin.connect();if(!reuse)await admin.query(`CREATE DATABASE ${name}`);await admin.end();
const pool=new Pool({connectionString:'postgresql://postgres@127.0.0.1:55468/'+name});const client=await pool.connect();
await runMigrations({query:async(q,p)=>(await client.query(q,p)).rows,transaction:async statements=>{await client.query('BEGIN');try{for(const s of statements)await client.query(s.sql,s.params);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}}},await loadMigrations());client.release();
const trace=reuse?null:JSON.parse(await readFile('/private/tmp/myeve-golden-simulation-report.json','utf8')).trace;
const principal={scopeId:'golden-owner',actorId:'golden-owner',scopeKind:'personal'},database={query:async(q,p)=>(await pool.query(q,p)).rows};
const store=new WorkStore(principal,database),execution=new ExecutionStore(store),workers=[];
const ids=reuse?JSON.parse(await readFile('/private/tmp/myeve-golden-ui-ids.json','utf8')):{};
function attachWorker(work,contract,initialHead,initialPr){
  let head=initialHead,pr=initialPr;
  const provider={async observe(){return {observedAt:nowIso(),authority:true,repository:contract.repository,baseSha:contract.baseSha,head,pr,
    reviews:[],checks:head?[{id:'1',name:'quantity-ci',sha:head,attempt:1,result:'PASS',details:'SIMULATED CI for browser fixture'}]:[]};},
    async publish(){throw Error('UI fixture does not publish candidates.');},async snapshot(){throw Error('UI fixture executor unavailable');}};
  workers.push({id:work.id,worker:new EngineeringWorker(execution,provider,{async requestStop(){},async cleanup(){}},{},()=>digest(contract.profile),async()=>true)});
}
if(!reuse){
for(const kind of ['ready','approval']) {
  const {work}=await store.create({title:kind==='ready'?'Golden Work · local result simulation':'Golden Work · verification pending simulation',objective:trace.contract.objective,repository:trace.contract.repository,criteria:trace.contract.criteria,maxCostUsd:5,maxDurationSeconds:3600,idempotencyKey:randomUUID()});ids[kind]=work.id;
  const contract={...trace.contract,workId:work.id,scope:principal,deadline:new Date(Date.now()+3600000).toISOString()};await execution.admit(work,contract);
  const state=await execution.get(work.id);
  const {run,candidate,localChecks}=await syntheticCandidate(contract,state.generation);
  const pr=kind==='ready'?{number:1,url:'https://github.com/fixture/golden/pull/1',draft:true,open:true}:null;
  const head=pr?candidate.sha:null;
  const truth={observedAt:nowIso(),authority:true,repository:contract.repository,baseSha:contract.baseSha,head,pr,
    checks:head?[{id:'1',name:'quantity-ci',sha:head,attempt:1,result:'PASS',details:'SIMULATED CI for browser fixture'}]:[],reviews:[]};
  const results=pr?[{id:randomUUID(),version:1,createdAt:nowIso(),candidate:candidate.sha,
    summary:'Synthetic candidate passed local host checks only. Protected verification and live publication have not run.',
    objective:work.objective,criteria:work.criteria,changes:candidate.changedPaths,why:work.objective,
    verification:localChecks,github:truth,runs:[run],
    limitations:['Browser fixture only: local host checks are not protected evidence; no live GitHub publication, CI, reviewer or coding executor.'],risks:[],interventions:[],
    reservedUsd:0,costCoverage:'No provider cost; browser fixture only',elapsedSeconds:0}]:[];
  Object.assign(state,{qualificationMode:'simulation',phase:'observing',runs:[run],candidates:[candidate],
    evidence:[],approval:null,effects:[],truth,results,addressedReviews:[],reviewChecks:[],
    blockers:['SIMULATED local host checks only. Protected verification and live publication have not run.']});
  await execution.save(await store.get(work.id),state,'browser_fixture_seed');
  attachWorker(work,contract,head,pr);
}
// Advisory router fixture only. No Sofie policy caller, route admission, or provider execution runs here.
const {work:routeWork}=await store.create({
  title:'Routing decision · local UI fixture',
  objective:'Inspect the Execution Router explanation and its Work-version staleness in the local UI.',
  repository:'fixture/golden',
  criteria:[{id:randomUUID(),statement:'Show why the local fixture recommends owner review.',method:'human'}],
  maxCostUsd:1,maxDurationSeconds:120,idempotencyKey:randomUUID(),
});
ids.route=routeWork.id;
await new RoutingStore(store).recordProposal(routeWork.id,{
  expectedWorkVersion:routeWork.version,selectedRoute:'HUMAN',source:'RULE',
  reason:'This local fixture has no qualified coding provider. Owner review is the only safe recommendation.',
  profile:{profileVersion:1,workShape:'bounded UI inspection',decomposition:'single Work',interaction:'owner review',parallelism:'none',verification:'visual',duration:'short',ambiguity:'low',externalExpertise:'none',humanJudgment:'required',risk:'bounded'},
  eligibleRoutes:['HUMAN'],
  rejectedRoutes:[
    {route:'DIRECT',reason:'The fixture does not authorize direct Sofie engineering.'},
    {route:'DEEP_AGENT',reason:'No Deep Agents harness is qualified in this fixture.'},
    {route:'EXECUTOR',reason:'The simulated executor is not admitted for this Work.'},
    {route:'MYFACTORY',reason:'No MyFactory execution adapter is connected.'},
    {route:'RELAY',reason:'No Atlas peer request is qualified in this fixture.'},
  ],
  constraints:['Recommendation only; no execution route has been admitted.','GitHub and executor behavior is simulated.'],
  providerId:null,providerVersion:null,
});
}else{
  for(const kind of ['ready','approval']){
    const work=await store.get(ids[kind]),state=await execution.get(work.id);
    // Reuse the contract pinned in this database. The simulation report may be
    // regenerated between fixture restarts with fresh criterion IDs/profile hash.
    attachWorker(work,state.contract,state.truth?.head??null,state.truth?.pr??null);
  }
}
const neonUrl='postgresql://fixture:isolated@ep-golden.neon.tech/golden_ui';
const sqlServer=createServer(async(req,res)=>{
  if(req.url!=='/sql'||req.method!=='POST'||req.headers['neon-connection-string']!==neonUrl){res.writeHead(403).end();return;}
  const conn=await pool.connect();let transaction=false;
  try{let text='';for await(const chunk of req){text+=chunk;if(text.length>5000000)throw Error('bound');}const input=JSON.parse(text);transaction=!!input.queries;if(transaction)await conn.query('BEGIN');const results=[];
    for(const item of input.queries??[input]){const r=await conn.query({text:item.query,values:item.params,rowMode:'array',types:{getTypeParser:()=>v=>v}});results.push({rows:r.rows,fields:r.fields.map(f=>({name:f.name,dataTypeID:f.dataTypeID})),rowCount:r.rowCount,command:r.command,rowAsArray:true});}
    if(transaction)await conn.query('COMMIT');res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(transaction?{results}:results[0]));
  }catch(e){if(transaction)await conn.query('ROLLBACK');res.writeHead(400,{'content-type':'application/json'}).end(JSON.stringify({message:e.message,code:e.code}));}finally{conn.release();}
});await new Promise(resolve=>sqlServer.listen(sqlPort,'127.0.0.1',resolve));
const preload='/private/tmp/myeve-golden-private/ui-preload.mjs';
await writeFile(preload,`const original=globalThis.fetch;globalThis.fetch=(input,init)=>{const headers=new Headers(init?.headers);if(headers.get('neon-connection-string')===${JSON.stringify(neonUrl)})return original('http://127.0.0.1:${sqlPort}/sql',init);return original(input,init);};`);
await writeFile('/private/tmp/myeve-golden-ui-ids.json',JSON.stringify(ids));
const next=spawn(process.execPath,['../../node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{
  cwd:new URL('..',import.meta.url).pathname,stdio:'inherit',env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',MYEVE_ENGINEERING_MODE:'dogfood',MYEVE_OWNER_ID:principal.scopeId,
    MYEVE_ACCESS_PASSWORD:'golden-ui-qualification',MYEVE_SESSION_SECRET:'golden-fixture-session-secret-not-production-2026',DATABASE_URL:neonUrl,NODE_OPTIONS:`--import ${preload}`,
    NEXT_PUBLIC_GOLDEN_UI_MODE:liveChat?'live-chat':'ui-only',
    ...(liveChat?{VERCEL_OIDC_TOKEN:process.env.VERCEL_OIDC_TOKEN}:{})}});
let busy=false;const timer=setInterval(async()=>{if(busy)return;busy=true;try{for(const {id,worker} of workers)await worker.tick(id);}finally{busy=false;}},2000);
console.log('SIMULATED Golden Work browser fixture',JSON.stringify({url:`http://localhost:${port}/work`,chat:liveChat?'live model connection enabled':'unavailable',ids}));
process.on('SIGTERM',()=>{clearInterval(timer);next.kill('SIGTERM');sqlServer.close(()=>void pool.end());});
