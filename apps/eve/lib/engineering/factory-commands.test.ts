import { describe, it, expect, vi } from 'vitest';
import { enqueueFactoryCommand, consumeFactoryCommands } from './factory-commands.ts';
import { WorkStore } from './store.ts';
const policy={ownerId:'owner',repository:'test/fixture',maxCostUsd:1.35,maxDurationSeconds:600};
const work={id:'work',scopeId:'owner',version:2,generation:3,repository:'test/fixture',maxCostUsd:1.35,maxDurationSeconds:600};
const action={operation:'start',expectedWorkVersion:2,expectedWorkGeneration:3};
function fixture(rows:Record<string,unknown>[]=[]){
 const query=vi.fn(async (sql:string,_params?:unknown[]):Promise<Record<string,any>[]>=>{
  if(sql.startsWith('SELECT * FROM engineering_factory_commands'))return rows;
  if(sql.startsWith('SELECT NOT EXISTS'))return [{allowed:true}];
  if(sql.startsWith('INSERT INTO'))return [{id:'command',status:'pending',operation:'start'}];
  return [];
 });
 const store=new WorkStore({scopeId:'owner',scopeKind:'personal',actorId:'owner'},{query});
 vi.spyOn(store,'get').mockResolvedValue(work as Awaited<ReturnType<WorkStore['get']>>);
 return {store,query};
}
describe('durable Factory transport',()=>{
 it('rejects another owner and organization scopes before querying',async()=>{
  for(const p of [{scopeId:'partner',scopeKind:'personal',actorId:'partner'},{scopeId:'owner',scopeKind:'personal',actorId:'partner'},{scopeId:'owner',scopeKind:'organization',actorId:'owner'}]){
   const {query}=fixture(),store=new WorkStore(p as WorkStore['principal'],{query});
   await expect(enqueueFactoryCommand(store,'work',action,policy)).rejects.toMatchObject({code:'factory_scope'});expect(query).not.toHaveBeenCalled();
  }
 });
 it('rejects stale versions and repository/budget expansion',async()=>{
  for(const patch of [{version:1},{generation:4},{repository:'other/repo'},{maxCostUsd:1.36},{maxDurationSeconds:601}]){
   const {store,query}=fixture();vi.mocked(store.get).mockResolvedValue({...work,...patch} as Awaited<ReturnType<WorkStore['get']>>);
   await expect(enqueueFactoryCommand(store,'work',action,policy)).rejects.toThrow();expect(query).not.toHaveBeenCalled();
  }
 });
 it('rejects an invalid policy rather than treating NaN as unlimited',async()=>{
  const {store,query}=fixture();await expect(enqueueFactoryCommand(store,'work',action,{...policy,maxCostUsd:NaN})).rejects.toThrow();expect(query).not.toHaveBeenCalled();
 });
 it('preserves shared business authorization',async()=>{
  const {store,query}=fixture();query.mockResolvedValue([{allowed:false}]);await expect(enqueueFactoryCommand(store,'work',action,policy)).rejects.toMatchObject({code:'shared_decision_required'});expect(query).toHaveBeenCalledTimes(1);
 });
 it('queues intent without granting execution and handles the compare-and-insert race',async()=>{
  const {store,query}=fixture();expect(await enqueueFactoryCommand(store,'work',action,policy)).toMatchObject({state:'QUEUED',executionGranted:false});
  query.mockImplementation(async sql=>sql.startsWith('SELECT NOT EXISTS')?[{allowed:true}]:[]);
  await expect(enqueueFactoryCommand(store,'work',action,policy)).rejects.toMatchObject({code:'factory_work_changed'});
 });
 it('does not execute stale queued generations',async()=>{
  const {store,query}=fixture([{id:'command',work_id:'work',work_version:2,work_generation:2,operation:'start'}]);const execute=vi.fn();await consumeFactoryCommands(store,execute);expect(execute).not.toHaveBeenCalled();expect(query.mock.calls.some(([s])=>s.includes("status='stale'"))).toBe(true);
 });
 it('reenters the canonical driver for an interrupted running command',async()=>{
  const {store}=fixture([{id:'command',work_id:'work',work_version:2,work_generation:3,operation:'start',status:'running'}]);const execute=vi.fn();await consumeFactoryCommands(store,execute);expect(execute).toHaveBeenCalledExactlyOnceWith('work',action);
 });
 it('blocks queued production once stop was requested',async()=>{
  const {store,query}=fixture([{id:'command',work_id:'work',work_version:2,work_generation:3,operation:'start'}]);const original=query.getMockImplementation()!;query.mockImplementation(async(s,p)=>s.startsWith('SELECT id FROM engineering_factory_commands')?[{id:'stop'}]:original(s,p));
  const execute=vi.fn();await consumeFactoryCommands(store,execute);expect(execute).not.toHaveBeenCalled();expect(query.mock.calls.at(-1)?.[1]).toEqual(['command','owner','personal','factory_stop_requested']);
 });
 it('never saves raw execution errors in queue evidence',async()=>{
  const {store,query}=fixture([{id:'command',work_id:'work',work_version:2,work_generation:3,operation:'start'}]);await consumeFactoryCommands(store,async()=>{throw Error('secret-value');});expect(JSON.stringify(query.mock.calls)).not.toContain('secret-value');expect(query.mock.calls.at(-1)?.[1]).toContain('factory_reconciliation_required');
 });
});
