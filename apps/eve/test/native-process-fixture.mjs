// Child for the isolated native host integration test, never an application entrypoint.
import { Pool } from 'pg';
import { WorkStore } from '../lib/engineering/store.ts';
import { NativeRouteAuthority } from '../lib/engineering/native-routing.ts';
import { runtimeSchema } from '../lib/engineering/runtime.ts';
import { NativeModelBudget } from '../lib/engineering/native-model-budget.ts';
process.once('message', async ({databaseURL, config, reservation, settle}) => {
  const url=new URL(databaseURL);
  if(url.hostname!=='127.0.0.1' || !['55468','55469'].includes(url.port) || !/^\/direct_work_[a-f0-9]{16}$/.test(url.pathname))throw new Error('Isolated test database required.');
  const pool=new Pool({connectionString:databaseURL});
  const store=new WorkStore({scopeId:config.ownerId,scopeKind:'personal',actorId:config.ownerId},{query:async(sql,params)=>(await pool.query(sql,params)).rows});
  const budget=new NativeModelBudget(store,new NativeRouteAuthority(store,async()=>runtimeSchema.parse(config)));
  await budget.reserve(reservation);
  if(settle)await budget.settle(reservation,1000,{content:[{type:'text',text:'Retained before process loss'}]});
  process.send({state:settle?'SETTLED':'RESERVED'});
  // Parent deliberately kills this process, leaving durable state untouched.
  setInterval(()=>{},1000);
});
