import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freezeDatabase,verifyDatabaseBrake} from './database-brake.mjs';
const target={component:'myeve',database:'fq_myeve_6384519e0e01',applicationRole:'fq_myeve_6384519e0e01_app'};
test('only fixed synthetic role is frozen; no table writes or database destruction',async()=>{
 const calls=[];const admin={async query(sql,args){calls.push([sql,args]);return {rows:[sql.includes('rolcanlogin')?{rolcanlogin:false}:{n:0}]};}};
 assert.equal(await freezeDatabase(admin,target),true);
 assert.equal(calls[0][0],'ALTER ROLE fq_myeve_6384519e0e01_app NOLOGIN PASSWORD NULL');
 assert.deepEqual(calls[1][1],[target.applicationRole]);
 assert(!calls.some(([sql])=>/DROP|DELETE|UPDATE|TRUNCATE/.test(sql)));
});
test('rejects production name or SQL interpolation before calling database',async()=>{
 for(const patch of [{database:'production'},{applicationRole:'owner'},{component:'myeve;DROP DATABASE x'}])
 await assert.rejects(freezeDatabase({query(){throw Error('Must not be called');}},{...target,...patch}),/Non-qualification/);
});
test('active login or session never counts as verified stop',async()=>{
 for(const [login,n] of [[true,0],[false,1]])assert.equal(await verifyDatabaseBrake({async query(sql){return {rows:[sql.includes('rolcanlogin')?{rolcanlogin:login}:{n}]};}},target),false);
});
