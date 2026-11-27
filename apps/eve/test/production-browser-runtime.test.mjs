import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,open,rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {requireAvailablePort,startBuiltAgent,stopOwnedProcess} from './browser/production-browser-runtime.mjs';

test('production agent rejects occupied ports, attributes readiness to owned child and cleans up failures',async()=>{
  const root=await mkdtemp(join(tmpdir(),'production-agent-')),entry=join(root,'agent.cjs'),log=await open(join(root,'server.log'),'w');
  const existing=createServer(socket=>socket.end());let child;
  try {
    await new Promise(resolve=>existing.listen(0,'127.0.0.1',resolve));const port=existing.address().port;
    await writeFile(entry,`const s=require('http').createServer((q,r)=>r.end('owned'));s.listen(Number(process.env.PORT),'127.0.0.1',()=>console.log('➜ Listening on: http://127.0.0.1:'+process.env.PORT));process.once('SIGTERM',()=>{process.stdout.write('SHUTDOWN_OUTPUT'+'.'.repeat(65536));process.exit(0);});`);
    await assert.rejects(()=>startBuiltAgent({entry,app:root,env:{},log,port}),{code:'EADDRINUSE'});
    assert.ok(existing.listening,'Unrelated service must not be adopted or terminated');
    await new Promise(resolve=>existing.close(resolve));
    child=await startBuiltAgent({entry,app:root,env:{},log,port});
    assert.ok(child.pid);assert.equal(await(await fetch(`http://127.0.0.1:${port}`)).text(),'owned');
    let stdioClosed=false;child.once('close',()=>{stdioClosed=true;});
    await stopOwnedProcess(child);assert.equal(stdioClosed,true,'Cleanup must wait for exit and stdio drain before closing the shared log');
    assert.match(await readFile(join(root,'server.log'),'utf8'),/SHUTDOWN_OUTPUT/);await requireAvailablePort(port);
    await writeFile(entry,'process.exit(7);');
    await assert.rejects(()=>startBuiltAgent({entry,app:root,env:{},log,port}),/exited before readiness/);
    await requireAvailablePort(port);
  } finally {await stopOwnedProcess(child);if(existing.listening)await new Promise(resolve=>existing.close(resolve));await log.close();await rm(root,{recursive:true,force:true});}
});
