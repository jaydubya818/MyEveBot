const {test,expect}=require('@playwright/test');
const {randomUUID}=require('node:crypto');
const {duplicateArchive,changeArchiveJson}=require('../fixtures/owner-archives.ts');

// Compile the dev-server destinations before measuring touch navigation, so
// cold-route Fast Refresh cannot replace the document between two taps.
test.beforeAll(async({request})=>{
  for(const path of ['/chat','/goals','/knowledge','/results','/computer','/agents','/review','/channels','/files','/manage']) {
    expect((await request.get(path)).ok()).toBe(true);
  }
});

async function openDrawer(page){await page.getByRole('button',{name:/^Open (threads|sidebar)$/}).tap();await expect.poll(async()=>Math.round((await page.getByRole('complementary',{name:'App navigation'}).boundingBox()).x)).toBe(0);}
async function attach(page,name,bytes){const choose=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Attach files',exact:true}).click();await(await choose).setFiles({name,mimeType:'text/plain',buffer:Buffer.from(bytes)});}

test('mobile normal taps reach every top-level destination without an intercepting drawer',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();
  await page.goto('/goals');await page.getByRole('heading',{name:'Goals',exact:true}).waitFor();
  await openDrawer(page);
  await page.screenshot({path:require('node:path').resolve(__dirname,'../../../../output/playwright/product-acceptance-fixes/mobile.png')});
  const names=await page.getByRole('navigation',{name:'Main destinations'}).getByRole('button').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')).filter(Boolean));
  const destinations=names.filter(n=>!['New thread','Close navigation'].includes(n));
  expect(destinations).toEqual(expect.arrayContaining(['Back to chat','Goals','Knowledge','Results','Computer','Agents','Review','Channels','Files','Manage']));
  for(const name of destinations){
    const target=page.getByRole('complementary',{name:'App navigation'}).getByRole('button',{name,exact:true});
    const box=await target.boundingBox();expect(Math.round(box.width)>=44&&Math.round(box.height)>=44, name+" tap target "+JSON.stringify(box)).toBe(true);
    await target.tap();await expect(page.getByRole('complementary',{name:'App navigation'})).toBeHidden();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await openDrawer(page);
  }
  await context.close();
});

test('mobile Manage inventory is fully reachable by touch',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();await page.goto('/manage');
  // Wait for feature readiness rather than inventorying transient menu items.
  await expect(page.getByRole('button',{name:/Memory What Ava remembers/})).toContainText('Setup required');
  const names=await page.getByRole('navigation',{name:'Manage sections'}).getByRole('button').evaluateAll(nodes=>nodes.map(n=>n.innerText.replace(/\s+/g,' ').trim()));
  expect(names.length).toBeGreaterThanOrEqual(19);
  for(const name of names){await page.getByRole('navigation',{name:'Manage sections'}).getByRole('button',{name:new RegExp('^'+name.trim().replace(/ \d+$/,'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?: \\d+)?$')}).tap();await expect(page.getByRole('button',{name:'All settings',exact:true})).toBeVisible();await page.getByRole('button',{name:'All settings',exact:true}).tap();}
  await context.close();
});

test('desktop navigation and mobile keyboard focus remain usable',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await page.goto('/goals');await page.getByRole('complementary',{name:'App navigation'}).getByRole('button',{name:'Knowledge',exact:true}).click();await expect(page.getByRole('heading',{name:'Knowledge',exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});const opener=page.getByRole('button',{name:'Open threads',exact:true});await opener.focus();await page.keyboard.press('Enter');await expect(page.getByRole('complementary',{name:'App navigation'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('complementary',{name:'App navigation'})).toBeHidden();await expect(opener).toBeFocused();
});

test('backup rejects duplicate and secret content through the actual verification form',async({page,request})=>{
  const base=await request.get('/api/owner-data?download=1');expect(base.status()).toBe(200);const archive=await base.body();
  const marker=randomUUID();const cases=[['valid',archive,200],['duplicate',await duplicateArchive(archive,'data/knowledge.json'),400],['normalized',await duplicateArchive(archive,'data/knowledge.json','data/./knowledge.json'),400],['secret-root',await changeArchiveJson(archive,'data/profile.json',v=>{v.password=marker;}),400],['secret-nested',await changeArchiveJson(archive,'data/agents.json',v=>{v.extra=[{configuration:{apiKey:marker}}];}),400]];
  await page.goto('/manage/data');await page.getByRole('button',{name:'Backup & recovery',exact:true}).click();
  for(const [name,bytes,status] of cases){const response=page.waitForResponse(r=>r.url().endsWith('/api/owner-data')&&r.request().method()==='POST');await page.getByLabel('Choose a MyEve archive to verify').setInputFiles({name:name+'.zip',mimeType:'application/zip',buffer:Buffer.from(bytes)});const r=await response;expect(r.status()).toBe(status);expect((await r.text()).includes(marker)).toBe(false);expect((await page.locator('body').innerText()).includes(marker)).toBe(false);}
  const logs=require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../../../../output/playwright/product-acceptance-fixes/server.log'),'utf8');expect(logs.includes(marker)).toBe(false);
  expect(JSON.stringify(await(await request.get('/api/owner-data')).json()).includes(marker)).toBe(false);
});

test('chat upload is one durable file, survives reload, is readable and exported',async({page,request})=>{
  const name='atlas-'+randomUUID()+'.txt',content='Synthetic Atlas onboarding completion target: 80 percent.';let submitted;
  // Stop at the model boundary. Persistence and authorized file retrieval are real.
  await page.route('**/eve/v1/session',r=>{submitted=r.request().postDataJSON();return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Model execution deliberately disabled in this test'})});});
  await page.goto('/chat');await page.getByRole('textbox',{name:'Message Ava',exact:true}).fill('What is the target in the attached synthetic file?');await attach(page,name,content);await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect.poll(async()=>((await(await request.get('/api/files')).json()).files).filter(f=>f.filename===name).length).toBe(1);
  const file=(await(await request.get('/api/files')).json()).files.find(f=>f.filename===name);expect(file.sizeBytes).toBe(Buffer.byteLength(content));expect(file.mediaType).toBe('text/plain');expect(file.threadId).toBeTruthy();expect(file.createdAt).toBeTruthy();
  await expect.poll(()=>Boolean(submitted)).toBe(true);
  expect(JSON.stringify(submitted).includes(file.id)).toBe(true);
  expect(JSON.stringify(submitted).includes(Buffer.from(content).toString('base64'))).toBe(true);
  const read=await request.get(file.contentUrl);expect(read.status()).toBe(200);expect(await read.text()).toBe(content);
  await page.getByRole('complementary',{name:'App navigation'}).getByRole('button',{name:'Files',exact:true}).click();await page.getByRole('textbox',{name:'Search files',exact:true}).fill(name);await expect(page.getByText(name,{exact:true}).first()).toBeVisible();await page.reload();await page.getByRole('textbox',{name:'Search files',exact:true}).fill(name);await expect(page.getByText(name,{exact:true}).first()).toBeVisible();
  const popup=page.waitForEvent('popup');await page.getByRole('link',{name:'Open '+name,exact:true}).click();const opened=await popup;await expect(opened.locator('body')).toContainText(content);await opened.close();
  const inventory=await(await request.get('/api/owner-data')).json();expect(inventory.inventory.find(d=>d.id==='files').recordCount).toBeGreaterThan(0);
  const zip=await require('jszip').loadAsync(await(await request.get('/api/owner-data?download=1')).body());const data=JSON.parse(await zip.file('data/files.json').async('string'));expect(data.records.chatFiles.some(f=>f.id===file.id)).toBe(true);
  // Same filename is another identity, never an overwrite.
  await page.getByRole('complementary',{name:'App navigation'}).getByRole('button',{name:'Back to chat',exact:true}).click();await attach(page,name,content);await page.getByRole('button',{name:'Send',exact:true}).click();await expect.poll(async()=>((await(await request.get('/api/files')).json()).files).filter(f=>f.filename===name).length).toBe(2);
  // Remove only fixture bytes, leaving the real canonical metadata intact.
  await request.delete('http://127.0.0.1:3074/?pathname='+encodeURIComponent('chat-files/'+file.id+'/'+name));expect((await request.get(file.contentUrl)).status()).toBe(404);expect((await request.get('/api/files')).status()).toBe(200);
});

test('failed upload retains the draft and creates no phantom file or model call',async({page,request})=>{
  const name='failed-'+randomUUID()+'.txt';let modelCalls=0;
  await page.route('**/api/files/upload',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Storage unavailable'})}));
  await page.route('**/eve/v1/session',r=>{modelCalls++;return r.fulfill({status:503,body:'disabled'});});
  await page.goto('/chat');await page.getByRole('textbox',{name:'Message Ava',exact:true}).fill('Keep this draft on upload failure.');await attach(page,name,'synthetic');await page.getByRole('button',{name:'Send',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:/upload/i})).toBeVisible();
  expect(modelCalls).toBe(0);await expect(page.getByRole('textbox',{name:'Message Ava',exact:true})).toHaveValue('Keep this draft on upload failure.');expect((await(await request.get('/api/files')).json()).files.some(f=>f.filename===name)).toBe(false);
});
