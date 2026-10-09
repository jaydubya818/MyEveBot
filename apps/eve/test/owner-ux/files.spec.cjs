const {test,expect}=require('@playwright/test');
const {randomUUID}=require('node:crypto');
const {Pool}=require('pg');
const fs=require('node:fs');
const {capture:visualCapture}=require('./visual.cjs');
const axe=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const owner='11111111-1111-4111-8111-111111111111';
let artifactIds=[],threadId,fileId,pool;
test.beforeEach(()=>{artifactIds=[];threadId=randomUUID();fileId=randomUUID();pool=new Pool({connectionString:'postgresql://ux_fixture:local-only@localhost:55491/blocker_fixes'});});
test.afterEach(async({request})=>{
 expect((await request.post('/api/auth/login',{data:{password:'synthetic-ux-owner-a'}})).ok()).toBeTruthy();
 for(const id of artifactIds){const removed=await request.delete(`/api/artifacts/${id}`);expect(removed.status(),await removed.text()).toBe(200);}
 await pool.query('DELETE FROM chat_files WHERE owner_id=$1 AND id=$2',[owner,fileId]);
 await request.delete(`/api/threads/${threadId}`);await pool.end();
});
async function capture(page,name){
 await page.addScriptTag({content:axe});const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));expect(audit.violations.filter(v=>['critical','serious'].includes(v.impact))).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 await page.addStyleTag({content:'nextjs-portal{display:none!important}'});await visualCapture(page,name);
}
for(const width of [1440,390])test(`Files upload, discovery, preview and owner boundary at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.request.post('/api/auth/login',{data:{password:'synthetic-ux-owner-a'}});
 await page.goto('/workspace');await expect(page.getByRole('heading',{name:'Your files live here'})).toBeVisible();
 // Actual browser upload uses the local Blob adapter and real registration route.
 const registration=page.waitForResponse(r=>r.url().endsWith('/api/artifacts')&&r.request().method()==='POST');
 await page.getByLabel('Upload file',{exact:true}).setInputFiles({name:'launch-notes.md',mimeType:'text/markdown',buffer:Buffer.from('# Launch notes\n\nA private launch checklist.\n')});
 const saved=await registration;expect(saved.status(),await saved.text()).toBe(201);const artifact=(await saved.json()).artifact;artifactIds.push(artifact.id);
 await expect(page.getByRole('status').filter({hasText:'launch-notes.md is saved.'})).toBeVisible();
 await expect(page.getByRole('link',{name:'launch-notes',exact:true})).toBeVisible();
 expect((await page.request.put(`/api/threads/${threadId}`,{data:{title:'Launch planning',updatedAt:Date.now()}})).ok()).toBeTruthy();
 const generatedId=randomUUID(),versionId=randomUUID();
 const generated=await page.request.post('/api/artifacts',{data:{artifactId:generatedId,versionId,title:'Launch brief',filename:'launch-brief.md',mimeType:'text/markdown',content:'# Launch brief\n\nPrepare the private review.\n',threadId}});
 expect(generated.status(),await generated.text()).toBe(201);artifactIds.push(generatedId);
 // Synthetic attribution for presentation; no model generation is claimed.
 await pool.query("UPDATE artifacts SET created_by='Sofie' WHERE id=$1 AND workspace_id='default'",[generatedId]);
 const pathname=`chat-files/${fileId}/research.txt`,bytes='Synthetic launch research';
 const blob=await page.request.put(`http://127.0.0.1:3174/?pathname=${encodeURIComponent(pathname)}`,{headers:{'x-content-type':'text/plain'},data:bytes});expect(blob.ok()).toBeTruthy();
 expect((await page.request.post('/api/files',{data:{id:fileId,threadId,filename:'research.txt',mediaType:'text/plain',sizeBytes:Buffer.byteLength(bytes),blobUrl:(await blob.json()).url,blobPath:pathname}})).status()).toBe(200);
 for (const [index,id] of artifactIds.entries()) await pool.query("UPDATE artifacts SET created_at=$2, updated_at=$2 WHERE id=$1",[id,`2026-10-09T0${index+1}:00:00Z`]);
 await pool.query("UPDATE chat_files SET created_at='2026-10-09T03:00:00Z' WHERE owner_id=$1 AND id=$2",[owner,fileId]);
 await page.reload();await expect(page.getByRole('link',{name:'Launch brief',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'research.txt',exact:true})).toBeVisible();await expect(page.getByText('Created by Sofie',{exact:false})).toBeVisible();
 await capture(page,`files-populated-${width}.png`);
 await page.getByRole('button',{name:'Created',exact:true}).click();await expect(page.getByRole('link',{name:'Launch brief',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'research.txt',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'All files',exact:true}).click();await page.getByRole('searchbox',{name:'Search files'}).fill('research');await expect(page.getByRole('link',{name:'research.txt',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Launch brief',exact:true})).toHaveCount(0);
 const download=await page.request.get(`/api/artifacts/${artifact.id}/content?download=1`);expect(download.ok()).toBeTruthy();expect(await download.text()).toContain('A private launch checklist.');expect(download.headers()['content-disposition']).toContain('attachment');
 await page.goto(`/workspace/${artifact.id}`);await expect(page.getByRole('button',{name:'Download this revision'})).toBeVisible();await expect(page.getByRole('button',{name:/Share/})).toHaveCount(0);await expect(page.getByText('A private launch checklist.')).toBeVisible();
 await capture(page,`file-preview-${width}.png`);
 const preview=page.getByRole('tab',{name:'preview',exact:true});await preview.focus();await page.keyboard.press('ArrowRight');await expect(page.getByRole('tab',{name:'edit',exact:true})).toBeFocused();await expect(page.getByRole('textbox',{name:'Edit launch-notes'})).toBeVisible();await page.keyboard.press('Home');await expect(preview).toBeFocused();await expect(preview).toHaveAttribute('aria-selected','true');
 expect((await page.request.post(`/api/artifacts/${artifact.id}/shares`,{data:{versionId:artifact.currentVersionId}})).status()).toBe(404);
 await page.request.post('/api/auth/login',{data:{password:'synthetic-ux-owner-b'}});
 for(const route of ['/api/artifacts',`/api/artifacts/${artifact.id}`,`/api/artifacts/${artifact.id}/content`,`/api/files/${fileId}/content`]){const r=await page.request.get(route);expect([403,404],route).toContain(r.status());expect(await r.text()).not.toContain('launch checklist');}
});
test('file upload validation and inventory recovery are understandable',async({page})=>{
 await page.request.post('/api/auth/login',{data:{password:'synthetic-ux-owner-a'}});
 await page.goto('/workspace');await page.getByLabel('Upload file',{exact:true}).setInputFiles({name:'unsupported.exe',mimeType:'application/octet-stream',buffer:Buffer.from('not a document')});
 await expect(page.locator('.owner-page').getByRole('alert')).toContainText('Use Markdown, HTML, PDF, CSV, XLSX, or PPTX.');await expect(page.getByRole('button',{name:'Upload file',exact:true})).toBeEnabled();
 await page.route('**/api/artifacts',route=>route.fulfill({status:503,json:{error:'Files temporarily unavailable'}}));await page.reload();await expect(page.locator('.owner-page').getByRole('alert')).toContainText('The service could not confirm this request.');
 await page.unroute('**/api/artifacts');await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.getByRole('heading',{name:'Your files live here'})).toBeVisible();
 await page.goto('/files');await expect(page).toHaveURL(/\/workspace$/);
});
