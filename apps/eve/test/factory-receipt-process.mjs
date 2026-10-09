import {poolFor,storeFor,golden} from './factory-receipt-fixture.mjs';
import {admitFactoryResult} from '../lib/engineering/factory-result-consumer.ts';
process.once('message',async({url,principal,requestId,stage})=>{
 const pool=poolFor(url),store=storeFor(pool,principal);
 try {
  await admitFactoryResult(store,requestId,golden.result,{keys:async()=>golden.expected.keys,
   afterStage:async state=>{if(state===stage){process.send({committed:state});await new Promise(()=>{});}}});
  throw Error('Expected crash checkpoint not reached');
 } catch(e){process.send({error:String(e)});process.exitCode=1;} finally {await pool.end();}
});
