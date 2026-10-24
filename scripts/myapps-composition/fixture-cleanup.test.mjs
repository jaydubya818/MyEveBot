/** Actual fixture close body with synthetic pools/admin/error events only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./current-runtime-fixture.ts',import.meta.url),'utf8');
const start=source.indexOf(' async function close(){'),end=source.indexOf('\n try{\n  const cluster=',start);
assert(start>0&&end>start);
const body=source.slice(start,end).replaceAll(':unknown[]','').replaceAll(':any[]','');
function fixture({poolLate=false,adminLate=false,poolFailure=false,adminFailure=false,unknownCreate=false,sticky=false}={}){
 const asynchronousErrors=[],calls=[],created=[{name:'ea_work_'+'a'.repeat(32),created:!unknownCreate,creationUnknown:unknownCreate,
  pool:{async end(){calls.push('pool.end');if(poolLate)asynchronousErrors.push(Error('late-pool'));if(poolFailure)throw Error('pool-end');}}}];
 const admin={async end(){calls.push('admin.end');if(adminLate)asynchronousErrors.push(Error('late-admin'));if(adminFailure)throw Error('admin-end');},
  async query(sql){calls.push(sql);return {rows:sticky?[{pid:123}]:[]};}};
 const context=vm.createContext({assert,created,admin,asynchronousErrors,pause:async()=>{},identity:async()=>{calls.push('identity');}});
 const close=vm.runInContext(body+'\nclose',context);return {close,calls};
}
test('ordinary fixture cleanup waits pools, then nonforce DROP, then admin close',async()=>{const f=fixture();const result=await f.close();assert.equal(result.asynchronousErrors,0);assert(f.calls.indexOf('pool.end')<f.calls.findIndex(x=>x.startsWith('DROP DATABASE')));assert.equal(f.calls.at(-1),'admin.end');});
for(const [name,options] of [['late pool event',{poolLate:true}],['late admin event',{adminLate:true}],['pool end rejection',{poolFailure:true}],['late event plus admin rejection',{poolLate:true,adminFailure:true}]])
 test(name+' never becomes cleanup success',async()=>{const f=fixture(options);await assert.rejects(f.close(),/cleanup failed/);assert(f.calls.includes('admin.end'));});
test('unknown database creation acknowledgement is never force-dropped',async()=>{const f=fixture({unknownCreate:true});await assert.rejects(f.close());assert(!f.calls.some(x=>x.startsWith('DROP')));});
test('live clients leave the exact database retained without foreign termination',async()=>{const f=fixture({sticky:true});await assert.rejects(f.close());assert(!f.calls.some(x=>/DROP|terminate|FORCE/.test(x)));});
