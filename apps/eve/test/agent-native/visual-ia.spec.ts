import {test,expect,type Page,type Locator} from '@playwright/test';
import {getCapabilities} from '../../lib/capability-registry.ts';
import {reset} from '../publication/harness.mjs';
const id='agent_e0954312-6a71-4727-a915-f1484a0b8736',thread='agent-native-controlled-thread';
const agent={id,ownerId:'owner',name:'Sofie',slug:'qualification-sofie',role:'Primary Digital Worker',description:'Coordinates your goals and brings back useful Results.',instructions:'Controlled canonical fixture.',status:'active',isPrimary:true,preferredModel:null,reasoningPreference:'default',avatarConfig:{style:'initials',tone:'sage'},riskCeiling:'low',notificationPolicy:'activity',limits:{maxSteps:20,maxRuntimeSeconds:600,maxEstimatedCostUsd:1,maxRetries:1},capabilities:[],createdAt:'2026-10-02T00:00:00Z',updatedAt:'2026-10-02T00:00:00Z',archivedAt:null};
async function visual(page:Page,target:Locator,name:string){
 await expect(target).toBeVisible();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(!await page.evaluate(()=>Boolean((window as any).axe)))await page.addScriptTag({path:'/private/tmp/myeve-alpha-accessibility/node_modules/axe-core/axe.min.js'});
 const violations=await target.evaluate(async node=>(await (window as any).axe.run(node,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations);
 expect(violations.map((v:any)=>({id:v.id,nodes:v.nodes.map((n:any)=>n.target)}))).toEqual([]);
 await expect(target).toHaveScreenshot(name+'.png',{animations:'disabled',maxDiffPixelRatio:0.005});
}
test.beforeEach(async({context,page})=>{
 await reset();expect((await context.request.post('/api/auth/login',{data:{password:'owner-publication-fixture-only'}})).status()).toBe(200);
 const state=await context.storageState();await context.addCookies(state.cookies.map(c=>({...c,secure:false})));
 await page.clock.setFixedTime(new Date('2026-10-02T12:00:00Z'));
 await page.addInitScript(({thread})=>{const prefix='myeve-private:owner:';localStorage.setItem(prefix+'eve-web-threads',JSON.stringify({activeId:thread,threads:[{id:thread,title:'Review quantity validation',updatedAt:1}]}));localStorage.setItem(prefix+'eve-web-chat:'+thread,JSON.stringify({events:[]}));},{thread});
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.startsWith('/api/auth/')||path==='/api/work-inbox'||path==='/api/work-thread'||path==='/api/beta/owner-decision'||path.endsWith('/home'))return route.continue();
  const bodies:Record<string,unknown>={'/api/collaboration':{connection:null,groupExecutionQualified:false,conversations:[],bounds:{requests:50,conversations:10}},'/api/agents':{agents:[agent]},'/api/capabilities':{capabilities:[],registry:getCapabilities().filter(c=>['web.read','files.write'].includes(c.id))},'/api/threads':{threads:[{id:thread,title:'Review quantity validation',updatedAt:1}]},['/api/threads/'+thread]:{chat:{events:[]}},'/api/models':{models:[]},'/api/commands':{commands:[]},'/api/task-runs':{tasks:[]},'/api/beta/activity':{changes:[]},'/api/beta/goals':{contractVersion:1,goals:[],nextCursor:null,canProceed:[],doing:[],blocked:[],needsYou:[],recentlyCompleted:[]},'/api/beta/work':{works:[]},'/api/beta/results':{results:[]},'/api/beta/inbox':{items:[],nextCursor:null},'/api/channels':{channels:[]},'/api/email':{configured:false,threads:[]},'/api/responsibilities':{executionQualified:false,routines:[],results:[]}};
  await route.fulfill({json:bodies[path]??{}});
 });
 await page.route('**/eve/v1/**',route=>route.fulfill({status:503,json:{error:'No model execution in visual fixtures'}}));
});
// The existing Work suite shares this worker-scoped harness and closes it.
// Do not end its pool between files; standalone Playwright workers own teardown.
test.afterAll(async()=>{await reset();});
for(const mode of ['light','dark'] as const){
 test(`${mode} Today, live card, profile and creation`,async({page})=>{
  await page.emulateMedia({colorScheme:mode});await page.goto('/today');
  await expect(page.locator('[data-live-agent-card]')).toBeVisible();
  await visual(page,page.locator('#owner-content'),mode+'-today');
  await visual(page,page.locator('[data-live-agent-card]'),mode+'-live-agent-card');
  await page.goto('/agents?agent='+id);const home=page.getByRole('region',{name:'Agent activity'});
  await expect(home.locator('[data-live-agent-card]')).toBeVisible();
  await home.getByText('Capabilities & authority',{exact:true}).click();
  await expect(home.getByText('Owner policy applies',{exact:true})).toBeVisible();
  await visual(page,page.locator('#agent-profile'),mode+'-agent-profile');
  await page.getByRole('button',{name:'Create Agent',exact:true}).first().click();
  await page.getByRole('textbox',{name:'Agent name',exact:true}).fill('Researcher');await page.getByRole('textbox',{name:'Agent responsibility',exact:true}).fill('Track public research on my priorities');
  await page.getByRole('textbox',{name:'Agent instructions',exact:true}).fill('Summarize sources and bring consequential sharing decisions to me.');
  await page.getByLabel('Agent symbol',{exact:true}).selectOption('robot');await page.getByLabel('Agent color',{exact:true}).selectOption('clay');
  await expect(page.getByLabel('Preferred model',{exact:true})).not.toBeVisible();
  await visual(page,page.locator('form').filter({has:page.getByLabel('Agent name',{exact:true})}),mode+'-specialist-creation');
  await page.route('**/api/agents',route=>route.request().method()==='POST'?route.fulfill({status:400,json:{error:'Controlled save failure'}}):route.fulfill({json:{agents:[agent]}}));
  await page.getByRole('button',{name:'Save Agent',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Controlled save failure'})).toBeVisible();
  await expect(page.getByLabel('Agent name',{exact:true})).toHaveValue('Researcher');
 });
 test(`${mode} Room and Routine Monitoring previews`,async({page})=>{
  await page.emulateMedia({colorScheme:mode});await page.goto('/product-preview#room-preview');const room=page.getByRole('region',{name:'Room interaction preview'});
  await visual(page,room,mode+'-room');
  for(const name of ['Work','Results','Artifacts','Needs You']){const button=room.getByRole('button',{name,exact:true});await button.focus();await page.keyboard.press('Enter');await expect(button).toHaveAttribute('aria-pressed','true');}
  await visual(page,room,mode+'-room-needs-you');
  // Preview only. Production ROUTINE_RELEASE remains false; this does not
  // qualify a cloud scheduler, running Routine or new environment contract.
  await page.route('**/api/responsibilities',route=>route.fulfill({json:{executionQualified:true,routines:[{id:'visual-routine',name:'Fixture — Monitoring layout',agentId:id,agentName:'Sofie',state:'Monitoring',lastRun:'2026-10-02T10:00:00Z',lastStatus:'completed',nextRun:'2026-10-02T14:00:00Z',timezone:'UTC',summary:'Sample Result: no change found.',threadId:null}],results:[]}}));
  await page.goto('/today');const routine=page.locator('[data-responsibilities="today"]');await expect(routine.getByText('Monitoring',{exact:true})).toBeVisible();
  await visual(page,routine,mode+'-routine-monitoring-fixture');
 });
 test(`${mode} Work thread, Result and Needs You`,async({page})=>{
  await page.emulateMedia({colorScheme:mode});await page.goto('/chat');const work=page.getByRole('region',{name:'Work in this conversation'});
  await expect(work.getByRole('heading',{name:'Needs You — owner decision'})).toBeVisible();
  await visual(page,work,mode+'-work-result-needs-you');
  await work.getByText('Proof of Work / Advanced',{exact:true}).click();await expect(work.getByText(/Run history:/)).toBeVisible();
 });
}

test('single navigation opens canonical Work filters and honest Rooms',async({page},info)=>{
 await page.emulateMedia({colorScheme:'light'});
 await page.route('**/api/beta/inbox?**',route=>route.fulfill({json:{items:[{id:'attention-fixture',title:'Review the email reply',summary:'A separate owner decision from the canonical Inbox projection.',needsYou:true}],nextCursor:null}}));
 await page.goto('/today');
 await expect(page.getByRole('heading',{name:'Owner attention',exact:true})).toBeVisible();await expect(page.getByText('Review the email reply',{exact:true})).toBeVisible();
 await expect(page.locator('[data-live-agent-card]')).toBeVisible();
 if(info.project.name==='390px')await page.getByRole('button',{name:'Menu',exact:true}).click();
 const navigation=page.getByRole('navigation',{name:'Primary',exact:true});
 await expect(navigation.getByRole('link',{name:'Agents',exact:true})).toBeVisible();
 await expect(navigation.getByRole('link',{name:'Rooms',exact:true})).toBeVisible();
 const working=navigation.getByRole('link',{name:'Working',exact:true});await working.focus();await page.keyboard.press('Enter');
 await expect(page).toHaveURL(/state=Working/);await expect(page.getByRole('button',{name:/^Working \(/})).toHaveAttribute('aria-pressed','true');
 if(info.project.name==='390px')await page.getByRole('button',{name:'Menu',exact:true}).click();
 await navigation.getByRole('link',{name:'Rooms',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Rooms are not enabled yet'})).toBeVisible();
 await page.getByRole('link',{name:'Explore the Room interaction preview'}).click();
 await expect(page.getByRole('region',{name:'Room interaction preview'})).toBeVisible();
});
