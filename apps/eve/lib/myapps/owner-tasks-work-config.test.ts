import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {WorkDatabase} from '../engineering/store.ts';
import {WorkError,type Work} from '../engineering/types.ts';
import type {FactoryRuntime} from '../engineering/factory-routing.ts';

// Denial guards only: no configuration, database, enrollment or authority fixture.
// The real retained function and WorkStore.get execute against the injected double.
const guards=vi.hoisted(()=>({
  defaultConfig:vi.fn(async()=>{throw Error('DEFAULT_CONFIG_FACTORY_DENIED');}),
  database:vi.fn(()=>{throw Error('DEFAULT_DATABASE_FACTORY_DENIED');}),
}));
vi.mock('../engineering/factory-routing.ts',()=>({factoryConfig:guards.defaultConfig}));
vi.mock('../../agent/lib/receipts-db.ts',()=>({db:guards.database}));
vi.mock('../capability-control/admission.ts',()=>({capabilityWorkDatabase:guards.database}));
import {retainedOwnerTasksOrigin,type OwnerFactoryTasksCustody} from './owner-tasks-result.ts';

const ownerId='owner-work-config-fixture';
const workId='11111111-1111-4111-a111-111111111111';
const resultId='22222222-2222-4222-a222-222222222222';
const criterionId='33333333-3333-4333-a333-333333333333';
const normalize=(sql:string)=>sql.replace(/\s+/g,' ').trim();
const sql={
  scope:"SELECT set_config('myeve.missioncontrol_owner',$1,true)",
  lookup:`SELECT q.work_id FROM engineering_factory_receipts f
    JOIN engineering_factory_requests q ON q.id=f.request_id
    WHERE f.id=$2 AND q.scope_id=$1 AND q.scope_kind='personal'`,
  lock:"SELECT id FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' AND id=$2 FOR SHARE",
  work:`SELECT w.*,c.items AS criteria FROM engineering_work w JOIN engineering_work_criteria c
    ON c.scope_id=w.scope_id AND c.scope_kind=w.scope_kind AND c.work_id=w.id AND c.version=w.criteria_version
    WHERE w.scope_id=$1 AND w.scope_kind=$2 AND w.id=$3`,
};
type Row=Record<string,unknown>;
type Step={purpose:keyof typeof sql;params:unknown[];rows:Row[]|(()=>Row[])};
function workRow(change:Row={}):Row {
  return {id:workId,scope_id:ownerId,scope_kind:'personal',title:'Inert Work configuration',objective:'Select the canonical Work profile',
    repository:'fixture/owner-config',lifecycle:'active',control:'agent',version:1,generation:1,criteria_version:1,
    criteria:[{id:criterionId,statement:'Inspect selection only',method:'test'}],max_cost_usd:1,max_duration_seconds:300,
    created_at:'2026-10-26T00:00:00.000Z',updated_at:'2026-10-26T00:00:00.000Z',...change};
}
const expectedWork:Work={id:workId,scopeId:ownerId,title:'Inert Work configuration',objective:'Select the canonical Work profile',
  repository:'fixture/owner-config',lifecycle:'active',control:'agent',version:1,generation:1,criteriaVersion:1,
  criteria:[{id:criterionId,statement:'Inspect selection only',method:'test'}],maxCostUsd:1,maxDurationSeconds:300,
  createdAt:'2026-10-26T00:00:00.000Z',updatedAt:'2026-10-26T00:00:00.000Z'};
const firstSteps=(row:Row=workRow()):Step[]=>[
  {purpose:'scope',params:[ownerId],rows:[]},
  {purpose:'lookup',params:[ownerId,resultId],rows:[{work_id:workId}]},
  {purpose:'lock',params:[ownerId,workId],rows:[{id:workId}]},
  {purpose:'work',params:[ownerId,'personal',workId],rows:[row]},
];
const recheck=(row:Row|(()=>Row)=workRow()):Step=>({purpose:'work',params:[ownerId,'personal',workId],rows:()=>[typeof row==='function'?row():row]});
function strictDatabase(steps:Step[]) {
  const remaining=[...steps],trace:string[]=[],queries:{purpose:string;params:unknown[]}[]=[];
  let active=false,atomicCalls=0;
  const pinned:WorkDatabase={query:async(statement,params)=>{
    expect(active).toBe(true);
    const step=remaining.shift();
    if(!step)throw Error('UNEXPECTED_QUERY_DENIED');
    expect(normalize(statement)).toBe(normalize(sql[step.purpose]));
    expect(params).toEqual(step.params);
    trace.push(step.purpose);queries.push({purpose:step.purpose,params:structuredClone(params??[])});
    return structuredClone(typeof step.rows==='function'?step.rows():step.rows);
  }};
  const database:WorkDatabase={query:async()=>{throw Error('QUERY_OUTSIDE_PINNED_ATOMIC_DENIED');},atomic:async action=>{
    expect(active).toBe(false);active=true;atomicCalls++;trace.push('atomic:begin');
    try{return await action(pinned);}finally{active=false;trace.push('atomic:end');}
  }};
  return {database,trace,queries,isAtomic:()=>active,atomicCalls:()=>atomicCalls,complete:()=>{
    expect(remaining).toHaveLength(0);expect(active).toBe(false);expect(atomicCalls).toBe(1);
  }};
}
// Intentionally incomplete and wrong-owner: cannot satisfy any enrollment gate.
const invalidConfiguration=(owner='foreign-owner'):FactoryRuntime=>({engineering:{ownerId:owner}} as unknown as FactoryRuntime);
const sentinel=new Error('RESOLVER_SENTINEL_STOP');

beforeEach(()=>vi.clearAllMocks());
afterEach(()=>{expect(guards.defaultConfig).not.toHaveBeenCalled();expect(guards.database).not.toHaveBeenCalled();});

describe('Owner Tasks canonical Work configuration — authority-free refusals',()=>{
  it('requires atomic custody before any resolver or query',async()=>{
    const query=vi.fn(async()=>{throw Error('QUERY_DENIED');}),readConfig=vi.fn(async()=>{throw sentinel;});
    await expect(retainedOwnerTasksOrigin({query},ownerId,resultId,{kind:'OWNER_FACTORY',readConfig})).rejects.toMatchObject({code:'APP_RESULT_UNAVAILABLE'});
    expect(query).not.toHaveBeenCalled();expect(readConfig).not.toHaveBeenCalled();
  });
  it('rejects other custody before entering atomic context',async()=>{
    const atomic=vi.fn(async()=>{throw Error('ATOMIC_DENIED');}),query=vi.fn(async()=>[]),readConfig=vi.fn(async()=>{throw sentinel;});
    await expect(retainedOwnerTasksOrigin({query,atomic},ownerId,resultId,{kind:'OTHER',readConfig} as unknown as OwnerFactoryTasksCustody)).rejects.toMatchObject({code:'APP_RESULT_UNAVAILABLE'});
    expect(atomic).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();expect(readConfig).not.toHaveBeenCalled();
  });
  it.each(['missing receipt','foreign receipt'])('refuses %s using exact owner/result lookup before configuration',async()=>{
    const steps=firstSteps().slice(0,2);steps[1].rows=[];const f=strictDatabase(steps),readConfig=vi.fn(async()=>{throw sentinel;});
    await expect(retainedOwnerTasksOrigin(f.database,ownerId,resultId,{kind:'OWNER_FACTORY',readConfig})).rejects.toMatchObject({code:'APP_EVIDENCE_PENDING'});
    expect(readConfig).not.toHaveBeenCalled();f.complete();expect(f.queries).toEqual([{purpose:'scope',params:[ownerId]},{purpose:'lookup',params:[ownerId,resultId]}]);
  });
  it('requires the exact owner Work lock before reading or configuring Work',async()=>{
    const steps=firstSteps().slice(0,3);steps[2].rows=[];const f=strictDatabase(steps),readConfig=vi.fn(async()=>{throw sentinel;});
    await expect(retainedOwnerTasksOrigin(f.database,ownerId,resultId,{kind:'OWNER_FACTORY',readConfig})).rejects.toMatchObject({code:'APP_EVIDENCE_PENDING'});
    expect(readConfig).not.toHaveBeenCalled();f.complete();
  });
  it('missing canonical Work preserves work_not_found and never resolves configuration',async()=>{
    const steps=firstSteps();steps[3].rows=[];const f=strictDatabase(steps),readConfig=vi.fn(async()=>{throw sentinel;});
    await expect(retainedOwnerTasksOrigin(f.database,ownerId,resultId,{kind:'OWNER_FACTORY',readConfig})).rejects.toMatchObject({code:'work_not_found'});
    expect(readConfig).not.toHaveBeenCalled();f.complete();
  });
  it.each([
    ['foreign owner',{scope_id:'foreign-owner'},'APP_OWNER_MISMATCH'],
    ['different Work',{id:'44444444-4444-4444-a444-444444444444'},'APP_RESULT_BINDING'],
  ] as const)('rejects an inconsistent %s row before resolver use',async(_label,change,code)=>{
    const f=strictDatabase(firstSteps(workRow(change))),readConfig=vi.fn(async()=>{throw sentinel;});
    await expect(retainedOwnerTasksOrigin(f.database,ownerId,resultId,{kind:'OWNER_FACTORY',readConfig})).rejects.toMatchObject({code});
    expect(readConfig).not.toHaveBeenCalled();f.complete();
  });
  it('gives the locked canonical Work to one resolver inside the same atomic context, then stops at its sentinel',async()=>{
    const row=workRow(),f=strictDatabase(firstSteps(row));
    const readConfig=vi.fn(async(work:Work):Promise<FactoryRuntime>=>{
      expect(f.isAtomic()).toBe(true);expect(work).toEqual(expectedWork);expect(work).not.toBe(row);
      expect(work.criteria).not.toBe(row.criteria);expect(Object.isFrozen(work)).toBe(true);
      expect(Object.isFrozen(work.criteria)).toBe(true);expect(Object.isFrozen(work.criteria[0])).toBe(true);
      f.trace.push('config');throw sentinel;
    });
    await expect(retainedOwnerTasksOrigin(f.database,ownerId,resultId,{kind:'OWNER_FACTORY',readConfig})).rejects.toBe(sentinel);
    expect(readConfig).toHaveBeenCalledTimes(1);f.complete();expect(f.trace).toEqual(['atomic:begin','scope','lookup','lock','work','config','atomic:end']);
  });
  it('retains zero-argument callback compatibility and never falls back after rejection',async()=>{
    const f=strictDatabase(firstSteps()),zeroArgument:()=>Promise<FactoryRuntime>=vi.fn(async()=>{throw sentinel;});
    const custody:OwnerFactoryTasksCustody={kind:'OWNER_FACTORY',readConfig:zeroArgument};
    await expect(retainedOwnerTasksOrigin(f.database,ownerId,resultId,custody)).rejects.toBe(sentinel);
    expect(zeroArgument).toHaveBeenCalledTimes(1);f.complete();
  });
  it('preserves a per-Work missing-profile error without retry, fallback or enrollment reads',async()=>{
    const f=strictDatabase(firstSteps()),missing=new WorkError('factory_project_binding','Profile unavailable.',403);
    const readConfig=vi.fn(async(_work:Work):Promise<FactoryRuntime>=>{throw missing;});
    await expect(retainedOwnerTasksOrigin(f.database,ownerId,resultId,{kind:'OWNER_FACTORY',readConfig})).rejects.toBe(missing);
    expect(readConfig).toHaveBeenCalledTimes(1);f.complete();
  });
  it.each(['foreign-owner',''])('refuses incomplete wrong-owner configuration %j before enrollment',async owner=>{
    const f=strictDatabase([...firstSteps(),recheck()]),readConfig=vi.fn(async()=>invalidConfiguration(owner));
    await expect(retainedOwnerTasksOrigin(f.database,ownerId,resultId,{kind:'OWNER_FACTORY',readConfig})).rejects.toMatchObject({code:'APP_OWNER_MISMATCH'});
    expect(readConfig).toHaveBeenCalledTimes(1);f.complete();expect(f.queries.map(q=>q.purpose)).toEqual(['scope','lookup','lock','work','work']);
  });
  it('resolver mutation cannot change authoritative Work, criteria or later owner selection',async()=>{
    const row=workRow(),original=structuredClone(row),f=strictDatabase([...firstSteps(row),recheck(row)]);
    const readConfig=vi.fn(async(work:Work)=>{
      expect(()=>{work.repository='foreign/repository';}).toThrow(TypeError);
      expect(()=>{work.criteria[0].statement='mutated';}).toThrow(TypeError);
      expect(()=>{work.criteria.push({...work.criteria[0]});}).toThrow(TypeError);
      return invalidConfiguration();
    });
    await expect(retainedOwnerTasksOrigin(f.database,ownerId,resultId,{kind:'OWNER_FACTORY',readConfig})).rejects.toMatchObject({code:'APP_OWNER_MISMATCH'});
    expect(row).toEqual(original);f.complete();expect(f.queries.filter(q=>q.purpose==='work').every(q=>q.params[2]===workId)).toBe(true);
  });
  it.each([
    ['id',{id:'44444444-4444-4444-a444-444444444444'}],['scope',{scope_id:'foreign-owner'}],
    ['version',{version:2}],['generation',{generation:2}],['criteria version',{criteria_version:2}],
    ['criteria',{criteria:[{id:criterionId,statement:'Changed criterion',method:'test'}]}],
    ['repository',{repository:'fixture/changed'}],['objective',{objective:'Changed objective'}],['title',{title:'Changed title'}],
    ['control',{control:'human'}],['lifecycle',{lifecycle:'accepted'}],['budget',{max_cost_usd:2}],['duration',{max_duration_seconds:600}],
  ] as const)('refuses changed post-await Work %s before enrollment or authority parsing',async(_label,change)=>{
    const row=workRow(),post=structuredClone(row),f=strictDatabase([...firstSteps(row),recheck(()=>post)]);
    const readConfig=vi.fn(async()=>{await Promise.resolve();Object.assign(post,change);return invalidConfiguration();});
    await expect(retainedOwnerTasksOrigin(f.database,ownerId,resultId,{kind:'OWNER_FACTORY',readConfig})).rejects.toMatchObject({code:'APP_WORK_STALE'});
    expect(readConfig).toHaveBeenCalledTimes(1);f.complete();
  });
  it('passes the current accepted Work to selection without relabeling its retained Result version',async()=>{
    const f=strictDatabase(firstSteps(workRow({lifecycle:'accepted',version:17,generation:4})));
    const readConfig=vi.fn(async(work:Work):Promise<FactoryRuntime>=>{
      expect(work.lifecycle).toBe('accepted');expect(work.version).toBe(17);expect(work.generation).toBe(4);throw sentinel;
    });
    await expect(retainedOwnerTasksOrigin(f.database,ownerId,resultId,{kind:'OWNER_FACTORY',readConfig})).rejects.toBe(sentinel);f.complete();
    // This early-stop case proves no positive accepted-Work custody or Result.
  });
});
