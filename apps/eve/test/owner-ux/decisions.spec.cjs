const {test,expect}=require('@playwright/test');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const {capture}=require('./visual.cjs');
const axe=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const env={...process.env,MYEVE_TEST_DATABASE_URL:require('./database.cjs').connectionString};
let fixture;
test.beforeEach(()=>{fixture=JSON.parse(execFileSync(process.execPath,['--import','tsx','test/owner-ux/decision-fixture.ts','seed'],{env,encoding:'utf8'}));});
test.afterEach(()=>{if(fixture)execFileSync(process.execPath,['--import','tsx','test/owner-ux/decision-fixture.ts','cleanup',fixture.workId],{env});});
for(const width of [1440,390])test(`canonical decision resolves into durable history at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 expect((await page.request.post('/api/auth/login',{data:{password:'synthetic-ux-owner-b'}})).ok()).toBeTruthy();
 const foreign=await page.request.get(`/api/beta/inbox?workId=${fixture.workId}`);expect(foreign.ok()).toBeTruthy();expect(await foreign.text()).not.toContain(fixture.item.id);
 expect((await page.request.post('/api/auth/login',{data:{password:'synthetic-ux-owner-a'}})).ok()).toBeTruthy();
 await page.goto(`/needs-you?workId=${fixture.workId}`);
 await expect(page.getByRole('heading',{name:'How should I organize your launch notes?'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Organize launch notes',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'By topic',exact:true})).toBeEnabled();
 await page.addScriptTag({content:axe});const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));expect(audit.violations.filter(v=>['critical','serious'].includes(v.impact))).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 await page.addStyleTag({content:'nextjs-portal{display:none!important}'});await capture(page,`needs-you-decision-${width}.png`);
 await page.getByRole('button',{name:'By topic',exact:true}).click();
 await expect(page.getByText('Your decision is saved.',{exact:false})).toBeVisible();
 await expect(page.locator(`[data-decision-id="${fixture.item.id}"]`)).toHaveCount(0);
 await page.getByRole('button',{name:'History',exact:true}).click();
 await expect(page.getByRole('heading',{name:'How should I organize your launch notes?'})).toBeVisible();await expect(page.getByText('Your answer:',{exact:false})).toContainText('By topic');
 await expect(page.getByRole('link',{name:'Organize launch notes',exact:true})).toBeVisible();
 await expect(page.getByRole('status').filter({hasText:/Loading|Checking|Opening/})).toHaveCount(0);
 await page.addStyleTag({content:'nextjs-portal{display:none!important}'});await capture(page,`needs-you-history-${width}.png`);
 await page.reload();await page.getByRole('button',{name:'History',exact:true}).click();await expect(page.getByText('Your answer:',{exact:false})).toContainText('By topic');
 const recorded=await (await page.request.get(`/api/beta/inbox?view=archive&workId=${fixture.workId}`)).json();expect(recorded.decisions).toHaveLength(1);expect(recorded.decisions[0].answer).toBe('By topic');expect(recorded.decisions[0].status).toBe('DELIVERED');
 expect((await page.request.post('/api/auth/login',{data:{password:'synthetic-ux-owner-b'}})).ok()).toBeTruthy();const denied=await page.request.get(`/api/beta/inbox?view=archive&workId=${fixture.workId}`);expect(await denied.text()).not.toContain('By topic');
});

test('an answer awaiting continuation remains visible in history',async({page})=>{
 execFileSync(process.execPath,['--import','tsx','test/owner-ux/decision-fixture.ts','pending',fixture.workId],{env});
 expect((await page.request.post('/api/auth/login',{data:{password:'synthetic-ux-owner-a'}})).ok()).toBeTruthy();
 await page.goto(`/needs-you?workId=${fixture.workId}`);await expect(page.locator(`[data-decision-id="${fixture.item.id}"]`)).toHaveCount(0);
 await page.getByRole('button',{name:'History',exact:true}).click();await expect(page.getByText('Your answer:',{exact:false})).toContainText('By topic');await expect(page.getByText('Answer saved — awaiting follow-through',{exact:false})).toBeVisible();
});

// These two UI fault fixtures isolate delayed refresh and expiry presentation;
// the tests above exercise the actual PostgreSQL decision write contract.
test('an exact-action approval stays locked while the refreshed queue is delayed',async({page})=>{
 const approval={id:'synthetic-approval',taskId:'synthetic-task',goalId:null,capabilityId:'files.write',action:'Save launch notes',actionClass:'write',parameters:{},bindingHash:'a'.repeat(64),risk:'low',effects:['Save one private file'],estimatedCostUsd:null,prompt:'Save this private draft?',requestedBy:'Sofie',requestedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),status:'pending',resource:'launch-notes.md'};
 let writes=0;
 await page.route('**/api/approvals',route=>route.fulfill({json:{approvals:[approval]}}));
 await page.route('**/api/approvals/synthetic-approval',async route=>{writes++;expect(route.request().postDataJSON()).toEqual({decision:'approved',bindingHash:approval.bindingHash});await route.fulfill({json:{approval:{...approval,status:'approved'}}});});
 await page.request.post('/api/auth/login',{data:{password:'synthetic-ux-owner-a'}});await page.goto('/needs-you');
 await page.getByRole('button',{name:'Allow this action',exact:true}).click();
 await expect(page.getByText('Your decision is saved.',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Saving decision…',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Decline',exact:true})).toBeDisabled();expect(writes).toBe(1);
});

test('expired history uses an owner-facing status',async({page})=>{
 const expired={...fixture.item,needsYou:false,availableActions:[],action:{...fixture.item.action,expiresAt:'2020-01-01T00:00:00.000Z'}};
 await page.route('**/api/beta/inbox?*',route=>route.fulfill({json:{version:'myeve.attention.v1',items:route.request().url().includes('decision_history')?[expired]:[],decisions:[],nextCursor:null}}));
 await page.request.post('/api/auth/login',{data:{password:'synthetic-ux-owner-a'}});await page.goto('/needs-you');await page.getByRole('button',{name:'History',exact:true}).click();
 await expect(page.locator('.owner-card .owner-muted').filter({hasText:/^Expired/})).toBeVisible();await expect(page.getByText(/needs_action/)).toHaveCount(0);
});
