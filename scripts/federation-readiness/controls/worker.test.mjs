import assert from 'node:assert/strict';
import {test} from 'node:test';
import {supervise} from './worker.mjs';
const sha='a'.repeat(40),heartbeat=async()=>({sha,session:'synthetic-session',deadline:Date.now()/1000+60});
test('real local process receives TERM then forced KILL within bounded lifetime',async()=>{const start=Date.now();const result=await supervise({command:[process.execPath,'-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},100)"],cwd:'/private/tmp',environment:{},sourceSha:sha,heartbeat,lifetimeMs:100,killGraceMs:100,intervalMs:50});assert.equal(result.exited,true);assert.equal(result.stopped,true);assert.ok(Date.now()-start<2000);});
test('heartbeat failure stops the local child without restart',async()=>{let calls=0;const result=await supervise({command:[process.execPath,'-e','setInterval(()=>{},100)'],cwd:'/private/tmp',environment:{},sourceSha:sha,heartbeat:async()=>{if(calls++)throw Error();return heartbeat();},lifetimeMs:1000,killGraceMs:100,intervalMs:50});assert.equal(result.exited,true);assert.equal(result.stopped,true);});
test('provider and control credentials cannot enter worker environment',async()=>{await assert.rejects(supervise({command:['node'],environment:{FQ_CONTROL_DATABASE_URL:'synthetic'},sourceSha:sha,heartbeat}));});
