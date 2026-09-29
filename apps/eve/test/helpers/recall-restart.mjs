import { Pool } from 'pg';
import { neonConfig } from '@neondatabase/serverless';
import { memoryStore } from '../../agent/lib/memory-store.ts';
import { WorkStore } from '../../lib/engineering/store.ts';
import { LearningStore } from '../../lib/total-recall/store.ts';
const url = new URL(process.env.RECALL_TEST_URL);
if (url.hostname !== '127.0.0.1' || !url.pathname.startsWith('/recall_test_')) throw Error('Disposable database required');
const pool = new Pool({connectionString: url.href});
const work = new WorkStore({scopeId: process.env.RECALL_OWNER, actorId: process.env.RECALL_OWNER, scopeKind:'personal'}, {query: async (sql,args) => (await pool.query(sql,args)).rows});
const store = new LearningStore(work);
const input = JSON.parse(process.env.RECALL_INPUT);
process.env.DATABASE_URL='postgresql://fixture:fixture@recall-restart.neon.tech/qualification';
delete process.env.SUPERMEMORY_API_KEY;
neonConfig.fetchFunction=async (_url,options)=>{
  const {query,params}=JSON.parse(options.body);
  const r=await pool.query({text:query,values:params,rowMode:'array',types:{getTypeParser:()=>v=>v}});
  return Response.json({fields:r.fields.map(f=>({name:f.name,dataTypeID:f.dataTypeID})),rows:r.rows,rowCount:r.rowCount,command:r.command,rowAsArray:true});
};
const context={ownerId:process.env.RECALL_OWNER,agentId:'agent_recall'};
try {
  const result = input.memoryQuery ? await memoryStore.search(input.memoryQuery,context)
    : input.memoryWrite ? await memoryStore.add(input.memoryWrite,{context,scope:{type:'owner',id:context.ownerId},sourceType:'chat',sourceId:'restart-session'})
    : input.memoryCorrection ? await memoryStore.correctForOwner(context.ownerId,input.memoryCorrection.id,input.memoryCorrection.content)
    : input.feedback ? await store.feedback(input.feedback)
    : input.command ? await store.command(input.id,input.revision,input.command) : await store.retrieve(input.workId,input.workType,input.contextRef);
  if (input.loseResponse) process.kill(process.pid,'SIGKILL');
  console.log(JSON.stringify(result));
} finally { await pool.end(); }
