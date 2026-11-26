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
 const cli=async(...args)=>{try{return (await execute('agent-browser',['--session',session,...args],{timeout:45000,maxBuffer:1024*1024})).stdout;}catch(error){if(args.includes(password))throw Error('Owner login input failed; credential redacted');throw error;}};
 const snapshot=()=>cli('snapshot','-c');
 const wait=async(test)=>{for(let n=0;n<90;n++){let text='';try{text=(await cli('get','text','body'))+'\n'+await snapshot();}catch(error){if(!/Element not found: body\b/.test(String(error.stderr??error.message)))throw error;}if(test(text))return text;await new Promise(r=>setTimeout(r,300));}throw Error('MyEve owner UI did not reach expected state');};
 const send=async text=>{await cli('find','role','textbox','fill',text,'--name','Message Sofie','--exact');await cli('find','role','button','click','--name','Send','--exact');};
 const actions=async()=> (await pool.query("SELECT id,trigger->>'id' AS session_id,provider_receipt FROM action_requests WHERE owner_id=$1 AND trigger->>'kind'='owner_chat' AND capability_id='tool.mission_control' AND status='completed' ORDER BY created_at",[owner])).rows;
 try{
  await requireAvailablePort(3077);agent=await startBuiltAgent({entry:join(app,'.output/server/index.mjs'),app,env,log});
  server=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3077'],{cwd:app,env:{...env,NODE_ENV:'production'},stdio:['ignore',log.fd,log.fd]});
  for(let n=0;n<120;n++){try{if((await fetch('http://localhost:3077/login')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  assert.equal((await fetch('http://localhost:3077/api/threads')).status,401);checks.push('anonymous-owner-route-denied');
  await cli('open','http://localhost:3077/login?returnTo=/chat');
  await cli('find','label','Your access password','fill',password);await cli('find','role','button','click','--name','Open Sofie','--exact');
  await wait(t=>t.includes('Message Sofie'));await cli('find','role','button','click','--name','New conversation','--exact');checks.push('actual-password-owner-login');
 }catch(error){await cli('close').catch(()=>{});await stopOwnedProcess(server);await stopOwnedProcess(agent);await log.close();throw error;}
 const commands=[];let ownerHandoff;
 return {
  ownerHandoff(){assert.ok(ownerHandoff,'Actual MyEve owner link must be observed');return ownerHandoff;},
  async command(input,binding){
   await writeFile(configFile,JSON.stringify({...Object.fromEntries(Object.entries(process.env).filter(([key])=>key.startsWith('MYEVE_MISSIONCONTROL_'))),MYEVE_MISSIONCONTROL_SECRET:binding.secret,MYEVE_MISSIONCONTROL_CONNECTION_ID:binding.connectionId}),{mode:0o600});
   await writeFile(join(output,'tool-input.json'),JSON.stringify(input));const before=(await actions()).length;
   await send(input.operation==='enterprise.propose'?'Build an Agentic HR platform':input.operation==='enterprise.submit'?'Create this owner-authorized Mission draft.':'Read the exact current Result and Proof.');
   let rows;for(let n=0;n<180;n++){rows=await actions();if(rows.length===before+1)break;assert.ok(rows.length<=before+1,'A UI send cannot execute twice');await new Promise(r=>setTimeout(r,200));}
   assert.equal(rows.length,before+1,'Exactly one actual ActionGateway receipt per UI send');
   await wait(t=>!t.includes('button "Stop"'));const receipt=rows.at(-1).provider_receipt;
   const sessionId=rows.at(-1).session_id;assert.ok(sessionId,'Actual browser Action requires its durable session identity');
   if(commands.length)assert.equal(sessionId,commands[0].sessionId,'Reconnect must keep the same actual browser conversation');
   if(input.operation==='enterprise.propose') {
     ownerHandoff=(await cli('get','attr','a[href^="http://localhost:5188/v2/missions"]','href')).trim();
     const url=new URL(ownerHandoff);
     assert.equal(url.searchParams.get('proposal'),receipt.response.proposalId);
     assert.equal(url.searchParams.get('proposalDigest'),receipt.response.digest);
     assert.equal(url.searchParams.get('workspace'),process.env.MYEVE_MISSIONCONTROL_PROJECT_ID);
     checks.push('actual-MyEve-owner-handoff-link-bound');
   }
   // Intake acknowledgments use the request-side signed command and durable Action ID.
   // Only Result observations carry a response authentication envelope.
   if(input.operation==='enterprise.result')assert.ok(receipt.authentication?.commandId,'Result response authentication is required');
   commands.push({operation:input.operation,actionId:rows.at(-1).id,sessionId,commandId:receipt.authentication?.commandId??null,missionId:receipt.response.missionId??null,proposalId:receipt.response.proposalId??null,status:receipt.response.status??null,ownerAcceptance:receipt.response.ownerAcceptance??null});
   await writeFile(join(output,'commands.json'),JSON.stringify(commands,null,2)+'\n');
   await cli('screenshot',join(output,'command-'+commands.length+'.png'),'--full');
   await cli('reload');await wait(t=>t.includes('Deterministic Sofie readback'));checks.push('durable-reconnect-'+input.operation);
   return receipt;
  },
  async result(input,binding){
    const receipt=await this.command(input,binding),result=receipt.response;
    assert.equal(result.status,'AVAILABLE');assert.equal(result.missionId,input.missionId);
    await wait(text=>text.includes('Enterprise Result and Proof')&&text.includes('Mission '+input.missionId)&&text.includes('Recorded owner acceptance: '+result.ownerAcceptance));
    await cli('find','last','[aria-label="Enterprise Result and Proof"] summary','click');
    await wait(text=>result.workOrders.every(work=>text.includes('WorkOrder: '+work.workOrderId)&&text.includes('Candidate: '+work.candidate)&&text.includes('Independent verifier: '+work.verificationAttemptId)&&text.includes('Evidence: '+work.evidenceSetDigest)&&text.includes('Proof: '+work.proofDigest)));
    await cli('screenshot',join(output,'visible-result-'+result.ownerAcceptance.toLowerCase()+'.png'),'--full');
    await writeFile(join(output,'visible-result-'+result.ownerAcceptance.toLowerCase()+'.txt'),await cli('get','text','body'));
    checks.push('same-Mission-Result-and-Proof-visible','visible-Result-and-Proof-'+result.ownerAcceptance);return receipt;
  },
  report(){return {status:commands.length>=3&&checks.includes('same-Mission-Result-and-Proof-visible')?'PASS':'INCOMPLETE',authentication:'ACTUAL_MYEVE_PASSWORD_SESSION',model:'DETERMINISTIC_FIXTURE',build,checks,commands,ownerHandoff,paidOperations:0,hostedClerk:'NOT_RUN'};},
  async stop(){try{await cli('close');}finally{await stopOwnedProcess(server);await stopOwnedProcess(agent);await log.close();await writeFile(join(output,'report.json'),JSON.stringify(this.report(),null,2)+'\n');}}
 };
}
