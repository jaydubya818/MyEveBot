const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const root=path.resolve(__dirname,'../../..'),out=path.join(root,'output/playwright/business-scopes');await fs.mkdir(out,{recursive:true});
 const report={scope:'Production build; real disposable PostgreSQL; separate signed A/B sessions; no provider calls',checks:[],audits:[]};
 try{
  for(const owner of ['A','B']){
   const ctx=await browser.newContext({baseURL:'http://localhost:3199'});
   expect((await ctx.request.get('/api/business')).status()).toBe(401);
   expect((await ctx.request.post('/api/auth/login',{data:{password:`owner-${owner.toLowerCase()}-private-password`}})).status()).toBe(200);
   const state=await ctx.storageState();await ctx.addCookies(state.cookies.map(c=>({...c,secure:false})));
   const response=await ctx.request.get('/api/business');expect(response.status()).toBe(200);const data=await response.json();expect(data.owner).toBe(owner);
   if(owner==='B'){expect(JSON.stringify(data)).not.toContain('NEW_PRIVATE_CANARY');expect(data.shared.some(r=>r.kind==='WORK')).toBe(true);}
   if(owner==='A')expect(JSON.stringify(data)).not.toContain('B_PRIVATE_FILE');
   expect((await ctx.request.post('/api/business',{headers:{origin:'https://foreign.example'},data:{operation:'leave'}})).status()).toBe(403);
   report.checks.push(owner+' signed identity, private isolation, shared Work and CSRF PASS');
   const page=await ctx.newPage();await page.goto('/business');await expect(page.getByRole('heading',{name:'Our business',exact:true})).toBeVisible();await expect(page.getByText('Both partners have accepted.')).toBeVisible();
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await page.addScriptTag({path:'/private/tmp/private-alpha-qa/node_modules/axe-core/axe.min.js'});
    const audit=await page.evaluate(async()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,violations:(await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))}));
    expect(audit.overflow).toBe(false);expect(audit.violations).toEqual([]);report.audits.push({owner,...audit});await page.screenshot({path:path.join(out,owner+'-'+width+'.png'),fullPage:true});
   }
   if(owner==='A'){
    await page.getByLabel('Private item').selectOption('MEMORY|memory_a');await expect(page.locator('pre').filter({hasText:'NEW_PRIVATE_CANARY'})).toBeVisible();
    await page.getByRole('button',{name:'Share reviewed content'}).click();await expect(page.getByRole('status').filter({hasText:'Saved.'})).toBeVisible();
    const fresh=await (await ctx.request.get('/api/business')).json();const grant=fresh.grants.find(g=>g.resource_id==='memory_a'&&!g.revoked_at);expect(grant).toBeTruthy();
    expect((await ctx.request.post('/api/business',{data:{operation:'revoke',value:grant.id}})).status()).toBe(200);
    report.checks.push('A explicitly shares reviewed Memory and revokes through real API');
   }
   await ctx.close();
  }
  const shared=await browser.newContext({baseURL:'http://localhost:3199'});
  await shared.request.post('/api/auth/login',{data:{password:'owner-a-private-password'}});
  let state=await shared.storageState();await shared.addCookies(state.cookies.map(c=>({...c,secure:false})));
  const first=await shared.newPage();await first.goto('/business');await expect(first.getByRole('heading',{name:'Our business',exact:true})).toBeVisible();
  await first.evaluate(()=>{
   localStorage.setItem('eve-web-threads',JSON.stringify({activeId:'private-canary-thread',threads:[{id:'private-canary-thread',title:'A_CACHE_CANARY_CONVERSATION',updatedAt:Date.now()}]}));
   localStorage.setItem('eve-web-chat:private-canary-thread',JSON.stringify({forkContext:'A_CACHE_CANARY_TRANSCRIPT',events:[],savedAt:Date.now()}));
   sessionStorage.setItem('eve-web-draft:private-canary-thread','A_CACHE_CANARY_DRAFT');
   // Seed the current A namespace as well as the legacy data.
   localStorage.setItem('myeve-private:A:eve-web-threads',localStorage.getItem('eve-web-threads'));
  });
  await first.goto('/chat');await expect(first.getByRole('button',{name:/A_CACHE_CANARY_CONVERSATION/}).first()).toBeVisible();
  const stale=await shared.newPage();await stale.goto('/business');await expect(stale.getByRole('heading',{name:'Our business',exact:true})).toBeVisible();
  await first.goto('/login');await first.getByLabel('Your access password').fill('owner-b-private-password');await first.getByRole('button',{name:/Open Sofie/}).click();
  await first.waitForURL(url=>url.pathname!=='/login');await expect(stale).toHaveURL(/\/login/);
  await first.goto('/chat');await expect(first.locator('body')).not.toContainText('A_CACHE_CANARY');
  expect(await first.locator('textarea').evaluateAll(nodes=>nodes.map(n=>n.value).join(' '))).not.toContain('A_CACHE_CANARY');
  for(const endpoint of ['/api/connections','/api/email','/api/computer','/api/computer-profiles'])expect((await shared.request.get(endpoint)).status()).toBe(403);
  expect((await shared.request.get('/api/files',{headers:{'x-myeve-browser-owner':'A'}})).status()).toBe(401);
  report.checks.push('A legacy/current cached conversations and drafts absent after B UI sign-in; other A tab invalidated; credential endpoints denied; stale owner requests denied');
  await shared.close();
  report.status='PASS';console.log(JSON.stringify({status:'PASS',checks:report.checks.length,audits:report.audits.length}));
 }catch(e){report.status='FAIL';report.error=String(e);throw e;}finally{await fs.writeFile(path.join(__dirname,'business-browser.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
