import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,open,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {buildProductionBrowser} from './production-browser-build.mjs';
import {enterpriseBrowserEnvironment} from './enterprise-browser.mjs';
import {startBuiltAgent,stopOwnedProcess,requireAvailablePort} from './production-browser-runtime.mjs';
const execute=promisify(execFile);
/** Real password session and production artifact; deterministic model is an explicit source overlay. */
export async function startLocalOwnerJourney({source,owner,pool,output}){
 await mkdir(output,{recursive:true});const app=join(source,'apps/eve'),require=createRequire(join(source,'package.json'));
 const configFile=join(source,'runtime-browser-config.json'),password=randomBytes(24).toString('hex');
 const env=enterpriseBrowserEnvironment({source,owner,output,password,databaseUrl:'postgresql://postgres@localhost:55529/postgres',runtimeConfigFile:configFile});
 const build=await buildProductionBrowser({app,output,require,env});
 const log=await open(join(output,'server.log'),'wx'),session='myeve-owner-'+randomUUID(),checks=[];
 let agent,server;
 const cli=async(...args)=>(await execute('agent-browser',['--session',session,...args],{timeout:45000,maxBuffer:1024*1024})).stdout;
 const snapshot=()=>cli('snapshot','-c');
 const wait=async(test)=>{for(let n=0;n<90;n++){const text=(await cli('get','text','body'))+'\n'+await snapshot();if(test(text))return text;await new Promise(r=>setTimeout(r,300));}throw Error('MyEve owner UI did not reach expected state');};
 const send=async text=>{await cli('find','role','textbox','fill',text,'--name','Message Sofie','--exact');await cli('find','role','button','click','--name','Send','--exact');};
 const actions=async()=> (await pool.query("SELECT provider_receipt FROM action_requests WHERE owner_id=$1 AND trigger->>'kind'='owner_chat' AND capability_id='tool.mission_control' AND status='completed' ORDER BY created_at",[owner])).rows;
 try{
  await requireAvailablePort(3077);agent=await startBuiltAgent({entry:join(app,'.output/server/index.mjs'),app,env,log});
  server=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3077'],{cwd:app,env:{...env,NODE_ENV:'production'},stdio:['ignore',log.fd,log.fd]});
  for(let n=0;n<120;n++){try{if((await fetch('http://localhost:3077/login')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  assert.equal((await fetch('http://localhost:3077/api/threads')).status,401);checks.push('anonymous-owner-route-denied');
  await cli('open','http://localhost:3077/login?returnTo=/chat');
  await cli('find','label','Your access password','fill',password);await cli('find','role','button','click','--name','Open Sofie','--exact');
  await wait(t=>t.includes('Message Sofie'));await cli('find','role','button','click','--name','New conversation','--exact');checks.push('actual-password-owner-login');
 }catch(error){await cli('close').catch(()=>{});await stopOwnedProcess(server);await stopOwnedProcess(agent);await log.close();throw error;}
 const commands=[];
 return {
  async command(input,binding){
   await writeFile(configFile,JSON.stringify({...Object.fromEntries(Object.entries(process.env).filter(([key])=>key.startsWith('MYEVE_MISSIONCONTROL_'))),MYEVE_MISSIONCONTROL_SECRET:binding.secret,MYEVE_MISSIONCONTROL_CONNECTION_ID:binding.connectionId}),{mode:0o600});
   await writeFile(join(output,'tool-input.json'),JSON.stringify(input));const before=(await actions()).length;
   await send(input.operation==='enterprise.propose'?'Build an Agentic HR platform':input.operation==='enterprise.submit'?'Create this owner-authorized Mission draft.':'Read the exact current Result and Proof.');
   let rows;for(let n=0;n<180;n++){rows=await actions();if(rows.length===before+1)break;assert.ok(rows.length<=before+1,'A UI send cannot execute twice');await new Promise(r=>setTimeout(r,200));}
   assert.equal(rows.length,before+1,'Exactly one actual ActionGateway receipt per UI send');
   await wait(t=>!t.includes('button "Stop"'));const receipt=rows.at(-1).provider_receipt;
   commands.push({operation:input.operation,commandId:receipt.authentication.commandId,missionId:receipt.response.missionId??null,proposalId:receipt.response.proposalId??null,status:receipt.response.status??null});
   await writeFile(join(output,'commands.json'),JSON.stringify(commands,null,2)+'\n');
   await cli('screenshot',join(output,'command-'+commands.length+'.png'),'--full');
   await cli('reload');await wait(t=>t.includes('Deterministic Sofie readback'));checks.push('durable-reconnect-'+input.operation);
   return receipt;
  },
  async result(input,binding){const receipt=await this.command(input,binding);assert.equal(receipt.response.status,'AVAILABLE');assert.equal(receipt.response.missionId,input.missionId);checks.push('same-Mission-Result-and-Proof-visible');return receipt;},
  report(){return {status:commands.length>=3&&checks.includes('same-Mission-Result-and-Proof-visible')?'PASS':'INCOMPLETE',authentication:'ACTUAL_MYEVE_PASSWORD_SESSION',model:'DETERMINISTIC_FIXTURE',build,checks,commands,paidOperations:0,hostedClerk:'NOT_RUN'};},
  async stop(){try{await cli('close');}finally{await stopOwnedProcess(server);await stopOwnedProcess(agent);await log.close();await writeFile(join(output,'report.json'),JSON.stringify(this.report(),null,2)+'\n');}}
 };
}
