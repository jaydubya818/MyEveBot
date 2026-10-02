import {test,expect} from '@playwright/test';
import {pool,reset} from '../publication/harness.mjs';
const thread='agent-native-controlled-thread';
test.beforeEach(async({context,page})=>{
 await reset();const r=await context.request.post('/api/auth/login',{data:{password:'owner-publication-fixture-only'}});expect(r.status()).toBe(200);
 const state=await context.storageState();await context.addCookies(state.cookies.map(c=>({...c,secure:false})));
 await page.addInitScript(({thread})=>{const prefix='myeve-private:owner:';localStorage.setItem(prefix+'eve-web-threads',JSON.stringify({activeId:thread,threads:[{id:thread,title:'Review quantity validation',updatedAt:1}]}));localStorage.setItem(prefix+'eve-web-chat:'+thread,JSON.stringify({events:[]}));},{thread});
 // Unrelated chat bootstrap only. Work/publication use real routes + PostgreSQL.
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;
  if(path.startsWith('/api/auth/')||path==='/api/work-thread'||path==='/api/beta/owner-decision')return route.continue();
  const bodies:Record<string,unknown>={'/api/threads':{threads:[{id:thread,title:'Review quantity validation',updatedAt:1}]},['/api/threads/'+thread]:{chat:{events:[]}},'/api/capabilities':{capabilities:[]},'/api/task-runs':{tasks:[]},'/api/agents':{agents:[]},'/api/models':{models:[]},'/api/commands':{commands:[]}};
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
