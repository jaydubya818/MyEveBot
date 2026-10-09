const {test,expect}=require('@playwright/test');
const {randomUUID}=require('node:crypto');

for(const mode of ['empty composer','existing draft','middle caret','selected text','thread search','focus moved during remount'])test(`server refresh preserves ${mode}`,async({page})=>{
 const focusComposer=mode!=='thread search',expectComposer=focusComposer&&mode!=='focus moved during remount';
 await page.goto('/login');
 const login=await page.request.post('/api/auth/login',{data:{password:process.env.MYEVE_COMPOSER_TEST_PASSWORD??'synthetic-ux-owner-a'}});
 expect(login.ok()).toBeTruthy();
 const {ownerId}=await(await page.request.get('/api/auth/status')).json();expect(ownerId).toBeTruthy();
 const thread={id:randomUUID(),title:'Disposable composer refresh',updatedAt:Date.now()};
 const cleanupIds=[thread.id];
 const chat={events:[{type:'session.waiting',data:{continuationToken:'fixture',wait:'next-user-message'},meta:{id:randomUUID(),at:new Date().toISOString()}}]};
 expect((await page.request.put('/api/threads/'+thread.id,{data:{...thread,chat}})).ok()).toBeTruthy();
 let release;const held=new Promise(resolve=>{release=resolve;});
 let readStarted;const intercepted=new Promise(resolve=>{readStarted=resolve;});
 let sends=0;page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.startsWith('/eve/'))sends++;});
 try{
  // A legitimately stale local transcript renders while its newer server copy loads.
  await page.evaluate(({ownerId,thread})=>{
   const prefix='myeve-private:'+encodeURIComponent(ownerId)+':';
   localStorage.setItem(prefix+'eve-web-threads',JSON.stringify({activeId:thread.id,threads:[thread]}));
   localStorage.setItem(prefix+'eve-web-chat:'+thread.id,JSON.stringify({events:[],savedAt:0}));
  },{ownerId,thread});
  await page.route('**/api/threads/'+thread.id,async route=>{
   if(route.request().method()!=='GET')return route.continue();
   const response=await route.fetch();readStarted();await held;await route.fulfill({response});
  });
  await page.goto('/chat');await intercepted;
  const composer=page.getByRole('textbox',{name:'Message Sofie',exact:true});await expect(composer).toBeEnabled();
  const search=page.getByRole('textbox',{name:'Search threads',exact:true});
  await (focusComposer?composer:search).focus();
  const originalDraft=['existing draft','middle caret','selected text'].includes(mode)?'Keep this draft. ':'';
  if(originalDraft)await composer.fill(originalDraft);
  if(mode==='middle caret'||mode==='selected text')for(let n=0;n<6;n++)await composer.press(mode==='selected text'?'Shift+ArrowLeft':'ArrowLeft');
  const selection=await composer.evaluate(element=>({start:element.selectionStart,end:element.selectionEnd,direction:element.selectionDirection}));
  const original=await composer.elementHandle();
  if(mode==='focus moved during remount')await page.evaluate(element=>{
   const observer=new MutationObserver(()=>{if(!element.isConnected){document.querySelector('input[aria-label="Search threads"]').focus();observer.disconnect();}});
   observer.observe(document.body,{childList:true,subtree:true});
  },original);
  release();await page.waitForFunction(element=>!element.isConnected,original);
  const focused=expectComposer?composer:search;await expect(focused).toBeFocused();
  if(expectComposer)expect(await composer.evaluate(element=>({start:element.selectionStart,end:element.selectionEnd,direction:element.selectionDirection}))).toEqual(selection);
  const draft=expectComposer?'What changed?':'Search remains focused';
  await page.keyboard.insertText(draft);await expect(focused).toHaveValue(originalDraft.slice(0,selection.start)+draft+originalDraft.slice(selection.end));
  expect(await page.evaluate(ownerId=>JSON.parse(localStorage.getItem('myeve-private:'+encodeURIComponent(ownerId)+':eve-web-threads')).activeId,ownerId)).toBe(thread.id);
  if(expectComposer)await expect(page.getByRole('button',{name:'Send',exact:true})).toBeEnabled();
  else{await expect(composer).toHaveValue('');await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();}
  if(mode==='empty composer'){
   // Programmatic navigation can unmount without a blur event. A different
   // conversation must not inherit focus, even when returning to this one.
   await page.getByRole('button',{name:'New conversation',exact:true}).evaluate(button=>button.click());
   await expect(composer).toBeEnabled();await expect(composer).not.toBeFocused();
   cleanupIds.push(await page.evaluate(ownerId=>JSON.parse(localStorage.getItem('myeve-private:'+encodeURIComponent(ownerId)+':eve-web-threads')).activeId,ownerId));
   await page.getByRole('button',{name:new RegExp('^'+thread.title+'(?: |$)')}).evaluate(button=>button.click());
   await expect(composer).toBeEnabled();await expect(composer).not.toBeFocused();
  }
  expect(sends).toBe(0);
 }finally{release();await page.unroute('**/api/threads/'+thread.id);for(const id of cleanupIds)await page.request.delete('/api/threads/'+id);}
});
