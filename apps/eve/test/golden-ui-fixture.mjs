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

if(process.env.GOLDEN_UI_FIXTURE!=='1')throw Error('Explicit simulated browser fixture opt-in required');
const name='golden_ui',port=3103,sqlPort=3102;
const admin=new Client({connectionString:'postgresql://postgres@127.0.0.1:55468/postgres'});await admin.connect();await admin.query(`CREATE DATABASE ${name}`);await admin.end();
const pool=new Pool({connectionString:'postgresql://postgres@127.0.0.1:55468/'+name});const client=await pool.connect();
await runMigrations({query:async(q,p)=>(await client.query(q,p)).rows,transaction:async statements=>{await client.query('BEGIN');try{for(const s of statements)await client.query(s.sql,s.params);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}}},await loadMigrations());client.release();
const trace=JSON.parse(await readFile('/private/tmp/myeve-golden-simulation-report.json','utf8')).trace;
const principal={scopeId:'golden-owner',actorId:'golden-owner',scopeKind:'personal'},database={query:async(q,p)=>(await pool.query(q,p)).rows};
const store=new WorkStore(principal,database),execution=new ExecutionStore(store),workers=[];const ids={};
for(const kind of ['ready','approval']) {
  const {work}=await store.create({title:kind==='ready'?'Golden Work · review-ready simulation':'Golden Work · publication decision simulation',objective:trace.contract.objective,repository:trace.contract.repository,criteria:trace.contract.criteria,maxCostUsd:5,maxDurationSeconds:3600,idempotencyKey:randomUUID()});ids[kind]=work.id;
  const contract={...trace.contract,workId:work.id,scope:principal,deadline:new Date(Date.now()+3600000).toISOString()};await execution.admit(work,contract);
  const state=await execution.get(work.id);Object.assign(state,{qualificationMode:'simulation',phase:kind==='ready'?'ready':'approval',runs:trace.runs,candidates:[],evidence:trace.evidence,approval:kind==='ready'?trace.approvals[0]:null,effects:kind==='ready'?trace.effects:[],truth:trace.github,results:kind==='ready'?trace.results:[],addressedReviews:['review-1'],reviewChecks:[]});
  // Full retained candidates are reconstructed from protected fixture artifacts, not fabricated provider receipts.
  for(const c of trace.candidates)state.candidates.push({...c,workId:work.id,files:{'quantity.mjs':'// UI fixture; candidate artifact remains in integration trace'},patch:JSON.stringify([{path:'quantity.mjs',before:'unvalidated',after:'validated positive integer quantity'}])});
  state.evidence=state.evidence.map(e=>({...e,workId:work.id}));
  if(kind==='approval'){state.runs=state.runs.slice(0,1);state.candidates=state.candidates.slice(0,1);state.evidence=state.evidence.filter(e=>e.candidate===state.candidates[0].sha).map(e=>({...e,result:'PASS'}));}
  let head=kind==='ready'?state.candidates.at(-1).sha:null,pr=kind==='ready'?trace.github.pr:null;
  const provider={async observe(){return {...trace.github,observedAt:nowIso(),head,pr,reviews:[],checks:head?[{id:'1',name:'quantity-ci',sha:head,attempt:1,result:'PASS',details:'Explicit browser simulation'}]:[]};},
    async publish(_contract,candidate){head=candidate.sha;pr={number:2,url:'https://github.com/fixture/golden/pull/2',draft:true,open:true};return pr;},async snapshot(){throw Error('UI fixture executor unavailable');}};
  await execution.save(await store.get(work.id),state,'browser_fixture_seed');
  workers.push({id:work.id,worker:new EngineeringWorker(execution,provider,{async requestStop(){},async cleanup(){}},{},()=>digest(contract.profile),async()=>true)});
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
    MYEVE_ACCESS_PASSWORD:'golden-ui-qualification',MYEVE_SESSION_SECRET:'golden-fixture-session-secret-not-production-2026',DATABASE_URL:neonUrl,NODE_OPTIONS:`--import ${preload}`}});
let busy=false;const timer=setInterval(async()=>{if(busy)return;busy=true;try{for(const {id,worker} of workers)await worker.tick(id);}finally{busy=false;}},2000);
console.log('SIMULATED Golden Work browser fixture',JSON.stringify({url:`http://127.0.0.1:${port}/work`,ids}));
process.on('SIGTERM',()=>{clearInterval(timer);next.kill('SIGTERM');sqlServer.close(()=>void pool.end());});
