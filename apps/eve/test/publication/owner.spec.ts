import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
import {test,expect} from '@playwright/test';
import {pool,reset,workId,service} from './harness.mjs';
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
  await page.getByText('Canonical evidence references',{exact:true}).click();
  const repeated=page.getByText(/protected-evidence:sha256:db5bde1545dd47df4b1782eb4c995a4064166568f73e3231c96e47fec3c8a535/);
  await expect(repeated).toHaveCount(1);await expect(repeated).toContainText('referenced by 6 checks');
  const radio=page.getByRole('radio',{name:label,exact:true});await radio.focus();await page.keyboard.press('Space');
  await page.getByRole('button',{name:'Review decision'}).click();await expect(page.getByRole('heading',{name:'Confirm: '+label})).toBeVisible();
  await page.getByRole('button',{name:'Confirm decision',exact:true}).click();
  await expect(page.getByText(new RegExp(expected.replace('.','\\.'))).first()).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'Sofie finished the work'})).toBeVisible();
  await expect.poll(async()=> (await pool.query('SELECT pushes,prs FROM publication_boundary_fixture')).rows[0]).toEqual({pushes,prs});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
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

test('P0 current CI/review supplements immutable Proof and never implies owner acceptance',async({page})=>{
 await page.goto(`/work/${workId}/decision`);
 await page.getByRole('radio',{name:'Open a pull request',exact:true}).check();
 await page.getByRole('button',{name:'Review decision'}).click();await page.getByRole('button',{name:'Confirm decision',exact:true}).click();
 await expect(page.getByText(/Publication: PR_OPEN/)).toBeVisible();
 const v=await service.view('owner',workId),b=v.binding;
 await service.retainReadback('owner',workId,{binding:b,observedAt:new Date().toISOString(),branchCount:1,prCount:1,candidate:b.candidate,tree:b.verifiedTree,baseRef:b.baseRef,baseSha:b.expectedBaseSha,prNumber:1,prUrl:`https://github.com/${b.repository}/pull/1`,draft:true,merged:false,files:b.allowedPaths,ci:{status:'PASS',workflow:'quantity-ci',candidate:b.candidate,runId:'controlled',url:'https://github.com/example/controlled',checks:[{name:'quantity-ci',candidate:b.candidate,result:'PASS'}]},review:{status:'FAIL',candidate:b.candidate,reviewer:'independent-controlled-review',mode:'INDEPENDENT_READ_ONLY',reportHash:'a'.repeat(64),summary:'Numeric range requires separate candidate lifecycle.',testsPassed:11,findings:['Precision loss'],limitations:[]},ownerAcceptance:'NOT_RUN',merge:'NOT_RUN',deployment:'NOT_RUN'});
 await page.reload();await page.getByText('Proof of Work',{exact:true}).click();
 await expect(page.getByText(/GitHub CI: PASS · Independent review: FAIL/)).toBeVisible();
 await expect(page.getByText('Current Result: PARTIAL. Owner acceptance remains NOT_RUN.')).toBeVisible();
 expect((await service.view('owner',workId)).proof).toEqual(v.proof);
 await page.goto('/results');await page.getByText('Proof of Work',{exact:true}).click();
 await expect(page.getByText(/Current publication: PASS · GitHub CI: PASS · Independent review: FAIL/)).toBeVisible();
 await expect(page.getByText(/protected-evidence:sha256:db5bde1545dd47df4b1782eb4c995a4064166568f73e3231c96e47fec3c8a535/)).toHaveCount(1);
});
