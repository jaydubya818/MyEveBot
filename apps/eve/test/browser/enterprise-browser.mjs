import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,open} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
let warmed;
async function close(state) {
  if(!state)return;
  await state.browser?.close();state.server.kill('SIGTERM');
  if(state.server.exitCode===null&&state.server.signalCode===null)await new Promise(r=>state.server.once('exit',r));
  await state.log.close();
}
export async function closeWarmSofieBrowser(){const state=warmed;warmed=undefined;await close(state);}
async function start({source,owner,databaseUrl='postgresql://postgres@localhost:55529/postgres'}) {
  const output=resolve(process.env.MC_COMPOSED_BROWSER_OUTPUT),app=join(source,'apps/eve');await mkdir(output,{recursive:true});
  const require=createRequire(join(source,'package.json')),password=randomBytes(24).toString('hex');
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|HOME|TMPDIR|NODE_PATH|EVE_ENABLED_FEATURES|MYEVE_MISSIONCONTROL_.*)$/.test(key)));
  Object.assign(env,{MYEVE_TEST_DATABASE_URL:databaseUrl,DATABASE_URL:databaseUrl,MYEVE_OWNER_ID:owner,
    OWNER_NAME:'Qualification Owner',NEXT_PUBLIC_OWNER_NAME:'Qualification Owner',NEXT_PUBLIC_AGENT_NAME:'Sofie',MYEVE_ENGINEERING_MODE:'dogfood',
    MYEVE_ACCESS_PASSWORD:password,MYEVE_SESSION_SECRET:randomBytes(32).toString('hex'),MC_COMPOSED_BROWSER_INPUT:join(output,'tool-input.json'),
    MC_COMPOSED_BROWSER_CONFIG_FILE:join(source,'runtime-browser-config.json'),NODE_OPTIONS:'--require='+join(app,'test/browser/local-transport.cjs'),NEXT_TELEMETRY_DISABLED:'1',DO_NOT_TRACK:'1'});
  const log=await open(join(output,'server.log'),'wx');
  const server=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port','3077'],{cwd:app,env,stdio:['ignore',log.fd,log.fd]});
  const state={output,require,log,server,posts:[],checks:[]};
  try {
    for(let n=0;;n++){if(server.exitCode!==null)throw Error('Browser server exited');try{if((await fetch('http://localhost:3077/login',{signal:AbortSignal.timeout(5000)})).ok)break;}catch{}if(n===180)throw Error('Browser server unavailable');await new Promise(r=>setTimeout(r,500));}
    state.browser=await chromium.launch({headless:true});state.context=await state.browser.newContext({viewport:{width:1280,height:900}});state.page=await state.context.newPage();
    state.page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname.startsWith('/eve/v1/session'))state.posts.push(new URL(r.url()).pathname);});
    assert.equal((await state.context.request.get('http://localhost:3077/api/threads')).status(),401);state.checks.push('anonymous-owner-route-denied');
    await state.page.goto('http://localhost:3077/login?returnTo=/chat');await state.page.getByLabel('Your access password').fill(password);
    await state.page.getByRole('button',{name:'Open Sofie',exact:true}).click();await state.page.waitForURL(u=>u.pathname==='/chat',{timeout:60000});
    assert.ok((await state.context.cookies()).some(c=>c.name==='myeve_session'&&c.httpOnly));state.checks.push('actual-password-login-issued-httpOnly-session');
    await state.page.getByRole('textbox',{name:'Message Sofie',exact:true}).waitFor({timeout:60000});
    return state;
  } catch(error){await close(state);throw error;}
}
/** Authentication and compilation occur before production of short-lived verification evidence. */
export async function warmSofieBrowser(options){assert.equal(warmed,undefined);warmed=await start(options);}
export async function qualifySofieBrowser({source,pool,input,owner,databaseUrl}) {
  const output=resolve(process.env.MC_COMPOSED_BROWSER_OUTPUT);await mkdir(output,{recursive:true});
  await writeFile(join(output,'tool-input.json'),JSON.stringify(input));
  const report={schema:'checkpoint-h-enterprise-browser/v1',status:'IN_PROGRESS',checks:[],model:'DETERMINISTIC_FIXTURE',ownerAuthorizationUI:'NOT_IMPLEMENTED',fullJourney:'NOT_RUN',remaining:['Owner proposal authorization and acceptance browser path unresolved','Proposal and completed Result fixtures are separate Missions','Deterministic model output does not qualify live model behavior'],paidOperations:0};
  let state;
  const audit=async()=>{await state.page.addScriptTag({path:state.require.resolve('axe-core/axe.min.js')});return state.page.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length})),passes:r.passes.length};});};
  try {
    state=warmed??await start({source,owner,databaseUrl});warmed=undefined;const {page}=state;report.checks.push(...state.checks);
    await page.getByRole('button',{name:'New conversation',exact:true}).click();
    const send=async text=>{await page.getByRole('textbox',{name:'Message Sofie',exact:true}).fill(text);await page.getByRole('button',{name:'Send',exact:true}).click();};
    const marker='Deterministic Sofie readback from the actual tool:';
    await send(input.operation==='enterprise.propose'?'Build an Agentic HR platform':'Read the completed enterprise Result and its Proof for this Mission.');
    await page.getByText(marker,{exact:false}).first().waitFor({timeout:90000});
    const cardName=input.operation==='enterprise.result'?'Enterprise Result and Proof':'Enterprise Mission proposal';
    await page.getByRole('region',{name:cardName}).first().waitFor();report.checks.push('actual-tool-structured-evidence-rendered');
    await page.getByRole('button',{name:'Stop',exact:true}).waitFor({state:'hidden',timeout:45000});await page.waitForTimeout(500);
    await page.screenshot({path:join(output,'result-desktop.png'),fullPage:true});
    await page.reload();await page.getByText(marker,{exact:false}).first().waitFor({timeout:45000});report.checks.push('durable-same-conversation-reload');
    await send(input.operation==='enterprise.propose'?'Inspect this same enterprise proposal again.':'Re-read current Result evidence after reconnect.');
    await page.waitForFunction(marker=>document.body.innerText.split(marker).length>=3,marker,{timeout:90000});
    assert.equal(state.posts.filter(p=>p==='/eve/v1/session').length,1);assert.ok(state.posts.some(p=>/^\/eve\/v1\/session\/[^/]+$/.test(p)));
    report.checks.push('same-conversation-follow-up-after-reconnect');
    const sessionId=state.posts.find(p=>/^\/eve\/v1\/session\/[^/]+$/.test(p)).split('/').at(-1);
    const actions=(await pool.query("SELECT provider_receipt FROM action_requests WHERE owner_id=$1 AND trigger->>'kind'='owner_chat' AND trigger->>'id'=$2 AND capability_id='tool.mission_control' AND status='completed' ORDER BY created_at",[owner,sessionId])).rows;
    report.ownerActions=actions.length;report.sessionId=sessionId;assert.equal(actions.length,2,'Exactly two actual browser observations; direct API fixtures are excluded');
    if(input.operation==='enterprise.result') {
      report.observations=actions.map(a=>{const e=a.provider_receipt,r=e.response;assert.equal(r.missionId,input.missionId);assert.equal(r.plan.planDigest,input.expectedPlanDigest);return {commandId:e.authentication.commandId,missionId:r.missionId,status:r.status,observedAt:r.observedAt,freshUntil:r.freshUntil};});
      assert.equal(new Set(report.observations.map(o=>o.commandId)).size,report.observations.length);
      report.completedResultVisible=report.observations.every(o=>o.status==='AVAILABLE'&&o.freshUntil>o.observedAt);
    } else {report.proposalVisible=true;assert.ok(actions.every(a=>a.provider_receipt.response.proposal?.title===input.proposal.title));}
    report.accessibility=await audit();await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(output,'result-mobile.png'),fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));report.checks.push('mobile-horizontal-reflow');
    report.status=report.accessibility.violations.length||!(report.completedResultVisible||report.proposalVisible)?'PARTIAL':'PASS';
  } catch(error){report.status='FAIL';report.error=String(error);if(state?.page){report.failureText=await state.page.locator('body').innerText().catch(()=>'');report.accessibility=await audit().catch(()=>({status:'NOT_RUN'}));await state.page.screenshot({path:join(output,'failure.png'),fullPage:true}).catch(()=>{});}}
  finally {report.sessionRequests=state?.posts??[];await close(state);await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
  return report;
}
