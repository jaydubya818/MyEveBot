import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,open,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {buildProductionBrowser} from './production-browser-build.mjs';
import {enterpriseBrowserEnvironment} from './enterprise-browser.mjs';
import {startBuiltAgent,stopOwnedProcess,requireAvailablePort} from './production-browser-runtime.mjs';
const execute=promisify(execFile);
/** Real password session and production artifact; deterministic model is an explicit source overlay. */
export async function startLocalOwnerJourney({source,owner,pool,databaseUrl,output}){
 await mkdir(output,{recursive:true});const app=join(source,'apps/eve'),require=createRequire(join(source,'package.json'));
 const browserProvenance=JSON.parse(await readFile(process.env.MC_OWNER_BROWSER_PROVENANCE,'utf8'));
 assert.equal(browserProvenance.schema,'owner-browser-provenance/v1');
 assert.equal(process.env.AGENT_BROWSER_EXECUTABLE_PATH,browserProvenance.browser.executable);
 assert.equal(process.env.MC_OWNER_BROWSER_CLI,browserProvenance.driver.launcher);
 const configFile=join(source,'runtime-browser-config.json'),password=randomBytes(24).toString('hex');
 const env=enterpriseBrowserEnvironment({source,owner,output,password,databaseUrl,runtimeConfigFile:configFile});
 const build=await buildProductionBrowser({app,output,require,env});
 const log=await open(join(output,'server.log'),'wx'),session='myeve-owner-'+randomUUID(),checks=[];
 let agent,server;
 const cli=async(...args)=>{try{return (await execute(process.execPath,[browserProvenance.driver.launcher,'--session',session,...args],{timeout:45000,maxBuffer:1024*1024})).stdout;}catch(error){if(args.includes(password))throw Error('Owner login input failed; credential redacted');throw error;}};
 const snapshot=()=>cli('snapshot','-c');
 const lastCard='Array.from(document.querySelectorAll(\'[aria-label="Enterprise Result and Proof"]\')).at(-1)';
 const cardText=async()=>JSON.parse(await cli('eval',`${lastCard}?.innerText ?? ""`));
 const waitCard=async test=>{for(let n=0;n<90;n++){const text=await cardText();if(test(text))return text;await new Promise(r=>setTimeout(r,300));}throw Error('The current Result card did not show its exact accepted Proof');};
 const wait=async(test)=>{for(let n=0;n<90;n++){let text='';try{text=(await cli('get','text','body'))+'\n'+await snapshot();}catch(error){if(!/Element not found: body\b/.test(String(error.stderr??error.message)))throw error;}if(test(text))return text;await new Promise(r=>setTimeout(r,300));}throw Error('MyEve owner UI did not reach expected state');};
 const send=async text=>{await cli('find','role','textbox','fill',text,'--name','Message Sofie','--exact');await cli('find','role','button','click','--name','Send','--exact');};
 const actions=async()=> (await pool.query("SELECT id,trigger->>'id' AS session_id,provider_receipt FROM action_requests WHERE owner_id=$1 AND trigger->>'kind'='owner_chat' AND capability_id='tool.mission_control' AND status='completed' ORDER BY created_at",[owner])).rows;
 try{
  await requireAvailablePort(3077);agent=await startBuiltAgent({entry:join(app,'.output/server/index.mjs'),app,env,log});
  server=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3077'],{cwd:app,env:{...env,NODE_ENV:'production'},stdio:['ignore',log.fd,log.fd]});
  let ready=false;for(let n=0;n<120;n++){if(server.exitCode!==null||agent.exitCode!==null)throw Error('Production owner browser or agent exited');try{if((await fetch('http://localhost:3077/login',{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
  assert.ok(ready,'Production owner browser server not ready');
  assert.equal((await fetch('http://localhost:3077/api/threads')).status,401);checks.push('anonymous-owner-route-denied');
  await cli('open','http://localhost:3077/login?returnTo=/chat');
  await new Promise((resolve,reject)=>{const child=execFile(process.execPath,[browserProvenance.driver.launcher,'--session',session,'batch','--bail','--json'],{timeout:45000,maxBuffer:1024*1024},error=>error?reject(Error('Owner login input failed; credential redacted')):resolve());child.stdin.on('error',()=>reject(Error('Owner login input failed; credential redacted')));child.stdin.end(JSON.stringify([['find','label','Your access password','fill',password],['find','role','button','click','--name','Open Sofie','--exact']]));});
  await wait(t=>t.includes('Message Sofie'));await cli('find','role','button','click','--name','New conversation','--exact');checks.push('actual-password-owner-login');
 }catch(error){await cli('close').catch(()=>{});await stopOwnedProcess(server);await stopOwnedProcess(agent);await log.close();throw error;}
 const commands=[];let ownerHandoff;
 return {
  ownerHandoff(){assert.ok(ownerHandoff,'Actual MyEve owner link must be observed');return ownerHandoff;},
  async command(input,binding,{deferReadback=false}={}){
   await writeFile(configFile,JSON.stringify({...Object.fromEntries(Object.entries(process.env).filter(([key])=>key.startsWith('MYEVE_MISSIONCONTROL_'))),MYEVE_MISSIONCONTROL_SECRET:binding.secret,MYEVE_MISSIONCONTROL_CONNECTION_ID:binding.connectionId}),{mode:0o600});
   await writeFile(join(output,'tool-input.json'),JSON.stringify(input));const before=(await actions()).length;
   await send(input.operation==='enterprise.propose'?'Build an Agentic HR platform':input.operation==='enterprise.submit'?'Create this owner-authorized Mission draft.':'Read the exact current Result and Proof.');
   let rows;for(let n=0;n<180;n++){rows=await actions();if(rows.length===before+1)break;assert.ok(rows.length<=before+1,'A UI send cannot execute twice');await new Promise(r=>setTimeout(r,200));}
   assert.equal(rows.length,before+1,'Exactly one actual ActionGateway receipt per UI send');
   if(!deferReadback)await wait(t=>!t.includes('button "Stop"'));const receipt=rows.at(-1).provider_receipt;
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
   commands.push({operation:input.operation,actionId:rows.at(-1).id,sessionId,commandId:receipt.authentication?.commandId??null,missionId:receipt.response.missionId??null,proposalId:receipt.response.proposalId??null,status:receipt.response.status??null,ownerAcceptance:receipt.response.ownerAcceptance??null,observedAt:receipt.observedAt??null,freshUntil:receipt.response.freshUntil??null});
   await writeFile(join(output,'commands.json'),JSON.stringify(commands,null,2)+'\n');
   if(deferReadback)return receipt;
   await cli('screenshot',join(output,'command-'+commands.length+'.png'),'--full');
   await cli('reload');await wait(t=>t.includes('Deterministic Sofie readback'));checks.push('durable-reconnect-'+input.operation);
   return receipt;
  },
  async result(input,binding,{deferReadback=false}={}){
    const receipt=await this.command(input,binding,{deferReadback}),result=receipt.response;
    assert.equal(result.status,'AVAILABLE');assert.equal(result.missionId,input.missionId);
    await waitCard(text=>text.includes('Enterprise Result and Proof')&&text.includes('Mission '+input.missionId)&&text.includes('Recorded owner acceptance: '+result.ownerAcceptance));
    if(deferReadback){
      assert.equal(result.ownerAcceptance,'PENDING');
      checks.push('same-Mission-Result-and-Proof-visible','visible-Result-and-Proof-PENDING','pending-Result-visible-before-owner-acceptance');
      return receipt;
    }
    await cli('find','last','[aria-label="Enterprise Result and Proof"] summary','click');
    const proofText=await waitCard(text=>text.includes('Recorded owner acceptance: ACCEPTED')&&result.workOrders.every(work=>text.includes('WorkOrder: '+work.workOrderId)&&text.includes('Candidate: '+work.candidate)&&text.includes('Independent verifier: '+work.verificationAttemptId)&&text.includes('Evidence: '+work.evidenceSetDigest)&&text.includes('Proof: '+work.proofDigest)));
    let workStatus=0;for(let n=0;n<60;n++){workStatus=Number((await cli('eval','performance.getEntriesByType("resource").filter(r=>new URL(r.name).pathname==="/api/work-thread").at(-1)?.responseStatus ?? 0')).trim());if(workStatus)break;await new Promise(r=>setTimeout(r,100));}
    assert.equal(workStatus,200,'Canonical Work progress must read its real disposable datastore');
    assert.ok(!(await cli('get','text','body')).includes('Work progress could not be refreshed.'));
    checks.push('canonical-Work-progress-readback-without-error');
    await cli('eval',`${lastCard}?.scrollIntoView({block:"start"})`);
    await cli('screenshot',join(output,'visible-result-'+result.ownerAcceptance.toLowerCase()+'.png'),'--full');
    await writeFile(join(output,'visible-result-'+result.ownerAcceptance.toLowerCase()+'.txt'),proofText);
    checks.push('same-Mission-Result-and-Proof-visible','visible-Result-and-Proof-'+result.ownerAcceptance);return receipt;
  },
  report(){const accepted=commands.length===4&&commands.at(-1).status==='AVAILABLE'&&commands.at(-1).ownerAcceptance==='ACCEPTED'&&checks.includes('visible-Result-and-Proof-ACCEPTED')&&checks.includes('canonical-Work-progress-readback-without-error');const pending=commands.length===3&&commands.at(-1).status==='AVAILABLE'&&commands.at(-1).ownerAcceptance==='PENDING'&&checks.includes('pending-Result-visible-before-owner-acceptance');return {status:accepted?'PASS':pending?'PENDING_OWNER_ACCEPTANCE':'INCOMPLETE',authentication:'ACTUAL_MYEVE_PASSWORD_SESSION',model:'DETERMINISTIC_FIXTURE',build,browserProvenance,checks,commands,ownerHandoff,paidOperations:0,hostedClerk:'NOT_RUN'};},
  async stop(){try{await cli('close');}finally{await stopOwnedProcess(server);await stopOwnedProcess(agent);await log.close();await writeFile(join(output,'report.json'),JSON.stringify(this.report(),null,2)+'\n');}}
 };
}
