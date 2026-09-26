// Explicit local qualification harness: real GitHub App, Claude/Gateway, SQL, Next UI and worker.
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { Client, Pool } from 'pg';
import { loadMigrations, runMigrations } from '../scripts/migration-runner.ts';

if (process.env.GOLDEN_LIVE_LOCAL !== '1' || process.env.VERCEL_ENV === 'production')
  throw Error('Explicit non-production local qualification opt-in is required.');
const directory = '/private/tmp/myeve-golden-live-private';
const configFile = directory + '/runtime.json';
const developmentFile = directory + '/development.env';
const databaseName = 'golden_live_qual';
const ownerId = 'golden-local-owner';
const agentId = 'sofie-golden-local';
await mkdir(directory, {recursive:true,mode:0o700});

let config;
if (existsSync(configFile)) config=JSON.parse(await readFile(configFile,'utf8'));
else {
  const appId=Number(process.env.GOLDEN_GITHUB_APP_ID),installationId=Number(process.env.GOLDEN_GITHUB_INSTALLATION_ID);
  if (!Number.isSafeInteger(appId)||appId<1||!Number.isSafeInteger(installationId)||installationId<1)
    throw Error('Exact non-secret GitHub App ID and installation ID are required.');
  const criterionId=randomUUID();
  config={mode:'isolated-dogfood',ownerId,agentId,
    objective:'Implement quantity.mjs for issue #1: read one quantity from stdin and return JSON for positive safe integers; reject zero, negative and fractional values, ignoring surrounding whitespace.',
    criteria:[{id:criterionId,method:'test',statement:'quantity.mjs returns a single JSON line for positive safe integers and invalid_quantity for zero, negative and fractional input; surrounding whitespace is ignored.'}],
    profile:{id:'quantity-cli',version:1,repository:'jaydubya818/myeve-golden-work-qual',privateQualification:true,baseBranch:'main',
      allowedPaths:['quantity.mjs'],requiredCI:['quantity-ci'],reviewerLogins:['jaydubya818'],policyVersion:1,executor:'claude-code',
      qualificationFirstRunFault:'parse-int-fraction',
      image:'myeve-golden-executor@sha256:f4cf5d653d247d013ebe3054d5333278923736832e4af11f9c350bfec2bea82c',
      maxRuns:6,maxModelRequests:30,maxOutputTokens:8192,checks:[
        {id:'positive',program:'quantity.mjs',input:'2',expectedOutput:'{"quantity":2}\n',expectedExitCode:0,criterionIds:[criterionId]},
        {id:'zero',program:'quantity.mjs',input:'0',expectedOutput:'{"error":"invalid_quantity"}\n',expectedExitCode:0,criterionIds:[criterionId]},
        {id:'negative',program:'quantity.mjs',input:'-1',expectedOutput:'{"error":"invalid_quantity"}\n',expectedExitCode:0,criterionIds:[criterionId]},
        {id:'whitespace',program:'quantity.mjs',input:'  42  \n',expectedOutput:'{"quantity":42}\n',expectedExitCode:0,criterionIds:[criterionId]},
      ]},brokerPort:3101,model:'claude-sonnet-5',githubApp:{appId,installationId,keychainService:'myeve-golden-work-publisher',keychainAccount:'jaydubya818'}};
  await writeFile(configFile,JSON.stringify(config,null,2),{mode:0o600});
}
if(config.profile.repository!=='jaydubya818/myeve-golden-work-qual'||config.githubApp?.keychainService!=='myeve-golden-work-publisher')
  throw Error('Qualification profile changed repository or credential boundary.');
const content=await readFile(developmentFile,'utf8');
const match=/^VERCEL_OIDC_TOKEN=(.*)$/m.exec(content);
if(!match)throw Error('Development-only Gateway credential is unavailable.');
const oidc=match[1].trim().startsWith('"')?JSON.parse(match[1].trim()):match[1].trim();

const admin=new Client({connectionString:'postgresql://postgres@127.0.0.1:55468/postgres'});await admin.connect();
const found=await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[databaseName]);
if(!found.rowCount)await admin.query(`CREATE DATABASE ${databaseName}`);
await admin.end();
const pool=new Pool({connectionString:`postgresql://postgres@127.0.0.1:55468/${databaseName}`,max:8});
const client=await pool.connect();
await runMigrations({query:async(q,p)=>(await client.query(q,p)).rows,transaction:async statements=>{await client.query('BEGIN');try{for(const s of statements)await client.query(s.sql,s.params);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}}},await loadMigrations());
client.release();
await pool.query(`INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,max_steps,max_runtime_seconds,max_estimated_cost_usd)
 VALUES($1,$2,'sofie','Sofie','Engineering','Internal Golden Work qualification',true,'active',30,3600,8)
 ON CONFLICT (id) DO NOTHING`,[agentId,ownerId]);

const neonUrl='postgresql://fixture:isolated@ep-golden.neon.tech/golden_live_qual';
const sqlServer=createServer(async(req,res)=>{
  if(req.url!=='/sql'||req.method!=='POST'||req.headers['neon-connection-string']!==neonUrl){res.writeHead(403).end();return;}
  const conn=await pool.connect();let transaction=false;
  try {let text='';for await(const chunk of req){text+=chunk;if(text.length>5000000)throw Error('bound');}
    const input=JSON.parse(text);transaction=!!input.queries;if(transaction)await conn.query('BEGIN');const results=[];
    for(const item of input.queries??[input]){const r=await conn.query({text:item.query,values:item.params,rowMode:'array',types:{getTypeParser:()=>v=>v}});
      results.push({rows:r.rows,fields:r.fields.map(f=>({name:f.name,dataTypeID:f.dataTypeID})),rowCount:r.rowCount,command:r.command,rowAsArray:true});}
    if(transaction)await conn.query('COMMIT');res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(transaction?{results}:results[0]));
  }catch(e){if(transaction)await conn.query('ROLLBACK');res.writeHead(400,{'content-type':'application/json'}).end(JSON.stringify({message:e.message,code:e.code}));}finally{conn.release();}
});await new Promise(resolve=>sqlServer.listen(3102,'127.0.0.1',resolve));
const preload=directory+'/neon-preload.mjs';
await writeFile(preload,`const original=globalThis.fetch;globalThis.fetch=(input,init)=>{const headers=new Headers(init?.headers);if(headers.get('neon-connection-string')===${JSON.stringify(neonUrl)})return original('http://127.0.0.1:3102/sql',init);return original(input,init);};`,{mode:0o600});
const shared={PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',MYEVE_ENGINEERING_MODE:'dogfood',
  MYEVE_OWNER_ID:ownerId,MYEVE_ENGINEERING_CONFIG:configFile,MYEVE_ACCESS_PASSWORD:'golden-qualification-local',
  MYEVE_SESSION_SECRET:randomBytes(32).toString('hex'),DATABASE_URL:neonUrl};
const next=spawn(process.execPath,['../../node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3103'],{
  cwd:new URL('..',import.meta.url).pathname,stdio:'inherit',env:{...shared,NODE_OPTIONS:`--import ${preload}`}});
const supervisor=spawn(process.execPath,[new URL('../scripts/engineering-worker-supervisor.mjs',import.meta.url).pathname],{
  cwd:new URL('..',import.meta.url).pathname,stdio:'inherit',env:{...shared,MYEVE_ENGINEERING_DATABASE_URL:`postgresql://postgres@127.0.0.1:55468/${databaseName}`,
    VERCEL_OIDC_TOKEN:oidc,MYEVE_ENGINEERING_BROKER_SECRET:randomBytes(32).toString('hex')}});
console.log('LIVE LOCAL Golden Work',JSON.stringify({url:'http://localhost:3103/work',databaseName,repository:config.profile.repository,appId:config.githubApp.appId,installationId:config.githubApp.installationId,nextPid:next.pid,supervisorPid:supervisor.pid}));
let stopping=false;
async function stop(){if(stopping)return;stopping=true;next.kill('SIGTERM');supervisor.kill('SIGTERM');sqlServer.close(()=>void pool.end());}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void stop());
