async (page) => {
  const report = [];
  await page.goto('http://localhost:3217/capsules');
  await page.getByRole('checkbox', { name: 'Concise project updates', exact:false }).waitFor();
  const check = page.getByRole('checkbox', { name: 'Concise project updates', exact:false });
  await check.focus(); await page.keyboard.press('Space');
  if (!await check.isChecked()) throw new Error('Keyboard checkbox failed');
  await page.getByRole('checkbox', { name: 'Release notes Skill', exact:false }).check();
  report.push('EXPORT SELECTION\n' + await page.locator('main').ariaSnapshot());
  await page.getByRole('button', { name: 'Preview selected experience', exact:true }).click();
  await page.getByRole('heading', { name: 'What will transfer', exact:true }).waitFor();
  await page.waitForFunction(() => document.activeElement?.textContent === 'What will transfer');
  const focus = await page.evaluate(() => document.activeElement?.textContent);
  if (focus !== 'What will transfer') throw new Error('Export heading not focused: '+focus);
  report.push('EXPORT PREVIEW\n' + await page.locator('main').ariaSnapshot());
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'output/playwright/capsules/integration-desktop-export.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile overflow');
  await page.screenshot({path:'output/playwright/capsules/integration-mobile-export.png',fullPage:true});
  await page.getByRole('button', { name:'Create and download Capsule',exact:true }).click();
  await page.getByRole('button',{name:'Review for Sofie B',exact:true}).waitFor();
  report.push('EXPORT SUCCESS\n'+await page.getByRole('status').allTextContents());
  return report;
}
