const {test,expect}=require('@playwright/test');
test('client navigation paints canonical route titles with the visible destination',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-10-09T01:00:00Z'));
 await page.goto('/login');
 expect((await page.request.post('/api/auth/login',{data:{password:'synthetic-ux-owner-a'}})).ok()).toBeTruthy();
 await page.goto('/workspace');
 await expect(page.locator('h1')).toHaveText('Files');
 await expect(page).toHaveTitle('Files — MyEve');
 await page.evaluate(()=>{
  window.titleFrames=[];
  const sample=()=>{
   const heading=document.querySelector('h1')?.textContent;
   if(['Files','Settings'].includes(heading))window.titleFrames.push({heading,title:document.title,path:location.pathname});
   requestAnimationFrame(sample);
  };requestAnimationFrame(sample);
 });
 for(const name of ['Settings','Files','Settings','Files']){
  await page.getByRole('navigation',{name:'Primary',exact:true}).getByRole('link',{name,exact:true}).click();
  await expect(page.locator('h1')).toHaveText(name);
  // Read immediately at the next painted frame, without a title retry hiding lag.
  const title=await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve(document.title))));
  expect(title).toBe(`${name} — MyEve`);
 }
 await page.goBack();await expect(page.locator('h1')).toHaveText('Settings');
 await page.goForward();await expect(page.locator('h1')).toHaveText('Files');
 const frames=await page.evaluate(()=>window.titleFrames);
 await test.info().attach('navigation-title-frames',{body:JSON.stringify(frames,null,2),contentType:'application/json'});
 expect(frames.length).toBeGreaterThan(0);
 expect(frames.filter(frame=>frame.title!==`${frame.heading} — MyEve`)).toEqual([]);
});
