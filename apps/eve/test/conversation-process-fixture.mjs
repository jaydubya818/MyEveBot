import {Pool} from 'pg';
import {WorkStore} from '../lib/engineering/store.ts';
import {NativeRouteAuthority} from '../lib/engineering/native-routing.ts';
import {EngineeringConversationBudget} from '../lib/engineering/conversation-budget.ts';
import {engineeringConversationModel} from '../lib/engineering/conversation-model.ts';
import {runtimeSchema} from '../lib/engineering/runtime.ts';
process.once('message',async ({databaseURL,config,reservation,stage})=>{
 const url=new URL(databaseURL);if(url.hostname!=='127.0.0.1'||url.port!=='55468'||!/^\/direct_work_[a-f0-9]{16}$/.test(url.pathname))throw Error('Isolated fixture required');
 const pool=new Pool({connectionString:url.href});const store=new WorkStore({scopeId:config.ownerId,scopeKind:'personal',actorId:config.ownerId},{query:async(s,p)=>(await pool.query(s,p)).rows});
 const authority=new NativeRouteAuthority(store,async()=>runtimeSchema.parse(config));
 const budget=new EngineeringConversationBudget(store,authority);let actual,dispatches=0;
 const halt=()=>{process.send({stage,reservation:actual,dispatches});setInterval(()=>{},1000);return new Promise(()=>{});};
 const controlled={reserve:async input=>{actual=input;const prior=await budget.reserve(input);if(stage==='reserved')await halt();return prior;},
   assertDispatch:input=>budget.assertDispatch(input),unknown:input=>budget.unknown(input),
   settle:async (...args)=>{await budget.settle(...args);if(stage==='settled')await halt();}};
 const model=engineeringConversationModel({...reservation,store,productive:false},{authority,budget:controlled,phase:async()=>"observation",
   catalog:async()=>({models:[{id:reservation.modelId,pricing:{input:'0.000003',output:'0.000015'}}]}),
   model:()=>({doGenerate:async()=>{dispatches++;if(stage==='dispatched')await halt();return {content:[{type:'text',text:'durably retained'}],usage:{},finishReason:{unified:'stop',raw:'stop'},warnings:[],providerMetadata:{gateway:{cost:'0.001'}}};}})});
 await model.doGenerate({prompt:[{role:'user',content:[{type:'text',text:'Inspect the synthetic Work'}]}],tools:[{type:'function',name:'engineering_direct',inputSchema:{type:'object'}}]});
});
