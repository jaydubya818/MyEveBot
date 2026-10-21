import {it,expect,vi} from 'vitest';
import {FactoryWorkDriver} from './factory-work-driver.ts';
import type {WorkStore} from './store.ts';
function retained(runs:{id:string}[]){
 const query=vi.fn(async(sql:string,params:unknown[])=>{
  expect(params).toEqual(['owner','personal','work','2']);
  if(sql.startsWith('SELECT r.id FROM engineering_route_runs'))return runs;
  throw Error('Legacy duplicate preparation metadata must not choose the writer');
 });
 const store={principal:{scopeId:'owner',scopeKind:'personal',actorId:'owner'},get:async()=>({generation:2}),database:{query}} as unknown as WorkStore;
 const driver=new FactoryWorkDriver(store,{} as any,{} as any,{} as any,async()=>({} as any));
 const stop=vi.spyOn(driver,'stopRun').mockResolvedValue({id:'retained-run',dispatch_state:'TERMINAL'} as any);
 return {driver,stop,query};
}
it('a uniquely bound retained writer can stop despite conflicting legacy preparation metadata',async()=>{
 const f=retained([{id:'retained-run'}]);await f.driver.stop('work');expect(f.stop).toHaveBeenCalledExactlyOnceWith('work','retained-run','cancel');expect(f.query).toHaveBeenCalledTimes(1);
});
it('ambiguous retained writers never select a stop target',async()=>{
 const f=retained([{id:'first'},{id:'second'}]);await expect(f.driver.stop('work')).rejects.toThrow('Multiple retained writers');expect(f.stop).not.toHaveBeenCalled();
});
