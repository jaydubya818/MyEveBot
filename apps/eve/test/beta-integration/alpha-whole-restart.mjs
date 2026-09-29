import {betaTestPort} from './test-postgres.mjs';
import {BetaIntegration} from '../../lib/beta-integration/runtime.ts';
import {Pool} from 'pg';
import {neonConfig} from '@neondatabase/serverless';
import {memoryStore} from '../../agent/lib/memory-store.ts';
const input=JSON.parse(process.argv[2]);
if(!/^factory_beta_[a-f0-9]+$/.test(input.database))throw Error('Disposable Capsule database required');
const pool=new Pool({host:'127.0.0.1',port:betaTestPort,user:'postgres',database:input.database});
process.env.DATABASE_URL='postgresql://fixture:fixture@capsule-fixture.neon.tech/qualification';
delete process.env.SUPERMEMORY_API_KEY;delete process.env.MYEVE_OWNER_ID;delete process.env.SOFIE_OWNER_ID;
neonConfig.fetchFunction=async (_url,options)=>{const {query,params}=JSON.parse(options.body);const r=await pool.query({text:query,values:params,rowMode:'array',types:{getTypeParser:()=>v=>v}});return Response.json({fields:r.fields.map(f=>({name:f.name,dataTypeID:f.dataTypeID})),rows:r.rows,rowCount:r.rowCount,command:r.command,rowAsArray:true});};
try{const access={ownerId:input.owner,agentId:input.agentId};const results=await memoryStore.search('morning briefing',access);const beta=new BetaIntegration(pool,{repository:'fixture/golden',maxCostUsd:1.3,maxDurationSeconds:600});const context=input.workId?await beta.recall(input.owner,input.workId,'original sources','restart-alpha'):null;console.log(JSON.stringify({memories:results,context}));}finally{await pool.end();}
