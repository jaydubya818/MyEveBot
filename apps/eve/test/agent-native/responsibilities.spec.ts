import {test,expect} from '@playwright/test';
test.beforeEach(async({context,page})=>{
 await context.request.post('/api/auth/login',{data:{password:'owner-publication-fixture-only'}});const state=await context.storageState();await context.addCookies(state.cookies.map(c=>({...c,secure:false})));
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;if(path.startsWith('/api/auth/')||path==='/api/responsibilities'||path==='/api/work-inbox')return route.continue();
  const responses:Record<string,unknown>={'/api/beta/activity':{changes:[]},'/api/beta/goals':{contractVersion:1,goals:[],nextCursor:null,canProceed:[],doing:[],blocked:[],needsYou:[],recentlyCompleted:[]},'/api/beta/work':{works:[]},'/api/beta/results':{results:[]},'/api/beta/inbox':{items:[],nextCursor:null},'/api/channels':{channels:[]},'/api/email':{configured:false,threads:[]},'/api/threads':{threads:[]},'/api/commands':{commands:[]},'/api/models':{models:[]}};
  return route.fulfill({json:responses[path]??{}});
 });
});
for(const destination of ['today','inbox'])test(`${destination} shows canonical responsibility records`,async({page},info)=>{
 await page.goto('/'+destination);const panel=page.locator(`[data-responsibilities="${destination}"]`);
 await expect(panel.getByText('Product qualification availability check',{exact:true})).toBeVisible();
 await expect(panel.getByText('The controlled listing is available. No purchase was made.',{exact:true})).toBeVisible();
 if(destination==='today'){await expect(panel.getByText('Waiting',{exact:true})).toBeVisible();await expect(panel.getByText('Scheduled next:',{exact:false})).toBeVisible();}
 else await expect(panel.getByRole('link',{name:'Open responsible agent'})).toHaveAttribute('href','/agents?agent=agent-native-watch-e');
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.addScriptTag({path:'/private/tmp/myeve-alpha-accessibility/node_modules/axe-core/axe.min.js'});
 const violations=await panel.evaluate(async node=>(await (window as any).axe.run(node,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations);expect(violations.map((v:any)=>v.id)).toEqual([]);
 if(info.project.name==='390px'){
  const menu=page.getByRole('button',{name:'Menu',exact:true});await expect(menu).toHaveAttribute('aria-expanded','false');await menu.click();await expect(page.getByRole('navigation',{name:'Primary'}).getByRole('link',{name:'Ask Sofie'})).toBeVisible();await page.keyboard.press('Escape');await expect(menu).toBeFocused();
 }
 await panel.scrollIntoViewIfNeeded();await page.screenshot({path:`../../output/playwright/agent-native/${info.project.name}-${destination}-responsibilities.png`,fullPage:true});
});
test('responsibility authentication and reconnect do not show stale status',async({page})=>{
 expect((await page.request.get('/api/responsibilities',{headers:{cookie:''}})).status()).toBe(401);
 await page.route('**/api/responsibilities',route=>route.fulfill({status:503,json:{error:'Controlled outage'}}));await page.goto('/today');const panel=page.locator('[data-responsibilities="today"]');await expect(panel.getByRole('alert')).toBeVisible();await expect(panel.getByText('Waiting',{exact:true})).toHaveCount(0);
 await page.unroute('**/api/responsibilities');await panel.getByRole('button',{name:'Retry responsibilities'}).click();await expect(panel.getByText('Waiting',{exact:true})).toBeVisible();
});
