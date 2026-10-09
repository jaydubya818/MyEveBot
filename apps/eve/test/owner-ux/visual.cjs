const {expect,test}=require('@playwright/test');
// Exact local platform baselines; CI also retains captures for review on Linux.
exports.capture=async function capture(page,name){
 await expect(page.getByRole('status').filter({hasText:/Loading|Checking|Opening/})).toHaveCount(0);
 await expect(page).toHaveTitle(/MyEve/);
 await page.evaluate(()=>document.fonts.ready);
 await page.addStyleTag({content:'nextjs-portal {display:none!important}'});
 await page.screenshot({path:test.info().outputPath(name),fullPage:true,animations:'disabled'});
 if(!process.env.CI)await expect(page).toHaveScreenshot(name,{fullPage:true,animations:'disabled',maxDiffPixels:0,mask:[page.locator('time')]});
};
