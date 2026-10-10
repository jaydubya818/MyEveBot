const {test,expect}=require('@playwright/test');
const {execFileSync}=require('node:child_process');
const env={...process.env,MYEVE_TEST_DATABASE_URL:require('./database.cjs').connectionString};
let fixture;
test.beforeEach(()=>{fixture=JSON.parse(execFileSync(process.execPath,['--import','tsx','test/owner-ux/decision-fixture.ts','seed'],{env,encoding:'utf8'}));});
test.afterEach(()=>{if(fixture)execFileSync(process.execPath,['--import','tsx','test/owner-ux/decision-fixture.ts','cleanup',fixture.workId],{env});});
test('alpha search finds canonical Work and does not fetch disabled sources',async({page})=>{
 const disabled=[];page.on('request',r=>{if(/\/api\/(owner-knowledge|goals|outcomes|agents)(\?|$)/.test(r.url()))disabled.push(r.url());});
 await page.request.post('/api/auth/login',{data:{password:'synthetic-ux-owner-a'}});
 await page.goto('/search?q=Organize');await expect(page.getByRole('link',{name:'Organize launch notes',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:/Memory|Specialists|Goals & work/})).toHaveCount(0);expect(disabled).toEqual([]);
 await page.getByRole('link',{name:'Organize launch notes',exact:true}).click();await expect(page).toHaveURL(new RegExp(fixture.workId));
 const result=await page.request.get('/api/work-inbox?q='+encodeURIComponent("%' OR 1=1 --"));expect(result.ok()).toBeTruthy();expect((await result.json()).works).toEqual([]);
 expect((await page.request.get('/api/work-inbox?q='+'x'.repeat(121))).status()).toBe(400);
 await page.request.post('/api/auth/login',{data:{password:'synthetic-ux-owner-b'}});
 const foreign=await page.request.get('/api/work-inbox?q=Organize');expect(foreign.ok()).toBeTruthy();expect(await foreign.text()).not.toContain(fixture.workId);
});
