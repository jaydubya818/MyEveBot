import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanupAccountingUpgrade} from '../../packages/myapps/qualification/accounting-upgrade-cleanup.ts';

const name='myapps_accounting_upgrade_'+'a'.repeat(32);
function fixture({rows=()=>[],poolError,queryError,dropError,adminError}={}){
 const calls=[];
 const pool={async end(){calls.push('pool.end');if(poolError)throw poolError;}};
 const admin={async query(sql,params){
  calls.push({sql,params});
  if(sql.startsWith('SELECT')){if(queryError)throw queryError;return {rows:rows()};}
  if(dropError)throw dropError;return {rows:[]};
 },async end(){calls.push('admin.end');if(adminError)throw adminError;}};
 return {pool,admin,calls};
}
const drops=f=>f.calls.filter(c=>typeof c==='object'&&c.sql.startsWith('DROP'));

test('clients end before exact-name quiescence and nonforce DROP',async()=>{
 let reads=0;const f=fixture({rows:()=>++reads===1?[{pid:42}]:[]});
 await cleanupAccountingUpgrade({...f,name,created:true});
 assert.equal(f.calls[0],'pool.end');assert.equal(f.calls.at(-1),'admin.end');
 const observations=f.calls.filter(c=>typeof c==='object'&&c.sql.startsWith('SELECT'));
 assert.equal(observations.length,2);
 for(const item of observations)assert.deepEqual(item.params,[name]);
 assert.deepEqual(drops(f),[{sql:'DROP DATABASE '+name,params:undefined}]);
 assert.doesNotMatch(JSON.stringify(f.calls),/FORCE|terminate_backend/);
});
test('unproven quiescence retains the database and still closes admin',async()=>{
 const f=fixture({rows:()=>[{pid:42}]});
 await assert.rejects(cleanupAccountingUpgrade({...f,name,created:true}),/not quiescent; database retained/);
 assert.equal(drops(f).length,0);assert.equal(f.calls.at(-1),'admin.end');
 assert.equal(f.calls.filter(c=>typeof c==='object').length,100);
});
for(const kind of ['poolError','queryError'])test(`${kind} prevents DROP and preserves its error`,async()=>{
 const original=new Error(kind),f=fixture({[kind]:original});
 await assert.rejects(cleanupAccountingUpgrade({...f,name,created:true}),error=>error===original);
 assert.equal(drops(f).length,0);assert.equal(f.calls.at(-1),'admin.end');
});
test('primary failure and DROP failure remain independently visible',async()=>{
 const first=new Error('financial assertion'),cleanup=new Error('drop failed'),f=fixture({dropError:cleanup});
 await assert.rejects(cleanupAccountingUpgrade({...f,name,created:true,primaryFailure:{error:first}}),
  error=>error instanceof AggregateError&&error.errors[0]===first&&error.errors[1]===cleanup);
 assert.equal(f.calls.at(-1),'admin.end');
});
test('admin close failure does not replace the primary failure',async()=>{
 const first=new Error('first'),cleanup=new Error('admin close'),f=fixture({adminError:cleanup});
 await assert.rejects(cleanupAccountingUpgrade({...f,name,created:true,primaryFailure:{error:first}}),
  error=>error instanceof AggregateError&&error.errors[0]===first&&error.errors[1]===cleanup);
});
test('failed CREATE grants no database-drop authority and keeps the first error',async()=>{
 const first=new Error('create denied'),f=fixture();
 await assert.rejects(cleanupAccountingUpgrade({...f,name,created:false,primaryFailure:{error:first}}),error=>error===first);
 assert.deepEqual(f.calls,['pool.end','admin.end']);
});
test('foreign database names never reach observation or DROP',async()=>{
 const f=fixture();
 await assert.rejects(cleanupAccountingUpgrade({...f,name:'unrelated_database',created:true}),/Unexpected fixture database/);
 assert.deepEqual(f.calls,['pool.end','admin.end']);
});
