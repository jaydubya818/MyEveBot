const {test,expect}=require('@playwright/test');
const {Pool}=require('pg');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const axe=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const owner='11111111-1111-4111-8111-111111111111';
const ids=[randomUUID(),randomUUID()];let pool;
test.beforeAll(async()=>{
 pool=new Pool({connectionString:'postgresql://ux_fixture:local-only@localhost:55491/blocker_fixes'});
 for(const [index,id] of ids.entries()) {
  await pool.query("INSERT INTO engineering_work(id,scope_id,scope_kind,created_by,title,objective,repository,max_cost_usd,max_duration_seconds,idempotency_key,request_hash,control) VALUES($1,$2,'personal',$2,$3,$4,'synthetic/alpha-tasks',1,180,$1,'synthetic',$5)",[id,owner,index?'Organize launch notes':'Add Priority to Alpha Tasks','Keep the requested outcome clear and privately reviewable.',index?'paused':'agent']);
  await pool.query("INSERT INTO engineering_work_criteria(scope_id,scope_kind,work_id,version,items,created_by) VALUES($1,'personal',$2,1,$3,$1)",[owner,id,JSON.stringify([{id:randomUUID(),statement:'The requested outcome is reviewable'}])]);
 }
});
test.afterAll(async()=>{if(!pool)return;for(const id of ids){await pool.query('DELETE FROM engineering_work_criteria WHERE work_id=$1',[id]);await pool.query('DELETE FROM engineering_work WHERE id=$1',[id]);}await pool.end();});
for(const width of [1440,390])test(`durable populated Today and Work at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.clock.setFixedTime(new Date('2026-10-09T01:00:00Z'));
 expect((await page.request.post('/api/auth/login',{data:{password:'synthetic-ux-owner-a'}})).ok()).toBeTruthy();
 await page.goto('/today');await expect(page.getByRole('link',{name:'Add Priority to Alpha Tasks',exact:true})).toBeVisible();
 await expect(page.getByText('Organize launch notes',{exact:true})).toHaveCount(0);
 await page.goto('/work');await expect(page.locator(`[data-work-id="${ids[0]}"]`)).toContainText('Queued');
 await page.getByRole('button',{name:'Stopped (1)',exact:true}).click();await expect(page.getByRole('link',{name:'Organize launch notes',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Organize launch notes',exact:true}).click();await expect(page.locator('.owner-work-summary')).toContainText('This Work is paused');
 await page.reload();await expect(page.locator('.owner-work-summary')).toContainText('Stopped');await expect(page.getByText('Technical details',{exact:true})).not.toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 await page.addScriptTag({content:axe});const findings=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));expect(findings.violations.filter(v=>['critical','serious'].includes(v.impact))).toEqual([]);
 await page.addStyleTag({content:'nextjs-portal {display:none!important}'});await page.screenshot({path:test.info().outputPath(`work-detail-stopped-${width}.png`),fullPage:true});
});
