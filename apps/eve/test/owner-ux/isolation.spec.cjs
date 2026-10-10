const {test,expect}=require('@playwright/test');
const {Pool}=require('pg');
const {randomUUID}=require('node:crypto');
const owner='22222222-2222-4222-8222-222222222222';
const marker='Synthetic historical engineering qualification';
let pool;const ids={work:randomUUID(),goal:randomUUID(),thread:randomUUID(),file:randomUUID()};
test.beforeAll(async()=>{
 pool=new Pool({connectionString:require('./database.cjs').connectionString});
 await pool.query('INSERT INTO goals(id,owner_id,title) VALUES($1,$2,$3)',[ids.goal,owner,marker]);
 await pool.query('INSERT INTO web_chat_threads(id,owner_id,title,updated_at) VALUES($1,$2,$3,$4)',[ids.thread,owner,marker,Date.now()]);
 await pool.query("INSERT INTO engineering_work(id,scope_id,scope_kind,created_by,title,objective,repository,max_cost_usd,max_duration_seconds,idempotency_key,request_hash) VALUES($1,$2,'personal',$2,$3,$3,'synthetic/alpha-tasks',1,180,$1,'synthetic')",[ids.work,owner,marker]);
 await pool.query("INSERT INTO engineering_work_criteria(scope_id,scope_kind,work_id,version,items,created_by) VALUES($1,'personal',$2,1,$3,$1)",[owner,ids.work,JSON.stringify([{id:randomUUID(),statement:'Synthetic isolation criterion'}])]);
 await pool.query('INSERT INTO chat_files(id,thread_id,filename,media_type,size_bytes,blob_url,blob_path,owner_id) VALUES($1,$2,$3,$4,1,$5,$6,$7)',[ids.file,ids.thread,'foreign-qualification.txt','text/plain','https://fixture.private.blob.vercel-storage.com/foreign','foreign',owner]);
});
test.afterAll(async()=>{if(!pool)return;await pool.query('DELETE FROM chat_files WHERE id=$1',[ids.file]);await pool.query('DELETE FROM engineering_work_criteria WHERE work_id=$1',[ids.work]);await pool.query('DELETE FROM engineering_work WHERE id=$1',[ids.work]);await pool.query('DELETE FROM goals WHERE id=$1',[ids.goal]);await pool.query('DELETE FROM web_chat_threads WHERE id=$1',[ids.thread]);await pool.end();});
test('clean owner cannot see foreign historical Work, goals, conversations or files',async({page})=>{
 const login=await page.request.post('/api/auth/login',{data:{password:'synthetic-ux-owner-a'}});expect(login.ok()).toBeTruthy();
 for(const route of ['/api/beta/work','/api/beta/goals','/api/work-inbox','/api/threads','/api/files','/api/beta/inbox','/api/beta/results']) {
  const response=await page.request.get(route);expect(response.ok(),route).toBeTruthy();const text=await response.text();expect(text).not.toContain(marker);for(const id of Object.values(ids))expect(text).not.toContain(id);
 }
 for(const route of [`/api/beta/work?workId=${ids.work}`,`/api/threads/${ids.thread}`,`/api/files/${ids.file}/content`]){const response=await page.request.get(route);expect([403,404],route).toContain(response.status());expect(await response.text()).not.toContain(marker);}
 for(const route of ['/today','/work','/needs-you','/workspace','/chat']){await page.goto(route);await expect(page.locator('.owner-brand')).toBeVisible();await expect(page.getByText(marker)).toHaveCount(0);}
});
test('foreign records remain available to their owner',async({page})=>{
 expect((await page.request.post('/api/auth/login',{data:{password:'synthetic-ux-owner-b'}})).ok()).toBeTruthy();
 for(const route of ['/api/beta/goals','/api/threads','/api/files']){const response=await page.request.get(route);expect(response.ok(),route).toBeTruthy();expect(await response.text()).toMatch(/Synthetic historical engineering qualification|foreign-qualification/);}
});
