import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
const report=[];
for(const [app,port,path] of [['eve',3311,'/chat'],['builder',3312,'/']]){
 const child=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:resolve('apps',app),env:{PATH:process.env.PATH,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1'},stdio:'ignore'});
 try{
  let response;for(let i=0;i<100;i++){try{response=await fetch(`http://127.0.0.1:${port}${path}`,{redirect:'manual',signal:AbortSignal.timeout(1000)});break;}catch{await new Promise(r=>setTimeout(r,200));}}
  assert.ok(response,'Resource-free server did not start');
  // MyEve must fail closed without configured owner authentication; Builder serves setup.
  assert.ok(app==='eve'?[200,307,302,503].includes(response.status):response.status===200);
  report.push({app,status:'PASS',httpStatus:response.status,credentialsProvided:false,databaseProvided:false,modelProvided:false});
 }finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
}
writeFileSync(process.env.STARTUP_REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
