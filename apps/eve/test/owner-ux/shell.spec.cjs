const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const axe=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
async function login(page,password='synthetic-ux-owner-a') {
  await page.clock.setFixedTime(new Date('2026-10-09T01:00:00Z'));
  await page.goto('/login');
  const response=await page.request.post('/api/auth/login',{data:{password}});
  expect(response.ok()).toBeTruthy();
}
async function stable(page){await expect(page.locator('.owner-brand')).toBeVisible();await expect(page.getByRole('status').filter({hasText:/Loading|Checking|Opening/})).toHaveCount(0);await page.evaluate(()=>document.fonts.ready);await page.addStyleTag({content:'nextjs-portal { display:none !important; }'});}
for(const width of [1440,1024,768,390]) {
 test(`clean owner shell at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900}); await login(page);
  const failures=[];
  for(const [route,name] of [['/today','today'],['/chat','sofie'],['/work','work'],['/needs-you','needs-you'],['/workspace','files'],['/settings','settings']]) {
   await page.goto(route); await stable(page);
   if(route==='/chat') await expect(page.getByRole('textbox',{name:/message/i})).toBeVisible();
   expect(await page.locator('.owner-shell').count()).toBe(1);
   expect(await page.locator('nav[aria-label="Primary"]').count()).toBe(1);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);expect(overflow).toBe(false);
   const nav=page.getByRole('navigation',{name:'Primary',exact:true});
   if(width<=900)await page.getByRole('button',{name:'Menu',exact:true}).click();
   await expect(nav.getByRole('link')).toHaveText(['Today','Sofie','Work','Needs You','Files','Settings','Privacy & boundaries']);
   if(width<=900)await page.getByRole('button',{name:'Menu',exact:true}).click();
   await expect(page.getByText(/production CLOUD canary|Ship MyEve V1|Control: agent|Private-alpha availability/)).toHaveCount(0);
   await page.addScriptTag({content:axe});
   const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
   failures.push(...result.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({route,id:v.id,nodes:v.nodes.map(n=>n.target)})));
   if(process.env.CI && (width===1440||width===390)) { await page.screenshot({path:test.info().outputPath(`${name}-${width}.png`),fullPage:true}); }
   else if(width===1440||width===390) { await expect(page).toHaveScreenshot(`${name}-${width}.png`,{fullPage:true,animations:'disabled',maxDiffPixels:0}); }
  }
  expect(failures).toEqual([]);
 });
}
test('alpha disabled direct routes fail closed',async({page})=>{
 await login(page);
 for(const route of ['/memory','/capsules','/rooms','/apps','/computer','/manage','/api/memories','/api/connections','/api/beta/owner-decision'])expect((await page.request.get(route)).status(),route).toBe(404);
});
test('keyboard commands and mobile menu return focus',async({page})=>{
 await login(page);await page.goto('/today');await stable(page);
 await page.keyboard.press('Meta+k');await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});const menu=page.getByRole('button',{name:'Menu',exact:true});await menu.click();await page.keyboard.press('Escape');await expect(menu).toBeFocused();await expect(menu).toHaveAttribute('aria-expanded','false');
});
test('appearance selection supports radio keyboard navigation and persists across routes',async({page})=>{
 await login(page);await page.goto('/settings');await stable(page);
 const system=page.getByRole('radio',{name:/System/});await system.focus();await page.keyboard.press('ArrowRight');
 await expect(page.getByRole('radio',{name:/Light/})).toBeFocused();await expect(page.getByRole('radio',{name:/Light/})).toHaveAttribute('aria-checked','true');
 await page.keyboard.press('ArrowRight');await expect(page.getByRole('radio',{name:/Dark/})).toBeFocused();await expect(page.locator('html')).toHaveAttribute('data-mode','dark');
 await page.getByRole('navigation',{name:'Primary',exact:true}).getByRole('link',{name:'Today',exact:true}).click();await stable(page);await expect(page.locator('html')).toHaveAttribute('data-mode','dark');
});
