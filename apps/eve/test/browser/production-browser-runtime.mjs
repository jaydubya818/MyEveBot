import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {writeSync} from 'node:fs';

export async function requireAvailablePort(port) {
  const probe=createServer();
  await new Promise((resolve,reject)=>{
    probe.once('error',reject);
    probe.listen({host:'127.0.0.1',port,exclusive:true},()=>probe.close(resolve));
  });
}

export async function stopOwnedProcess(child) {
  if(!child?.pid)return;
  if(child.exitCode!==null||child.signalCode!==null) {
    if(child.stdout&&!child.stdout.destroyed)await new Promise(resolve=>child.once('close',resolve));
    return;
  }
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{if(!child.kill('SIGKILL'))reject(Error('Owned process did not terminate'));},10000);
    const done=()=>{clearTimeout(timer);resolve();};
    child.once('close',done);child.once('error',error=>{clearTimeout(timer);reject(error);});child.kill('SIGTERM');
  });
}

/** Readiness must come from this child's successful bind, never an existing service. */
export async function startBuiltAgent({entry,app,env,log,port=4274,onSpawn}) {
  await requireAvailablePort(port);
  const child=spawn(process.execPath,[entry],{cwd:app,env:{...env,NODE_ENV:'production',HOST:'127.0.0.1',NITRO_HOST:'127.0.0.1',PORT:String(port),NITRO_PORT:String(port)},stdio:['ignore','pipe',log.fd]});
  onSpawn?.(child);
  let pending='';
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>done(Error('Owned production agent readiness timed out')),90000);
      const failed=()=>done(Error('Owned production agent exited before readiness'));
      const done=error=>{clearTimeout(timer);child.off('error',failed);child.off('exit',failed);error?reject(error):resolve();};
      child.once('error',failed);child.once('exit',failed);
      child.stdout.on('data',bytes=>{
        writeSync(log.fd,bytes);pending=(pending+bytes.toString('utf8')).slice(-4096);
        if(pending.split('\n').some(line=>[`➜ Listening on: http://127.0.0.1:${port}`,`➜ Listening on: http://127.0.0.1:${port}/`].includes(line.trim())))done();
      });
    });
    if(child.exitCode!==null||child.signalCode!==null)throw Error('Owned production agent is no longer running');
    return child;
  } catch(error){await stopOwnedProcess(child);throw error;}
}
