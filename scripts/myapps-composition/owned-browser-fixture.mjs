/** Qualification-only ownership: never discovers or stops resources it did not create.
 * @param {()=>Promise<void>} closeDatabase
 * @param {(owned:{server:(server:import('node:http').Server)=>import('node:http').Server,child:(child:import('node:child_process').ChildProcess)=>import('node:child_process').ChildProcess})=>Promise<void>} setup
 * @param {import('node:events').EventEmitter} signals
 */
export async function runOwnedBrowserFixture(closeDatabase, setup, signals=process) {
 const children=new Set(),servers=new Set();let stopping=false,failed;
 let rejectFailure,requestStop;
 const failure=new Promise((_,reject)=>{rejectFailure=reject;});
 const stopRequested=new Promise(resolve=>{requestStop=resolve;});
 const onSignal=()=>requestStop();
 const onFailure=error=>{if(!stopping)rejectFailure(error);};
 signals.once('SIGTERM',onSignal);signals.once('SIGINT',onSignal);
 const owned={
  server(server){servers.add(server);server.on('error',onFailure);return server;},
  child(child){
   children.add(child);child.on('error',onFailure);
   child.once('exit',(code,signal)=>onFailure(new Error(`Owned browser fixture child exited before shutdown: ${code??signal}`)));
   return child;
  },
 };
 const setupComplete=Promise.resolve().then(()=>setup(owned));
 try {
  await Promise.race([setupComplete,failure]);
  await Promise.race([stopRequested,failure]);
 } catch(error) {
  failed=error;
  // Setup owns resources until it settles; do not snapshot them while it can still register handles.
  await setupComplete.catch(()=>{});
 }
 stopping=true;
 signals.removeListener('SIGTERM',onSignal);signals.removeListener('SIGINT',onSignal);
 const stopped=await Promise.allSettled([
  ...[...children].map(child=>new Promise((resolve,reject)=>{
   if(!child.pid||child.exitCode!==null||child.signalCode!==null){resolve();return;}
   let timer;
   const done=()=>{clearTimeout(timer);resolve();};
   child.once('exit',done);child.kill('SIGTERM');
   timer=setTimeout(()=>{
    child.kill('SIGKILL');
    timer=setTimeout(()=>{child.removeListener('exit',done);reject(new Error('Owned browser fixture child did not stop'));},3000);
   },3000);
  })),
  ...[...servers].map(server=>new Promise((resolve,reject)=>{
   if(!server.listening){resolve();return;}
   server.close(error=>error?reject(error):resolve());server.closeAllConnections();
  })),
 ]);
 try {await closeDatabase();} catch(error) {stopped.push({status:'rejected',reason:error});}
 const cleanupFailures=stopped.filter(result=>result.status==='rejected').map(result=>result.reason);
 if(cleanupFailures.length)throw new AggregateError([...(failed?[failed]:[]),...cleanupFailures],'Browser fixture failed to clean owned resources');
 if(failed)throw failed;
}
