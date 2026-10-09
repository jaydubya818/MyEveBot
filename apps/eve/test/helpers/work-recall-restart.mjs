import { Pool } from 'pg';
import { WorkStore } from '../../lib/engineering/store.ts';
import { WorkRecallStore } from '../../lib/total-recall/work-retrieval.ts';
import { LearningStore } from '../../lib/total-recall/store.ts';
import { assembleSofieRecall } from '../../lib/total-recall/sofie-adapter.ts';
import { consumeRecallFixture } from '../../lib/total-recall/fixture-consumer.ts';
const url=new URL(process.env.RECALL_TEST_URL);
if(url.hostname!=='127.0.0.1'||!url.pathname.startsWith('/recall_test_'))throw Error('Disposable database required');
const pool=new Pool({connectionString:url.href});
const request=JSON.parse(process.env.RECALL_INPUT);
const selection=JSON.parse(process.env.RECALL_APPROVED_SELECTION);
const work=new WorkStore({scopeId:process.env.RECALL_OWNER,actorId:process.env.RECALL_OWNER,scopeKind:'personal'},{query:async(s,p)=>(await pool.query(s,p)).rows});
const policy={authorize:async input=>JSON.stringify(input)===JSON.stringify(selection)};
try {
  const context=await assembleSofieRecall(new WorkRecallStore(work,policy),request,process.env.RECALL_WITH_LEARNING==='true'?new LearningStore(work):undefined);
  console.log(JSON.stringify({context,response:consumeRecallFixture(context,JSON.parse(process.env.RECALL_EXPECTED_FACTS))}));
} finally {await pool.end();}
