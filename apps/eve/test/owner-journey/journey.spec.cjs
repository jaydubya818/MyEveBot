const {test,expect}=require('@playwright/test');
test.skip(process.env.MYEVE_OWNER_JOURNEY!=='1','Requires the isolated no-paid provider runner');
async function send(page,text){await page.getByRole('textbox',{name:'Message Sofie',exact:true}).fill(text);await page.getByRole('button',{name:'Send',exact:true}).click();}
async function retainedFailures(page){
 const {threads}=await (await page.request.get('/api/threads')).json();const failures=[];
 for(const thread of threads){const {chat}=await (await page.request.get(`/api/threads/${thread.id}`)).json();for(const event of chat.events??[])if(event.type==='turn.failed')failures.push(event);}
 return JSON.stringify(failures);
}
test('reproduces spending boundary while preserving one Work and Result across reconnect',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});
 await page.goto('/login');await page.getByLabel('Your access password').fill('synthetic-journey-owner');await page.getByRole('button',{name:'Open Sofie',exact:true}).click();
 await expect(page).toHaveURL(/\/today$/);await expect(page.getByRole('link',{name:'MyEve home',exact:true})).toBeVisible();
 const clean=await page.request.get('/api/work-inbox');expect(clean.ok()).toBeTruthy();expect((await clean.json()).works).toHaveLength(0);
 await page.getByRole('navigation',{name:'Primary',exact:true}).getByRole('link',{name:'Sofie',exact:true}).click();
 await send(page,'Add a Low / Medium / High Priority field to Alpha Tasks.');
 await expect(page.getByText('I created Add Priority to Alpha Tasks. Open Work and resume it when you are ready.',{exact:true})).toBeVisible({timeout:90000});
 await expect(page.locator('.owner-work-summary')).toHaveCount(1);
 const workId=await page.locator('.owner-work-summary').getAttribute('data-work-id');
 await page.reload();await expect(page.locator('.owner-work-summary')).toHaveCount(1);await expect(page.getByText('I created Add Priority to Alpha Tasks. Open Work and resume it when you are ready.',{exact:true})).toHaveCount(1);
 await page.getByRole('link',{name:'View Work',exact:false}).click();await expect(page.locator('.owner-status')).toHaveText('Stopped');
 expect((await page.request.post('http://127.0.0.1:3184/fixture/decision')).ok()).toBeTruthy();
 await page.getByRole('navigation',{name:'Primary',exact:true}).getByRole('link',{name:'Needs You',exact:true}).click();
 await page.getByRole('button',{name:'Continue with Low / Medium / High',exact:true}).click();
 await expect(page.getByText('Your decision is saved.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'History',exact:true}).click();
 await expect(page.getByText('Your answer:',{exact:false})).toContainText('Continue with Low / Medium / High');
 await page.getByRole('link',{name:'Alpha Tasks: add a Priority field',exact:true}).click();
 await page.getByRole('button',{name:'Resume Work',exact:true}).click();await expect(page.getByRole('button',{name:'Pause Work',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Discuss with Sofie',exact:false}).click();
 await expect(page.getByLabel('Discuss existing Work')).toHaveValue(workId);await page.getByLabel('Request type').selectOption('continue');
 await send(page,'Start this Work.');
 // Qualification blocker: the canonical shared-spending fence prevents a paid
 // follow-up acknowledgment while Work is in flight. Do not relax accounting.
 await expect(page.getByText('Sofie couldn’t finish this turn.',{exact:true})).toBeVisible({timeout:90000});
 await expect.poll(()=>retainedFailures(page)).toContain('EXTERNAL_ALPHA_SHARED_FENCED');
 const sent=await (await page.request.get('http://127.0.0.1:3184/fixture/status')).json();expect(sent.dispatches).toBe(1);expect(sent.workCount).toBe(1);
 await page.reload();await expect(page.locator('.owner-work-summary')).toHaveCount(1);
 expect((await page.request.post('http://127.0.0.1:3184/fixture/complete')).ok()).toBeTruthy();
 await page.getByRole('link',{name:'View Work',exact:false}).click();await expect(page.locator('.owner-status')).toHaveText('Verified candidate');
 await expect(page.getByText('10 of 10 recorded checks passed.',{exact:true})).toBeVisible();await page.getByText('View proof',{exact:true}).click();await expect(page.getByRole('link',{name:'Evidence 1',exact:true})).toBeVisible();
 const before=await (await page.request.get(`/api/beta/work?workId=${workId}`)).json();const resultId=before.canonical.projection.nativeResult.id;expect(before.canonical.projection.nativeResult.proof.outcome).toBe('PARTIAL');
 await page.reload();await expect(page.locator('.owner-status')).toHaveText('Verified candidate');const after=await (await page.request.get(`/api/beta/work?workId=${workId}`)).json();expect(after.canonical.projection.nativeResult.id).toBe(resultId);
 await page.getByRole('link',{name:'Discuss with Sofie',exact:false}).click();await send(page,'What did you change?');
 await expect(page.getByText('Sofie couldn’t finish this turn.',{exact:true})).toBeVisible({timeout:90000});
 await expect.poll(()=>retainedFailures(page)).toContain('Unresolved exposure fences further admission');
 await page.reload();await expect(page.locator('.owner-work-summary')).toHaveCount(1);
 await page.getByRole('link',{name:'View Work',exact:false}).click();await expect(page.locator('.owner-status')).toHaveText('Verified candidate');
 const final=await (await page.request.get('http://127.0.0.1:3184/fixture/status')).json();expect(final).toMatchObject({dispatches:1,executions:1,workCount:1,authorities:1,results:1});expect(final.contextSizes.every(bytes=>bytes<=32000)).toBeTruthy();
 await page.screenshot({path:test.info().outputPath('retained-result-after-blocked-sofie-readback.png'),fullPage:true});
});
