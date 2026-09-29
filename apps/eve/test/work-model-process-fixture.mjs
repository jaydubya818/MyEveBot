import {Pool} from 'pg';
import {WorkStore} from '../lib/engineering/store.ts';
import {NativeRouteAuthority} from '../lib/engineering/native-routing.ts';
import {EngineeringConversationBudget} from '../lib/engineering/conversation-budget.ts';
import {runtimeSchema} from '../lib/engineering/runtime.ts';
process.once('message',async ({databaseURL,config,reservation,stage})=>{
 const url=new URL(databaseURL);if(url.hostname!=='127.0.0.1'||url.port!=='55468'||!/^\/direct_work_[a-f0-9]{16}$/.test(url.pathname))throw Error('Disposable fixture required');
 const pool=new Pool({connectionString:url.href});const store=new WorkStore({scopeId:config.ownerId,scopeKind:'personal',actorId:config.ownerId},{query:async(s,p)=>(await pool.query(s,p)).rows});
 const budget=new EngineeringConversationBudget(store,new NativeRouteAuthority(store,async()=>runtimeSchema.parse(config)));
 await budget.reserve(reservation);let providerCalls=0;
 if(stage!=='RESERVED'){await budget.assertDispatch(reservation);providerCalls++;}
 if(['RESULT_RETAINED','RECONCILED'].includes(stage))await budget.retain(reservation,{content:[{type:'text',text:'retained'}]},{microUsd:1000,providerRequestId:'synthetic-exact-call'});
 if(stage==='RECONCILED')await budget.reconcile(reservation,1000);
 process.send({stage,providerCalls});setInterval(()=>{},1000);
});
