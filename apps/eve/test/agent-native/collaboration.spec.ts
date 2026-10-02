import {test,expect} from '@playwright/test';
const data={connection:{agentId:'sofie-fixture',agentName:'Sofie',status:'active'},groupExecutionQualified:false,bounds:{requests:50,conversations:10},conversations:[{id:'conversation:qualification-handoff',correlated:true,updatedAt:'2026-10-02T12:00:00Z',requests:[{id:'request-fixture-reply',direction:'incoming',capability:'message.send',sender:'relay://fixture-owner/fixture-researcher',state:'completed'}]}]};
test.beforeEach(async({context,page})=>{
 await context.request.post('/api/auth/login',{data:{password:'owner-publication-fixture-only'}});const state=await context.storageState();await context.addCookies(state.cookies.map(c=>({...c,secure:false})));
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;if(path.startsWith('/api/auth/'))return route.continue();return route.fulfill({json:path==='/api/collaboration'?data:path==='/api/threads'?{threads:[]}:path==='/api/models'?{models:[]}:path==='/api/commands'?{commands:[]}: {}});});
});
test('handoff evidence stays collapsed and Group status stays honest',async({page},info)=>{
 await page.goto('/rooms');const panel=page.locator('[data-collaboration]');await expect(panel.getByText('Response recorded',{exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Persistent Groups are not enabled'})).toBeVisible();await expect(panel.getByText('relay://fixture-owner/fixture-researcher',{exact:true})).not.toBeVisible();
 const proof=panel.getByText('Proof of handoff',{exact:true});await proof.focus();await page.keyboard.press('Enter');await expect(panel.getByText('relay://fixture-owner/fixture-researcher',{exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.addScriptTag({path:'/private/tmp/myeve-alpha-accessibility/node_modules/axe-core/axe.min.js'});const violations=await panel.evaluate(async node=>(await (window as any).axe.run(node,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations);expect(violations.map((v:any)=>v.id)).toEqual([]);
 await page.screenshot({path:`../../output/playwright/agent-native/${info.project.name}-collaboration.png`,fullPage:true});
});
test('collaboration authentication and failed refresh are explicit',async({page})=>{
 expect((await page.request.get('/api/collaboration',{headers:{cookie:''}})).status()).toBe(401);expect((await page.request.get('/api/collaboration')).status()).toBe(200);
 await page.route('**/api/collaboration',route=>route.fulfill({status:503,json:{error:'Controlled outage'}}));await page.goto('/rooms');const panel=page.locator('[data-collaboration]');await expect(panel.getByRole('alert')).toBeVisible();await expect(panel.getByText('Response recorded',{exact:true})).toHaveCount(0);
 await page.unroute('**/api/collaboration');await panel.getByRole('button',{name:'Retry',exact:true}).click();await expect(panel.getByText('Agent conversation',{exact:true})).toBeVisible();
});
