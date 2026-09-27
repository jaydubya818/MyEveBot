import {Pool} from 'pg';
import {WorkStore} from '../lib/engineering/store.ts';
import {NativeRouteAuthority,admitNativeWork} from '../lib/engineering/native-routing.ts';
import {NativeModelBudget} from '../lib/engineering/native-model-budget.ts';
import {DirectDevelopmentStore} from '../lib/engineering/direct-development.ts';
import {DirectVerificationDriver} from '../lib/engineering/direct-verification-driver.ts';
import {DockerProtectedVerifier} from '../lib/engineering/docker-executor.ts';
import {NativeResultStore} from '../lib/engineering/native-results.ts';
process.once('message',async ({databaseURL,config,workId,stage,reservation,action})=>{
 const url=new URL(databaseURL);if(url.hostname!=='127.0.0.1'||url.port!=='55468'||!/^\/gap2b_[a-f0-9]{16}$/.test(url.pathname))throw Error('Disposable database only');
 const pool=new Pool({connectionString:url.href}),store=new WorkStore({scopeId:config.ownerId,scopeKind:'personal',actorId:config.ownerId},{query:async(s,p)=>(await pool.query(s,p)).rows});
 const authority=new NativeRouteAuthority(store,async()=>config),budget=new NativeModelBudget(store,authority);
 if(stage==='CONTRACT'){const w=await store.get(workId);await admitNativeWork(store,workId,w.version,w.generation,authority,'writer');}
 else if(['RESERVED','DISPATCHED','RESULT_RETAINED'].includes(stage)){
  await budget.reserve(reservation);if(stage!=='RESERVED')await budget.assertDispatch(reservation);
  if(stage==='RESULT_RETAINED')await budget.retain(reservation,{content:[{type:'text',text:'Exact retained controlled response'}]},{microUsd:1000,providerRequestId:'controlled-process'});
 }else{
  const direct=new DirectDevelopmentStore(store,{profile:config.profile,approvedBase:config.approvedBase,objective:config.objective,criteria:config.criteria,agentId:config.agentId,issueNumber:1,assertCurrentAuthority:id=>authority.assertEffect(id)});
  if(stage==='DRAFT'){await budget.assertSession(workId,'writer');await direct.write(workId,action.expectedRevision,action.path,action.content);}
  else if(stage==='VERIFICATION'){await new DirectVerificationDriver(direct,new DockerProtectedVerifier()).run(workId);await new NativeResultStore(direct).retain(workId);}
 }
 process.send({stage,ready:true});setInterval(()=>{},1000);
});
