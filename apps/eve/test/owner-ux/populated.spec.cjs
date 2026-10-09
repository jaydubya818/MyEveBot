const {test,expect}=require('@playwright/test');
const {Pool}=require('pg');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const {capture}=require('./visual.cjs');
const axe=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const owner='11111111-1111-4111-8111-111111111111';
const ids=[randomUUID(),randomUUID()];let pool;
test.beforeAll(async()=>{
 pool=new Pool({connectionString:'postgresql://ux_fixture:local-only@localhost:55491/blocker_fixes'});
 for(const [index,id] of ids.entries()) {
  await pool.query("INSERT INTO engineering_work(id,scope_id,scope_kind,created_by,title,objective,repository,max_cost_usd,max_duration_seconds,idempotency_key,request_hash,control) VALUES($1,$2,'personal',$2,$3,$4,'synthetic/alpha-tasks',1,180,$1,'synthetic',$5)",[id,owner,index?'Organize launch notes':'Add Priority to Alpha Tasks','Keep the requested outcome clear and privately reviewable.',index?'paused':'agent']);
  await pool.query("INSERT INTO engineering_work_criteria(scope_id,scope_kind,work_id,version,items,created_by) VALUES($1,'personal',$2,1,$3,$1)",[owner,id,JSON.stringify([{id:randomUUID(),statement:'The requested outcome is reviewable'}])]);
 }
});
test.afterAll(async()=>{if(!pool)return;for(const id of ids){await pool.query('DELETE FROM engineering_work_criteria WHERE work_id=$1',[id]);await pool.query('DELETE FROM engineering_work WHERE id=$1',[id]);}await pool.end();});
for(const width of [1440,390])test(`durable populated Today and Work at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.clock.setFixedTime(new Date('2026-10-09T01:00:00Z'));
 expect((await page.request.post('/api/auth/login',{data:{password:'synthetic-ux-owner-a'}})).ok()).toBeTruthy();
 await page.goto('/today');await expect(page.getByRole('link',{name:'Add Priority to Alpha Tasks',exact:true})).toBeVisible();
 await expect(page.getByText('Organize launch notes',{exact:true})).toHaveCount(0);await capture(page,`today-active-${width}.png`);
 await page.goto('/work');await expect(page.locator(`[data-work-id="${ids[0]}"]`)).toContainText('Queued');await capture(page,`work-list-${width}.png`);
 await page.getByRole('button',{name:'Stopped (1)',exact:true}).click();await expect(page.getByRole('link',{name:'Organize launch notes',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Organize launch notes',exact:true}).click();await expect(page.locator('.owner-work-summary')).toContainText('This Work is paused');
 await page.reload();await expect(page.locator('.owner-work-summary')).toContainText('Stopped');await expect(page.getByText('Technical details',{exact:true})).not.toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 await expect(page).toHaveTitle(/MyEve/);await page.addScriptTag({content:axe});const findings=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));expect(findings.violations.filter(v=>['critical','serious'].includes(v.impact))).toEqual([]);
 await page.addStyleTag({content:'nextjs-portal {display:none!important}'});await capture(page,`work-detail-stopped-${width}.png`);
});
// UI contract fixtures derived from a real owner-scoped projection. These do not
// claim execution or verifier qualification; the composed journey is separate.
for(const width of [1440,390])test(`Work state, Proof and reconnect presentation at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.clock.setFixedTime(new Date('2026-10-09T01:00:00Z'));
 expect((await page.request.post('/api/auth/login',{data:{password:'synthetic-ux-owner-a'}})).ok()).toBeTruthy();
 const original=await (await page.request.get(`/api/beta/work?workId=${ids[0]}`)).json();
 const base=original.canonical.projection;const criterion=base.criteria[0];
 const result={id:'fixture-result',current:true,contentHash:'synthetic',proof:{workId:base.workId,workVersion:base.workVersion,criteriaVersion:base.criteriaVersion,resultRevision:'synthetic-candidate',outcome:'PARTIAL',limitations:['The change remains private and has not been published.'],artifactRefs:[],evidence:[{criterionId:criterion.id,resultRevision:'synthetic-candidate',state:'PASS',sourceRef:'Synthetic acceptance check'}]}};
 let readFails=false; let current={...base,runTruth:{...base.runTruth,activeRun:{id:'synthetic-run'}}};
 await page.route('**/api/beta/work?workId=*',route=>readFails ? route.fulfill({status:503,json:{error:'Work cannot be refreshed right now.'}}) : route.fulfill({json:{...original,canonical:{...original.canonical,projection:current}}}));
 await page.goto(`/work?kind=work&id=${ids[0]}`);await expect(page.locator('.owner-status')).toHaveText('Working');await capture(page,`work-detail-working-${width}.png`);
 for(const state of ['Verifying','Verified candidate','Outcome unconfirmed','Couldn’t complete']) {
  current={...base,...(state==='Verifying'?{nativeDevelopment:{current:true,phase:'VERIFICATION_REQUESTED'}}:{nativeResult:result,verification:{...base.verification,status:'PASS',candidateSha:'synthetic-candidate'},externalAlpha:{current:true,authorityId:'fixture-authority',requestId:'fixture-request',accounting:{ceilingMicrousd:1300000,settledMicrousd:0,reservedMicrousd:0,unknownMicrousd:0},state:state==='Outcome unconfirmed'?'UNKNOWN':'COMPLETED',factoryOutcome:state==='Couldn’t complete'?'FAILED':null,result:{...result,resultId:result.id,candidateSha:'synthetic-candidate',verdict:'PASS',producerOutcome:'COMPLETED',producerChecks:'PASS',settlementState:'SETTLED'}}})};
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(page.locator('.owner-status')).toHaveText(state);await expect(page.locator(`[data-work-id="${ids[0]}"]`)).toHaveCount(1);
  if(state==='Verified candidate') {await expect(page.getByText('1 of 1 recorded checks passed.',{exact:true})).toBeVisible();await page.getByText('View proof',{exact:true}).click();await expect(page.getByText('Synthetic acceptance check',{exact:true})).toBeVisible();await expect(page.getByText('Technical details',{exact:true})).toBeVisible();}
  if(state==='Outcome unconfirmed')await expect(page.getByRole('button',{name:/retry|resume/i})).toHaveCount(0);
  await expect(page).toHaveTitle(/MyEve/);await page.addScriptTag({content:axe});const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));expect(audit.violations.filter(v=>['critical','serious'].includes(v.impact))).toEqual([]);
  await page.addStyleTag({content:'nextjs-portal{display:none!important}'});await capture(page,`${state.replaceAll(' ','-')}-${width}.png`);
 }
 readFails=true;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(page.locator('.owner-page').getByRole('alert')).toBeVisible();await expect(page.locator('.owner-work-summary')).toHaveCount(0);readFails=false;await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.locator('.owner-status')).toHaveText('Couldn’t complete');
 await page.reload();await expect(page.locator('.owner-status')).toHaveText('Couldn’t complete');
 // The same read-only card follows the conversation, including repeated reads.
 await page.route('**/api/work-thread?*',route=>route.fulfill({json:{works:[{projection:current}],nextOffset:null}}));
 await page.goto('/chat');await expect(page.locator('.owner-work-summary')).toHaveCount(1);await expect(page.locator('.owner-work-summary')).toContainText('Couldn’t complete');
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(page.locator('.owner-work-summary')).toHaveCount(1);
 await page.addStyleTag({content:'nextjs-portal{display:none!important}'});await capture(page,`sofie-inline-work-${width}.png`);
});
