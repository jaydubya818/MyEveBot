// Retained Claude independent journey, adapted and rerun by Codex for remediation.
// A rerun does not replace independent review of the final source SHAs.
// Runs against Codex's isolated runner (test/owner-journey/runner.ts) at the exact SHA under test,
// but adds what the Codex spec does not exercise:
//   - paid Sofie chat AFTER dispatch and AFTER completion (Checkpoint H blocker 1),
//   - natural-language follow-up (not the exact zero-cost readback phrase),
//   - duplicate start attempt (no second dispatch/execution),
//   - browser offline disconnect + reconnect,
//   - keyboard submission, document titles and axe on every owner surface at 1440/768/390,
//   - direct PostgreSQL accounting invariant check,
//   - measured latencies (deterministic fixture model; NOT live-model latency).
const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const {Pool}=require('pg');
const axe=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const EV=process.env.QE_EVIDENCE_DIR;
const FIX='http://127.0.0.1:3184';
const timings={};const findings=[];const t0={};
const start=k=>{t0[k]=Date.now();};const stop=k=>{timings[k]=Date.now()-t0[k];};
const note=(id,ok,detail)=>findings.push({id,ok,detail});
async function status(page){return (await page.request.get(FIX+'/fixture/status')).json();}
async function send(page,text){await page.getByRole('textbox',{name:'Message Sofie',exact:true}).fill(text);await page.getByRole('button',{name:'Send',exact:true}).click();}
async function failures(page){
 const {threads}=await (await page.request.get('/api/threads')).json();const out=[];
 for(const t of threads){const {chat}=await (await page.request.get(`/api/threads/${t.id}`)).json();for(const e of chat.events??[])if(e.type==='turn.failed')out.push({thread:t.id,error:e.error??e.message??e});}
 return out;
}
async function audit(page,label){
 const res={label,title:await page.title()};
 for(const width of [1440,768,390]){
  await page.setViewportSize({width,height:1000});
  await page.addScriptTag({content:axe});
  const a=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
  res['w'+width]={serious:a.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id),moderate:a.violations.filter(v=>v.impact==='moderate').map(v=>v.id),
   hscroll:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),
   landmarks:await page.evaluate(()=>({main:document.querySelectorAll('main,[role=main]').length,nav:document.querySelectorAll('nav,[role=navigation]').length,h1:document.querySelectorAll('h1').length}))};
 }
 await page.setViewportSize({width:1440,height:1000});
 return res;
}
async function accountingSnapshot(page){
 const fixture=await status(page);if(!/^ea_work_[a-f0-9]{32}$/.test(fixture.database))throw Error("Isolated fixture database required");
 const connection=process.env.MYEVE_EXTERNAL_ALPHA_TEST_DATABASE??'postgresql://ux_fixture:local-only@localhost:55491/blocker_fixes';
 if(!/^postgresql:\/\/ux_fixture:local-only@localhost:(55491|55591)\/blocker_fixes$/.test(connection))throw Error("Isolated fixture connection required");
 const url=new URL(connection);url.pathname="/"+fixture.database;const db={datname:fixture.database};
 const p=new Pool({connectionString:url.href});
 const q=async sql=>(await p.query(sql)).rows;
 const snap={database:db.datname,
  operations:await q("SELECT state,count(*)::int n FROM external_alpha_operation GROUP BY state ORDER BY state"),
  allowanceCols:await q("SELECT column_name FROM information_schema.columns WHERE table_name='external_alpha_allowance' ORDER BY ordinal_position"),
  results:await q("SELECT verdict,settlement_state,exposure_unknown,cleanup_confirmed FROM external_alpha_work_result"),
  authorities:await q("SELECT state FROM external_alpha_work_authority"),
  decisions:await q("SELECT action,count(*)::int n FROM engineering_owner_decisions GROUP BY action"),
  publications:await q("SELECT count(*)::int n FROM engineering_candidate_publications")};
 await p.end();return snap;
}
test.skip(process.env.MYEVE_OWNER_JOURNEY!=='1','Requires the isolated no-paid provider runner');
test('independent Golden Journey qualification',async({page,context})=>{
 test.setTimeout(1800000);
 await page.setViewportSize({width:1440,height:1000});
 // 1. First-time owner login -> Today
 start('login_to_today');
 await page.goto('/login');await page.getByLabel('Your access password').fill('synthetic-journey-owner');
 await page.getByRole('button',{name:'Open Sofie',exact:true}).click();await expect(page).toHaveURL(/\/today$/);
 stop('login_to_today');
 const a11y=[];a11y.push(await audit(page,'today-clean'));
 expect((await (await page.request.get('/api/work-inbox')).json()).works).toHaveLength(0);
 // 2. Sofie conversation; first message submitted by keyboard (Enter)
 await page.getByRole('navigation',{name:'Primary',exact:true}).getByRole('link',{name:'Sofie',exact:true}).click();
 a11y.push(await audit(page,'sofie-empty'));
 const box=page.getByRole('textbox',{name:'Message Sofie',exact:true});
 await box.focus();await box.fill('Add a Low / Medium / High Priority field to Alpha Tasks.');
 start('first_sofie_response');await page.keyboard.press('Enter');
 let keyboardSent=true;
 try{await expect(page.getByText('I created Add Priority to Alpha Tasks.',{exact:false})).toBeVisible({timeout:120000});}
 catch{keyboardSent=false;await page.getByRole('button',{name:'Send',exact:true}).click();await expect(page.getByText('I created Add Priority to Alpha Tasks.',{exact:false})).toBeVisible({timeout:120000});}
 stop('first_sofie_response');note('KEYBOARD_ENTER_SUBMITS',keyboardSent,keyboardSent?'Enter submitted the message':'Enter did not submit; Send button required');
 await expect(page.locator('.owner-work-summary')).toHaveCount(1);
 const workId=await page.locator('.owner-work-summary').getAttribute('data-work-id');
 const threadId=await page.locator('[data-thread-id]').getAttribute('data-thread-id');
 a11y.push(await audit(page,'sofie-with-work-card'));
 // 3. Work Detail, resume
 await page.getByRole('link',{name:'View Work',exact:false}).click();
 await expect(page.locator('.owner-status')).toHaveText('Stopped');
 a11y.push(await audit(page,'work-detail-stopped'));
 await page.getByRole('button',{name:'Resume Work',exact:true}).click();await expect(page.getByRole('button',{name:'Pause Work',exact:true})).toBeVisible();
 // 4. Continue in original conversation -> dispatch
 await page.getByRole('navigation',{name:'Primary',exact:true}).getByRole('link',{name:'Sofie',exact:true}).click();
 await expect(page.locator('[data-thread-id]')).toHaveAttribute('data-thread-id',threadId);
 await page.getByLabel('Request type').selectOption('continue');
 start('start_ack');await send(page,'Start this Work.');
 await expect(page.getByText('Your Work request is acknowledged.',{exact:false})).toBeVisible({timeout:120000});stop('start_ack');
 let s=await status(page);expect(s.dispatches).toBe(1);
 // 5. PAID chat after dispatch, before completion (Checkpoint H blocker 1)
 const callsBeforeMid=s.modelCalls;
 await page.getByLabel('Request type').selectOption('observe').catch(()=>{});
 start('paid_followup_mid');await send(page,'How is the Work going?');
 await expect.poll(async()=> (await status(page)).modelCalls,{timeout:90000}).toBeGreaterThan(callsBeforeMid);
 let midOk=true;
 await expect(page.getByText('The saved result is not yet available.',{exact:false})).toBeVisible({timeout:120000});
 stop('paid_followup_mid');
 s=await status(page);const midFail=await failures(page);
 note('PAID_CHAT_AFTER_DISPATCH',midOk&&midFail.length===0,{modelCallsDelta:s.modelCalls-callsBeforeMid,turnFailures:midFail});
 // 6. Duplicate start attempt must not redispatch
 await page.getByLabel('Request type').selectOption('continue').catch(()=>{});
 await send(page,'Start this Work.');await page.waitForTimeout(15000);
 s=await status(page);note('DUPLICATE_START_NO_REDISPATCH',s.dispatches===1&&s.executions<=1,{dispatches:s.dispatches,executions:s.executions});
 // 7. Factory completion (SYNTHETIC boundary: FakeFactory + buildSignedResult) and reconciliation
 start('completion_projection');
 expect((await page.request.post(FIX+'/fixture/complete')).ok()).toBeTruthy();
 await page.goto(`/work?kind=work&id=${workId}`);await expect(page.locator('.owner-status')).toHaveText('Verified candidate',{timeout:120000});stop('completion_projection');
 a11y.push(await audit(page,'work-detail-verified'));
 const proofText=await page.locator('main').innerText();
 note('UX_PROOF_SHOWS_PARTIAL_WITH_PASS',!/PARTIAL/.test(proofText),{excerpt:(proofText.match(/.{0,80}PARTIAL.{0,80}/)||[''])[0]});
 // 8. Needs You -> accept
 await page.getByRole('navigation',{name:'Primary',exact:true}).getByRole('link',{name:'Needs You',exact:true}).click();
 a11y.push(await audit(page,'needs-you-pending'));
 const accept=page.getByRole('button',{name:'Accept verified private Result',exact:true});
 await accept.dblclick().catch(async()=>accept.click());
 await expect(page.getByText('Your decision is saved.',{exact:false})).toBeVisible();
 s=await status(page);note('DOUBLE_CLICK_ACCEPT_SINGLE_DECISION',s.acceptances===1,{acceptances:s.acceptances});
 // 9. PAID natural-language follow-up after completion
 await page.getByRole('navigation',{name:'Primary',exact:true}).getByRole('link',{name:'Sofie',exact:true}).click();
 await expect(page.locator('[data-thread-id]')).toHaveAttribute('data-thread-id',threadId);
 const callsBeforeNat=s.modelCalls;
 const beforeNaturalReplies=await page.getByText('The saved result is accepted private Result; this Work is completed.',{exact:false}).count();
 start('paid_followup_after_completion');await send(page,'What changed?');
 await expect.poll(async()=> (await status(page)).modelCalls,{timeout:90000}).toBeGreaterThan(callsBeforeNat);
 const natOk=true;await expect.poll(()=>page.getByText('The saved result is accepted private Result; this Work is completed.',{exact:false}).count(),{timeout:120000}).toBeGreaterThan(beforeNaturalReplies);
 stop('paid_followup_after_completion');
 s=await status(page);const natFail=await failures(page);
 note('PAID_NATURAL_FOLLOWUP_AFTER_COMPLETION',natOk&&natFail.length===0,{modelCallsDelta:s.modelCalls-callsBeforeNat,turnFailures:natFail});
 await expect(page.getByRole('textbox',{name:'Message Sofie',exact:true})).toBeEnabled();
 // 10. Canonical zero-cost readback
 const callsBeforeRb=s.modelCalls;start('canonical_readback');await send(page,'What did you change?');
 await expect(page.getByText('You accepted this verified private Result. This Work is completed.',{exact:false}).last()).toBeVisible({timeout:120000});stop('canonical_readback');
 s=await status(page);note('READBACK_NO_MODEL_CALL',s.modelCalls===callsBeforeRb,{delta:s.modelCalls-callsBeforeRb});
 const rbText=await page.locator('main').innerText();
 note('READBACK_CLAIMS_10_OF_10',/10 of 10 recorded checks passed/.test(rbText),'Readback refers to ten signed per-criterion checks');
 // 11. Offline disconnect -> reconnect
 await context.setOffline(true);
 await page.getByRole('textbox',{name:'Message Sofie',exact:true}).fill('Are you there?');
 await page.getByRole('button',{name:'Send',exact:true}).click().catch(()=>{});
 await page.waitForTimeout(8000);
 const offlineFeedback=await page.getByRole('alert').allInnerTexts().catch(()=>[]);
 const offlineStatus=await page.getByRole('status').allInnerTexts().catch(()=>[]);
 note('OFFLINE_FEEDBACK_VISIBLE',offlineFeedback.length+offlineStatus.filter(t=>/offline|connect|try again|could not|failed/i.test(t)).length>0,{alerts:offlineFeedback,statuses:offlineStatus});
 await context.setOffline(false);
 start('reconnect_reload');await page.reload();await expect(page.locator('.owner-work-summary')).toHaveCount(1,{timeout:120000});stop('reconnect_reload');
 expect(await page.locator('[data-thread-id]').getAttribute('data-thread-id')).toBe(threadId);
 await expect(page.locator('.owner-status')).toHaveText('Completed');
 a11y.push(await audit(page,'sofie-completed-after-reconnect'));
 await page.getByRole('link',{name:'View Work',exact:false}).click();await expect(page.locator('.owner-status')).toHaveText('Completed');
 a11y.push(await audit(page,'work-detail-completed'));
 for(const route of ['/today','/work','/needs-you','/chat','/workspace']){await page.goto(route);a11y.push({label:'title:'+route,title:await page.title()});}
 // 11b. Disabled-feature bypass probes (authenticated owner). Expect 404/403/405, never 200 content.
 const probes=['/rooms','/memory','/email','/computer','/imessage','/channels','/apps','/knowledge','/routines','/capsules','/share','/review',
  '/ROOMS','/rooms/','/%72ooms','/chat/../rooms','/today/..%2frooms','/api/rooms','/api/memory','/api/email','/api/computer','/api/routines','/api/apps',
  '/api/connected-apps','/api/github/publish','/api/beta/publish','/api/engineering/publish','/eve/v1/rooms'];
 const bypass=[];
 for(const r of probes){const res=await page.request.get(r,{maxRedirects:0}).catch(e=>({status:()=>-1,text:async()=>String(e)}));const st=res.status();if(![403,404,405,307,308,-1].includes(st))bypass.push({route:r,status:st,body:(await res.text()).slice(0,120)});}
 note('DISABLED_FEATURE_BYPASS_NONE',bypass.length===0,bypass);
 // 12. Final durable state + accounting
 const final=await status(page);const acct=await accountingSnapshot(page);const allFailures=await failures(page);
 const report={sourceSha:process.env.QE_SOURCE_SHA,startedBoundary:'FakeFactory+buildSignedResult (synthetic Factory); deterministic fixture model',final,accounting:acct,turnFailures:allFailures,timingsMs:timings,findings,a11y};
 fs.writeFileSync(EV+'/E2-independent-journey.json',JSON.stringify(report,null,2));
 expect(acct.results).toEqual([{verdict:"PASS",settlement_state:"SETTLED",exposure_unknown:false,cleanup_confirmed:true}]);
 expect(acct.authorities).toEqual([{state:"COMPLETED"}]);
 expect(acct.decisions).toEqual([{action:"accept_private",n:1}]);
 expect(acct.publications).toEqual([{n:0}]);
 expect(acct.operations.every(o=>o.state==="SETTLED")).toBe(true);
 expect(findings.filter(f=>!f.ok)).toEqual([]);
 expect(midFail).toEqual([]);expect(natFail).toEqual([]);expect(allFailures).toEqual([]);
 expect(final.contextSizes.every(bytes=>bytes<=32000)).toBe(true);
 expect(bypass).toEqual([]);
 expect(a11y.flatMap(a=>Object.values(a).filter(v=>v&&typeof v==='object'&&Array.isArray(v.serious)).flatMap(v=>v.serious))).toEqual([]);
 expect(final).toMatchObject({dispatches:1,executions:1,workCount:1,authorities:1,results:1,acceptances:1,publications:0,unresolved:0});
});
