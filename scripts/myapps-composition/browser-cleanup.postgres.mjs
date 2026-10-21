import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {EventEmitter,once} from 'node:events';
import {createRequire} from 'node:module';
import {runOwnedBrowserFixture} from './owned-browser-fixture.mjs';

// Explicit gate after dependency installation, restricted to the dedicated disposable fixture.
assert.match(process.env.MYEVE_EXTERNAL_ALPHA_TEST_DATABASE??'',/^postgresql:\/\/ux_fixture:local-only@localhost:(55491|55591)\/blocker_fixes$/);
const {Env}=await import('../../apps/eve/lib/external-alpha/work-test-fixture.ts');
const {Pool}=createRequire(import.meta.url)('pg');
const admin=new Pool({connectionString:process.env.MYEVE_EXTERNAL_ALPHA_TEST_DATABASE});
const names=async()=> (await admin.query("SELECT datname FROM pg_database WHERE datname LIKE 'ea_work_%' ORDER BY datname")).rows.map(row=>row.datname);
const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});

test('all owned startup failures and signals clean only their fixture and retain failure status',async()=>{
 const before=await names(),sentinel=await Env.create(),unrelatedServer=createServer();await listen(unrelatedServer);
 try {
  for(const stage of ['setup','build','listen','spawn','early-exit','late-setup','signal','cleanup']){
   const e=await Env.create(),signals=new EventEmitter();let server,lateServer,child,closes=0,original;
   const cleanupError=new Error('injected cleanup failure');
   try {
    const run=runOwnedBrowserFixture(async()=>{closes++;await e.close();if(stage==='cleanup')throw cleanupError;},async owned=>{
     if(stage==='setup'||stage==='cleanup'){original=new Error('injected setup failure');throw original;}
     server=owned.server(createServer((_,res)=>res.end('owned')));
     if(stage==='listen'){
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(unrelatedServer.address().port,'127.0.0.1',resolve);});return;
     }
     await listen(server);
     if(stage==='spawn'){child=owned.child(spawn('/myapps-test-nonexistent-executable'));return;}
     child=owned.child(spawn(process.execPath,['-e',['early-exit','late-setup'].includes(stage)?'process.exit(23)':'setInterval(()=>{},1000)'],{stdio:'ignore'}));
     if(stage==='early-exit')return;
     if(stage==='late-setup'){
      await once(child,'exit');
      lateServer=owned.server(createServer());await listen(lateServer);return;
     }
     await once(child,'spawn');
     if(stage==='signal'){signals.emit('SIGTERM');return;}
     try{execFileSync(process.execPath,['-e','process.exit(17)'],{stdio:'ignore'});}catch(error){original=error;throw error;}
    },signals);
    if(stage==='signal')await run;
    else await assert.rejects(run,error=>{
     if(stage==='cleanup')return error instanceof AggregateError&&error.errors.includes(original)&&error.errors.includes(cleanupError);
     if(original)return error===original;
     if(stage==='listen')return error.code==='EADDRINUSE';
     if(stage==='spawn')return error.code==='ENOENT';
     return /exited before shutdown: 23/.test(error.message);
    });
    assert.equal(closes,1);assert.equal(server?.listening??false,false);assert.equal(lateServer?.listening??false,false);
    assert(!child?.pid||child.exitCode!==null||child.signalCode!==null,'Owned child must finish before cleanup returns');
    const after=await names();assert(!after.includes(e.name));assert(after.includes(sentinel.name),'Unrelated database must remain');
    assert.equal(unrelatedServer.listening,true,'Unrelated listener must remain');
    assert.equal(signals.listenerCount('SIGTERM'),0);assert.equal(signals.listenerCount('SIGINT'),0);
   } finally {
    // Test failure fallback still targets only this case's exact generated database/handles.
    if((await names()).includes(e.name))await e.close();
    child?.kill('SIGKILL');server?.closeAllConnections();server?.close();lateServer?.close();
   }
  }
 }finally{
  await new Promise(resolve=>unrelatedServer.close(resolve));await sentinel.close();
  assert.deepEqual(await names(),before);await admin.end();
 }
});
