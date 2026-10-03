import {test,expect} from '@playwright/test';
const id='agent_e0954312-6a71-4727-a915-f1484a0b8736';
const agent={id,ownerId:'owner',name:'Sofie',slug:'qualification-sofie',role:'Primary Digital Worker',description:'Coordinates your goals and brings back useful Results.',instructions:'Controlled canonical fixture.',status:'active',isPrimary:true,preferredModel:null,reasoningPreference:'default',avatarConfig:{},riskCeiling:'low',notificationPolicy:'activity',limits:{maxSteps:20,maxRuntimeSeconds:600,maxEstimatedCostUsd:1,maxRetries:1},capabilities:[],createdAt:'2026-10-02T00:00:00Z',updatedAt:'2026-10-02T00:00:00Z',archivedAt:null};
test.beforeEach(async({context,page})=>{
 const response=await context.request.post('/api/auth/login',{data:{password:'owner-publication-fixture-only'}});expect(response.status()).toBe(200);
 const state=await context.storageState();await context.addCookies(state.cookies.map(c=>({...c,secure:false})));
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;
  if(path.startsWith('/api/auth/')||path.endsWith('/home'))return route.continue();
  return route.fulfill({json:path==='/api/agents'?{agents:[agent]}:path==='/api/capabilities'?{capabilities:[],registry:[]}:path==='/api/threads'?{threads:[]}:path==='/api/models'?{models:[]}:path==='/api/commands'?{commands:[]}:{}});
 });
 await page.route('**/eve/v1/**',route=>route.fulfill({status:503,json:{error:'No model execution'}}));
});
test('persistent agent home shows canonical Work and history with Advanced collapsed',async({page},info)=>{
 await page.goto('/agents?agent='+id);const home=page.getByRole('region',{name:'Agent activity'});
 await expect(home.getByRole('heading',{name:'Work and Results'})).toBeVisible();
 await expect(home.getByRole('link',{name:'Review quantity validation'})).toBeVisible();
 await expect(home.getByText('No routines assigned.',{exact:false})).toBeVisible();
 await expect(page.getByText('Controlled canonical fixture.',{exact:true})).not.toBeVisible();
 const details=page.getByText('Advanced — instructions and model policy',{exact:true});await details.focus();await page.keyboard.press('Enter');
 await expect(page.getByText('Controlled canonical fixture.',{exact:true})).toBeVisible();await details.click();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await home.scrollIntoViewIfNeeded();await page.addScriptTag({path:'/private/tmp/myeve-alpha-accessibility/node_modules/axe-core/axe.min.js'});
 const violations=await home.evaluate(async node=>(await (window as any).axe.run(node,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations);
 expect(violations.map((v:any)=>v.id)).toEqual([]);
 await page.screenshot({path:`../../output/playwright/agent-native/${info.project.name}-agent-home.png`,fullPage:true});
});
test('agent home authorization and honest outage recovery',async({page})=>{
 expect((await page.request.get(`/api/agents/${id}/home`,{headers:{cookie:''}})).status()).toBe(401);
 expect((await page.request.get('/api/agents/foreign-agent/home')).status()).toBe(404);
 await page.route('**/api/agents/*/home',route=>route.fulfill({status:503,json:{error:'Controlled outage'}}));
 await page.goto('/agents?agent='+id);const home=page.getByRole('region',{name:'Agent activity'});
 await expect(home.getByRole('alert')).toBeVisible();await expect(home.getByText('Idle',{exact:true})).toHaveCount(0);
 await page.unroute('**/api/agents/*/home');await home.getByRole('button',{name:'Retry agent activity'}).click();
 await expect(home.getByRole('heading',{name:'Work and Results'})).toBeVisible();
});
