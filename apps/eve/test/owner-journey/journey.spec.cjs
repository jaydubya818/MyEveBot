const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const {record}=require('../owner-ux/provenance.cjs');
const axe=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
test.skip(process.env.MYEVE_OWNER_JOURNEY!=='1','Requires the isolated no-paid provider runner');
async function send(page,text){await page.getByRole('textbox',{name:'Message Sofie',exact:true}).fill(text);await page.getByRole('button',{name:'Send',exact:true}).click();}
async function retainedFailures(page){
 const {threads}=await (await page.request.get('/api/threads')).json();const failures=[];
 for(const thread of threads){const {chat}=await (await page.request.get(`/api/threads/${thread.id}`)).json();for(const event of chat.events??[])if(event.type==='turn.failed')failures.push(event);}
 return JSON.stringify(failures);
}
test('completes one private Work with owner acceptance and same-conversation Result readback',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});
 await page.goto('/login');await page.getByLabel('Your access password').fill('synthetic-journey-owner');await page.getByRole('button',{name:'Open Sofie',exact:true}).click();
 await expect(page).toHaveURL(/\/today$/);await expect(page.getByRole('link',{name:'MyEve home',exact:true})).toBeVisible();
 const clean=await page.request.get('/api/work-inbox');expect(clean.ok()).toBeTruthy();expect((await clean.json()).works).toHaveLength(0);
 await page.getByRole('navigation',{name:'Primary',exact:true}).getByRole('link',{name:'Sofie',exact:true}).click();
 await send(page,'Add a Low / Medium / High Priority field to Alpha Tasks.');
 await expect(page.getByText('I created Add Priority to Alpha Tasks. Open Work and resume it when you are ready.',{exact:true})).toBeVisible({timeout:90000});
 await expect(page.locator('.owner-work-summary')).toHaveCount(1);
 const workId=await page.locator('.owner-work-summary').getAttribute('data-work-id');
 const threadId=await page.locator('[data-thread-id]').getAttribute('data-thread-id');
 await page.reload();await expect(page.locator('.owner-work-summary')).toHaveCount(1);await expect(page.getByText('I created Add Priority to Alpha Tasks. Open Work and resume it when you are ready.',{exact:true})).toHaveCount(1);
 await page.getByRole('link',{name:'View Work',exact:false}).click();await expect(page.locator('.owner-status')).toHaveText('Stopped');
 await page.getByRole('button',{name:'Resume Work',exact:true}).click();await expect(page.getByRole('button',{name:'Pause Work',exact:true})).toBeVisible();
 await page.getByRole('navigation',{name:'Primary',exact:true}).getByRole('link',{name:'Sofie',exact:true}).click();
 await expect(page.locator('[data-thread-id]')).toHaveAttribute('data-thread-id',threadId);
 await expect(page.getByRole('region',{name:'Conversation Work'})).toContainText('Alpha Tasks: add a Priority field');await page.getByLabel('Request type').selectOption('continue');
 await send(page,'Start this Work.');
 await expect(page.getByText('Your Work request is acknowledged. Open Work to follow its saved progress.',{exact:true})).toBeVisible({timeout:90000});
 expect(await retainedFailures(page)).toBe('[]');
 const sent=await (await page.request.get('http://127.0.0.1:3184/fixture/status')).json();expect(sent.dispatches).toBe(1);expect(sent.workCount).toBe(1);
 await page.reload();await expect(page.locator('.owner-work-summary')).toHaveCount(1);
 expect((await page.request.post('http://127.0.0.1:3184/fixture/complete')).ok()).toBeTruthy();
 await page.getByRole('link',{name:'View Work',exact:false}).click();await expect(page.locator('.owner-status')).toHaveText('Verified candidate');
 await expect(page.getByText('10 of 10 recorded checks passed.',{exact:true})).toBeVisible();await page.getByText('View proof',{exact:true}).click();await expect(page.getByRole('link',{name:'Evidence 1',exact:true})).toBeVisible();
 const before=await (await page.request.get(`/api/beta/work?workId=${workId}`)).json();const resultId=before.canonical.projection.nativeResult.id;expect(before.canonical.projection.nativeResult.proof.outcome).toBe('PARTIAL');
 await page.reload();await expect(page.locator('.owner-status')).toHaveText('Verified candidate');const after=await (await page.request.get(`/api/beta/work?workId=${workId}`)).json();expect(after.canonical.projection.nativeResult.id).toBe(resultId);
 await page.getByRole('navigation',{name:'Primary',exact:true}).getByRole('link',{name:'Needs You',exact:true}).click();
 await page.getByRole('button',{name:'Accept verified private Result',exact:true}).click();
 await expect(page.getByText('Your decision is saved.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'History',exact:true}).click();
 await expect(page.getByText('Your answer:',{exact:false})).toContainText('Accept verified private Result');
 const accepted=await (await page.request.get(`/api/beta/work?workId=${workId}`)).json();
 expect(accepted.canonical.projection.lifecycle).toBe('accepted');
 expect(accepted.canonical.projection.nativeResult.id).toBe(resultId);
 expect(accepted.canonical.projection.nativeResult.proof).toEqual(before.canonical.projection.nativeResult.proof);
 const callsBefore=(await (await page.request.get('http://127.0.0.1:3184/fixture/status')).json()).modelCalls;
 await page.getByRole('navigation',{name:'Primary',exact:true}).getByRole('link',{name:'Sofie',exact:true}).click();
 await expect(page.locator('[data-thread-id]')).toHaveAttribute('data-thread-id',threadId);await send(page,'What did you change?');
 await expect(page.getByText('You accepted this verified private Result. This Work is completed.',{exact:false})).toBeVisible({timeout:90000});
 await expect(page.getByText('The retained candidate changed:',{exact:false})).toBeVisible();
 expect(await retainedFailures(page)).toBe('[]');
 await page.reload();await expect(page.locator('.owner-work-summary')).toHaveCount(1);await expect(page.locator('.owner-status')).toHaveText('Completed');
 await expect(page.getByText('You accepted this verified private Result. This Work is completed.',{exact:false})).toBeVisible();
 expect(await page.locator('[data-thread-id]').getAttribute('data-thread-id')).toBe(threadId);
 const final=await (await page.request.get('http://127.0.0.1:3184/fixture/status')).json();
 expect(final).toMatchObject({dispatches:1,executions:1,workCount:1,authorities:1,results:1,acceptances:1,publications:0,unresolved:0,modelCalls:callsBefore});
 expect(final.contextSizes.every(bytes=>bytes<=32000)).toBeTruthy();
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await expect(page).toHaveTitle(/MyEve/);
  await page.addScriptTag({content:axe});const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
  expect(audit.violations.filter(v=>['critical','serious'].includes(v.impact))).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  const file=test.info().outputPath(`completed-private-result-same-conversation-${width}.png`);
  await page.addStyleTag({content:'nextjs-portal{display:none!important}'});await page.screenshot({path:file,fullPage:true});
  await record(page,file,'owner-journey',{owner:final.owner});
 }
 await page.getByRole('link',{name:'View Work',exact:false}).click();
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await expect(page.locator('.owner-status')).toHaveText('Completed');
  await page.addScriptTag({content:axe});const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
  expect(audit.violations.filter(v=>['critical','serious'].includes(v.impact))).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  const file=test.info().outputPath(`completed-private-work-${width}.png`);
  await page.addStyleTag({content:'nextjs-portal{display:none!important}'});await page.screenshot({path:file,fullPage:true});await record(page,file,'owner-journey',{owner:final.owner});
 }
});
