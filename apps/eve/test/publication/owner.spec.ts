import {test,expect} from '@playwright/test';
import {pool,reset,workId} from './harness.mjs';
test.beforeEach(async({context})=>{
 await reset();const response=await context.request.post('/api/auth/login',{data:{password:'owner-publication-fixture-only'}});expect(response.status()).toBe(200);
 const state=await context.storageState();await context.addCookies(state.cookies.map(c=>({...c,secure:false})));
});
test.afterAll(async()=>{await reset();await pool.end();});
for(const [label,expected,pushes,prs] of [['Open a pull request','PR_OPEN',1,1],['Push branch only','BRANCH_PUBLISHED',1,0],['Keep private','Kept private.',0,0],['Reject candidate','Candidate rejected.',0,0]] as const){
 test(`P0 real retained Result → Proof → owner decision → ${label}`,async({page},info)=>{
  await page.goto('/results');await page.getByRole('link',{name:'Review owner decision'}).click();
  await expect(page.getByRole('heading',{name:'Sofie finished the work'})).toBeVisible();
  await expect(page.getByText('$0.019032',{exact:true})).toBeVisible();
  await page.getByText('Proof of Work',{exact:true}).click();await expect(page.getByText(/Verified tree: ddcb301/)).toBeVisible();
  const radio=page.getByRole('radio',{name:label,exact:true});await radio.focus();await page.keyboard.press('Space');
  await page.getByRole('button',{name:'Review decision'}).click();await expect(page.getByRole('heading',{name:'Confirm: '+label})).toBeVisible();
  await page.getByRole('button',{name:'Confirm decision',exact:true}).click();
  await expect(page.getByText(new RegExp(expected.replace('.','\\.'))).first()).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'Sofie finished the work'})).toBeVisible();
  await expect.poll(async()=> (await pool.query('SELECT pushes,prs FROM publication_boundary_fixture')).rows[0]).toEqual({pushes,prs});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.addScriptTag({path:'/private/tmp/myeve-alpha-accessibility/node_modules/axe-core/axe.min.js'});
  const violations=await page.evaluate(async()=> (await (window as any).axe.run({runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations);
  expect(violations.map((v:any)=>({id:v.id,nodes:v.nodes.map((n:any)=>n.target)}))).toEqual([]);
  await page.screenshot({path:`../../output/playwright/publication/${info.project.name}-${pushes}-${prs}-${label.replaceAll(' ','-')}.png`,fullPage:true});
 });
}

test('P0 owner auth and cross-origin requests cannot record decisions',async({page,context})=>{
 const unsigned=await page.request.get('/api/beta/owner-decision?workId='+workId,{headers:{cookie:''}});expect(unsigned.status()).toBe(401);
 const view=await (await page.request.get('/api/beta/owner-decision?workId='+workId)).json();
 const rejected=await page.request.post('/api/beta/owner-decision',{headers:{origin:'https://foreign.invalid'},data:{workId,action:'open_pr',confirmed:true,bindingHash:view.bindingHash,previousId:null}});expect(rejected.status()).toBe(403);
 expect((await pool.query('SELECT count(*)::int n FROM engineering_owner_decisions')).rows[0].n).toBe(0);
});
