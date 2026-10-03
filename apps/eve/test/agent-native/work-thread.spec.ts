import {test,expect} from '@playwright/test';
import {pool,reset,service,workId} from '../publication/harness.mjs';
const thread='agent-native-controlled-thread';
test.beforeEach(async({context,page})=>{
 await reset();const r=await context.request.post('/api/auth/login',{data:{password:'owner-publication-fixture-only'}});expect(r.status()).toBe(200);
 const state=await context.storageState();await context.addCookies(state.cookies.map(c=>({...c,secure:false})));
 await page.addInitScript(({thread})=>{const prefix='myeve-private:owner:';localStorage.setItem(prefix+'eve-web-threads',JSON.stringify({activeId:thread,threads:[{id:thread,title:'Review quantity validation',updatedAt:1}]}));localStorage.setItem(prefix+'eve-web-chat:'+thread,JSON.stringify({events:[]}));},{thread});
 // Unrelated chat bootstrap only. Work/publication use real routes + PostgreSQL.
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;
  if(path.startsWith('/api/auth/')||path==='/api/work-thread'||path==='/api/work-inbox'||path==='/api/beta/owner-decision')return route.continue();
  const bodies:Record<string,unknown>={'/api/responsibilities':{executionQualified:false,routines:[],results:[]},'/api/channels':{channels:[]},'/api/email':{configured:false,threads:[]},'/api/threads':{threads:[{id:thread,title:'Review quantity validation',updatedAt:1}]},['/api/threads/'+thread]:{chat:{events:[]}},'/api/capabilities':{capabilities:[]},'/api/task-runs':{tasks:[]},'/api/agents':{agents:[]},'/api/models':{models:[]},'/api/commands':{commands:[]}};
  return route.fulfill({json:bodies[path]??{}});
 });
 await page.route('**/eve/v1/**',route=>route.fulfill({status:503,json:{error:'No model execution in deterministic presentation test'}}));
});
test.afterAll(async()=>{await reset();await pool.end();});
for(const [choice,expected,pushes,prs] of [['Open a pull request','PR_OPEN',1,1],['Push branch only','BRANCH_PUBLISHED',1,0],['Keep private','Kept private.',0,0],['Reject candidate','Candidate rejected.',0,0]] as const){
 test(`conversation → canonical Result → ${choice}`,async({page},info)=>{
  await page.goto('/chat');const canvas=page.getByRole('region',{name:'Work in this conversation'});
  await expect(canvas.locator('[data-work-id]')).toHaveCount(1);
  await expect(canvas.getByRole('heading',{name:'Needs You — owner decision'})).toBeVisible();
  await canvas.getByText('Proof of Work / Advanced',{exact:true}).click();
  await expect(canvas.getByText(/Run history:/)).toBeVisible();
  await canvas.getByText('Proof of Work / Advanced',{exact:true}).click();
  const radio=canvas.getByRole('radio',{name:choice,exact:true});await radio.focus();await page.keyboard.press('Space');
  await canvas.getByRole('button',{name:'Review decision'}).click();
  await expect(canvas.getByRole('heading',{name:'Confirm: '+choice})).toBeVisible();
  await canvas.getByRole('button',{name:'Confirm decision',exact:true}).click();
  await expect(canvas.getByText(new RegExp(expected.replace('.','\\.'))).first()).toBeVisible();
  await expect.poll(async()=>(await pool.query('SELECT pushes,prs FROM publication_boundary_fixture')).rows[0]).toEqual({pushes,prs});
  await page.reload();await expect(canvas.getByText(new RegExp(expected.replace('.','\\.'))).first()).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/chat');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.addScriptTag({path:'/private/tmp/myeve-alpha-accessibility/node_modules/axe-core/axe.min.js'});
  const violations=await canvas.evaluate(async node=>(await (window as any).axe.run(node,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations);
  expect(violations.map((v:any)=>({id:v.id,nodes:v.nodes.map((n:any)=>n.target)}))).toEqual([]);
  await page.screenshot({path:`../../output/playwright/agent-native/${info.project.name}-${choice.replaceAll(' ','-')}.png`,fullPage:true});
 });
}
test('unsigned, other-thread and fork data cannot reveal Work',async({page})=>{
 expect((await page.request.get('/api/work-thread?threadId='+thread,{headers:{cookie:''}})).status()).toBe(401);
 expect((await page.request.get('/api/work-thread?threadId=agent-native-other')).status()).toBe(404);
 expect((await (await page.request.get('/api/work-thread?threadId=agent-native-fork')).json()).works).toEqual([]);
});

test('refresh failure hides decision controls until canonical recovery',async({page})=>{
 await page.goto('/chat');const canvas=page.getByRole('region',{name:'Work in this conversation'});
 await expect(canvas.getByRole('heading',{name:'Needs You — owner decision'})).toBeVisible();
 await page.route('**/api/work-thread?**',route=>route.fulfill({status:503,json:{error:'Controlled outage'}}));
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect(canvas.getByRole('alert')).toContainText('could not be refreshed');
 await expect(canvas.getByRole('button',{name:'Review decision'})).toHaveCount(0);
 await page.unroute('**/api/work-thread?**');
 await canvas.getByRole('button',{name:'Retry Work progress'}).click();
 await expect(canvas.getByRole('heading',{name:'Needs You — owner decision'})).toBeVisible();
});

test('failed independent review is visible inline without opening Proof',async({page},info)=>{
 await page.goto('/chat');const canvas=page.getByRole('region',{name:'Work in this conversation'});
 await canvas.getByRole('radio',{name:'Open a pull request',exact:true}).check();await canvas.getByRole('button',{name:'Review decision'}).click();await canvas.getByRole('button',{name:'Confirm decision',exact:true}).click();await expect(canvas.getByText(/Publication: PR_OPEN/)).toBeVisible();
 const view=await service.view('owner',workId),b=view.binding;
 await service.retainReadback('owner',workId,{binding:b,observedAt:new Date().toISOString(),branchCount:1,prCount:1,candidate:b.candidate,tree:b.verifiedTree,baseRef:b.baseRef,baseSha:b.expectedBaseSha,prNumber:1,prUrl:`https://github.com/${b.repository}/pull/1`,draft:true,merged:false,files:b.allowedPaths,ci:{status:'PASS',workflow:'quantity-ci',candidate:b.candidate,runId:'controlled',url:'https://github.com/example/controlled',checks:[{name:'quantity-ci',candidate:b.candidate,result:'PASS'}]},review:{status:'FAIL',candidate:b.candidate,reviewer:'independent-controlled-review',mode:'INDEPENDENT_READ_ONLY',reportHash:'a'.repeat(64),summary:'Numeric range requires separate candidate lifecycle.',testsPassed:11,findings:['Precision loss'],limitations:[]},ownerAcceptance:'NOT_RUN',merge:'NOT_RUN',deployment:'NOT_RUN'});
 await page.reload();await expect(canvas.getByRole('alert')).toContainText('Independent review found an issue: Numeric range requires separate candidate lifecycle.');await expect(canvas.getByRole('alert')).toContainText('Current Result remains partial.');
 expect((await service.view('owner',workId)).proof).toEqual(view.proof);
 await page.screenshot({path:`../../output/playwright/agent-native/${info.project.name}-inline-review-failure.png`,fullPage:true});
});

// Readback-only P0 coverage. No background execution or cloud qualification.
test('reconnect and a second owner client retain one canonical Work without effects',async({page,context},info)=>{
 const before=await page.request.get('/api/work-thread?threadId='+thread);
 const saved=await before.json();expect(saved.works).toHaveLength(1);
 const identity=(body:any)=>body.works.map(({projection:p}:any)=>({workId:p.workId,version:p.workVersion,generation:p.workGeneration,resultId:p.latestResult?.id??p.nativeResult?.id}));
 const initial=identity(saved);
 const stored=(await pool.query('SELECT id,version,generation FROM engineering_work WHERE id=$1',[workId])).rows;
 await page.goto('/chat');
 const canvas=page.getByRole('region',{name:'Work in this conversation'});
 await expect(canvas.locator('[data-work-id]')).toHaveCount(1);
 // Page bootstrap is stubbed; a second authenticated client reads the real API.
 // No fabricated environment endpoint participates in this qualification.
 const second=await context.newPage();
 try{
  const result=await second.request.get('/api/work-thread?threadId='+thread);
  expect(result.status()).toBe(200);expect(identity(await result.json())).toEqual(initial);
  await context.setOffline(true);
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(canvas.getByRole('alert')).toContainText('could not be refreshed');
  await expect(canvas.getByRole('button',{name:'Review decision'})).toHaveCount(0);
  await context.setOffline(false);
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(canvas.getByRole('alert')).toHaveCount(0);
  await expect(canvas.getByRole('heading',{name:'Needs You — owner decision'})).toBeVisible();
  const after=await page.request.get('/api/work-thread?threadId='+thread);
  expect(identity(await after.json())).toEqual(initial);
  expect((await pool.query('SELECT id,version,generation FROM engineering_work WHERE id=$1',[workId])).rows).toEqual(stored);
  expect((await pool.query('SELECT pushes,prs FROM publication_boundary_fixture')).rows[0]).toEqual({pushes:0,prs:0});
  await page.screenshot({path:`../../output/playwright/agent-native/${info.project.name}-work-reconnect.png`,fullPage:true});
 }finally{await context.setOffline(false);await second.close();}
});

test('Work settles into Completed without archiving its conversation',async({page},info)=>{
 await page.goto('/chat');const canvas=page.getByRole('region',{name:'Work in this conversation'});
 await canvas.getByRole('radio',{name:'Keep private',exact:true}).check();
 await canvas.getByRole('button',{name:'Review decision'}).click();
 await canvas.getByRole('button',{name:'Confirm decision',exact:true}).click();
 await expect(canvas.getByText('Kept private.',{exact:false}).first()).toBeVisible();
 await page.goto('/inbox');const inbox=page.getByRole('region',{name:'Work Inbox',exact:true});
 const completed=inbox.getByRole('button',{name:/^Completed/});await completed.focus();await page.keyboard.press('Enter');
 await expect(inbox.locator(`[data-work-id="${workId}"]`)).toHaveAttribute('data-work-state','Completed');
 await expect(inbox.getByText('Verified Result kept private. Conversation remains open.')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.addScriptTag({path:'/private/tmp/myeve-alpha-accessibility/node_modules/axe-core/axe.min.js'});
 expect(await inbox.evaluate(async node=>(await (window as any).axe.run(node,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations)).toEqual([]);
 await page.screenshot({path:`../../output/playwright/agent-native/${info.project.name}-work-inbox-settled.png`,fullPage:true});
 await inbox.getByRole('link',{name:'Continue conversation'}).click();
 await expect(page.getByRole('region',{name:'Work in this conversation'}).locator('[data-work-id]')).toHaveCount(1);
 await expect(page.getByRole('region',{name:'Work in this conversation'})).toHaveAttribute('data-thread-id',thread);
 expect((await page.request.get('/api/work-inbox',{headers:{cookie:''}})).status()).toBe(401);
});
