import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {ownerAppBuildSchema,startOwnerAppBuild,buildIdempotencyKey} from './owner-app-build.ts';
import type {Work} from './types.ts';

const profile={repository:'owner/app',limits:{maxCostUsd:1.35,maxDurationSeconds:600},allowedPaths:['src/App.jsx','src/App.test.jsx'],brief:'React 18 + Vite; tests use vitest.'};
function store(){
 const calls:{op:string;value:unknown}[]=[];let work:Work|undefined;
 return {calls,principal:{scopeId:'owner',scopeKind:'personal',actorId:'owner'},
  async create(value:Record<string,unknown>){calls.push({op:'create',value});work={...value,id:randomUUID(),scopeId:'owner',version:1,generation:1,control:'paused',lifecycle:'active'} as unknown as Work;return {work,created:true};},
  async change(id:string,value:Record<string,unknown>){calls.push({op:'change',value});work={...work!,version:2,generation:2,control:'agent'};return work;}};
}
describe('owner app build request',()=>{
 it('accepts 1-8 acceptance steps and a bounded request',()=>{
  expect(ownerAppBuildSchema.safeParse({operation:'build',title:'Counter',request:'Counter with reset',acceptance:[]}).success).toBe(false);
  expect(ownerAppBuildSchema.safeParse({operation:'build',title:'Counter',request:'Counter',acceptance:Array(9).fill('x')}).success).toBe(false);
  expect(ownerAppBuildSchema.safeParse({operation:'build',title:'Counter',request:'Counter',acceptance:['Shows 0']}).success).toBe(true);
  expect(ownerAppBuildSchema.safeParse({operation:'build',title:'Counter',request:'Counter',acceptance:['Shows 0'],repository:'other/repo'}).success).toBe(false);
 });
 it('creates canonical Work on the bound repository and envelope, resumes it, then starts MyFactory once with its exact revision',async()=>{
  const s=store(),starts:unknown[]=[];
  const result=await startOwnerAppBuild(s as never,{operation:'build',title:'Counter',request:'A counter with a reset button',acceptance:['Shows 0 at start','+ adds one','Reset returns to 0']},
   profile,'call-1',async(_store,id,input)=>{starts.push({id,input});return {state:'DISPATCHED'};});
  const created=s.calls[0].value as Record<string,unknown>&{criteria:{method:string;statement:string}[]};
  expect(created.repository).toBe('owner/app');expect(created.maxCostUsd).toBe(1.35);expect(created.maxDurationSeconds).toBe(600);
  expect(created.criteria.map(c=>[c.method,c.statement])).toEqual([['test','Shows 0 at start'],['test','+ adds one'],['test','Reset returns to 0']]);
  expect(created.objective).toBe('A counter with a reset button\n\nPlatform: React 18 + Vite; tests use vitest.\nEditable files: src/App.jsx, src/App.test.jsx.');
  expect(created.idempotencyKey).toBe(buildIdempotencyKey('owner','call-1'));
  expect(s.calls[1].value).toEqual({operation:'resume',expectedVersion:1});
  expect(starts).toEqual([{id:result.workId,input:{operation:'start',expectedWorkVersion:2,expectedWorkGeneration:2}}]);
 });
 it('derives a stable idempotency key per owner and tool call',()=>{
  expect(buildIdempotencyKey('owner','call-1')).toBe(buildIdempotencyKey('owner','call-1'));
  expect(buildIdempotencyKey('owner','call-1')).not.toBe(buildIdempotencyKey('owner','call-2'));
  expect(buildIdempotencyKey('owner','call-1')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 });
});
describe('engineering_work create under the owner app switch',()=>{
 it('binds the repository and clamps cost and duration to the MyFactory LIVE envelope',async()=>{
  const {bindOwnerAppWork}=await import('./owner-app-build.ts');
  const create={title:'t',objective:'o',repository:'someone/else',criteria:[{id:randomUUID(),statement:'s',method:'test' as const}],maxCostUsd:20,maxDurationSeconds:3600,idempotencyKey:randomUUID()};
  expect(bindOwnerAppWork(create,profile)).toEqual({...create,repository:'owner/app',maxCostUsd:1.35,maxDurationSeconds:600});
  expect(bindOwnerAppWork({...create,maxCostUsd:0.5,maxDurationSeconds:300},profile)).toMatchObject({maxCostUsd:0.5,maxDurationSeconds:300});
 });
});
