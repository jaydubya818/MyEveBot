const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises');const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'../../..'),base='http://127.0.0.1:3198';
 const source=JSON.parse(await fs.readFile(path.join(root,'docs/verification/beta-integration/consolidation/canonical-journey.json'),'utf8'));
 const out=path.join(root,'output/playwright/consolidation-canonical');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({baseURL:base});
 const report={source:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),scope:'Authenticated final production build; real disposable PostgreSQL API; no model/provider calls',checks:[],audits:[]};
 try{
  expect((await context.request.get('/api/beta/work')).status()).toBe(401);report.checks.push('Anonymous Work access denied');
  expect((await context.request.post('/api/auth/login',{data:{password:'local-canonical-fixture-password'}})).status()).toBe(200);
  const state=await context.storageState();await context.addCookies(state.cookies.map(c=>({...c,secure:false})));
  for(const resource of ['goals','work','inbox','results','memory','activity']){
   const response=await context.request.get('/api/beta/'+resource);expect(response.status(),resource).toBe(200);
   const data=await response.json();
   if(resource==='work')expect(data.works.some(w=>w.id===source.workId)).toBe(true);
   if(resource==='results')expect(data.results.some(r=>r.work_id===source.workId)).toBe(true);
   report.checks.push('Owner-scoped '+resource+' real API PASS');
  }
  const page=await context.newPage();
  for(const route of ['/work?kind=work&id='+source.workId,'/today','/needs-you','/results','/memory','/brief','/capsules']){
   await page.goto(route);await page.waitForLoadState('networkidle');
   await expect(page.getByText('Some information is unavailable',{exact:true})).toHaveCount(0);
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});await page.addScriptTag({path:'/private/tmp/private-alpha-qa/node_modules/axe-core/axe.min.js'});
    const audit=await page.evaluate(async()=>({path:location.pathname,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,title:document.querySelector('h1')?.textContent,violations:(await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))}));
    expect(audit.overflow,route+' overflow').toBe(false);expect(audit.violations,route+' accessibility').toEqual([]);expect(audit.title).toBeTruthy();
    report.audits.push(audit);await page.screenshot({path:path.join(out,audit.path.slice(1)+'-'+width+'.png'),fullPage:true});
   }
  }
  report.status='PASS';console.log(JSON.stringify({status:report.status,checks:report.checks.length,audits:report.audits.length}));
 }catch(e){report.status='FAIL';report.error=String(e);throw e;}finally{await fs.writeFile(path.join(__dirname,'final-canonical-browser.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
