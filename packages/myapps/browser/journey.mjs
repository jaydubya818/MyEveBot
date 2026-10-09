import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { ReferenceStore } from '../src/store.ts';
import { Crm } from '../src/crm.ts';
import { startPrototype, fixturePrincipal } from '../prototype/server.mjs';
import { makePackage, verified, OWNER, principal } from '../test/fixtures.mjs';

const require = createRequire(import.meta.url);
const axe = readFileSync(require.resolve('axe-core', { paths: [resolve('apps/eve')] }), 'utf8');
const directory = mkdtempSync(join(tmpdir(), 'myapps-browser-'));
const store = new ReferenceStore(join(directory, 'reference.sqlite'), () => '2026-10-08T12:00:00.000Z');
const pkg = makePackage(), row = verified(store, pkg), preview = store.createPreview(OWNER, pkg.appId, 1);
const server = await startPrototype({store,candidates:[{ownerId:OWNER,appId:pkg.appId,version:1,previewId:preview.id}]});
const browser = await chromium.launch({headless:true});
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const page = await context.newPage(), errors = [], accessibility = [], screenshots = [];
page.setDefaultTimeout(10000);
page.on('pageerror', error => errors.push(error.message));
const output = resolve('output/playwright/myapps'); mkdirSync(output,{recursive:true});
async function capture(name) {
  await page.evaluate(axe);
  const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: {type:'tag',values:['wcag2a','wcag2aa','wcag21aa']} })).violations.filter(v=>['critical','serious'].includes(v.impact)));
  accessibility.push({name,violations:violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))});
  if (violations.length) console.error(JSON.stringify(accessibility.at(-1)));
  assert.deepEqual(violations.map(v=>v.id),[],`accessibility ${name}`);
  await page.screenshot({path:join(output,name+'.png'),fullPage:true});screenshots.push(name);
}
const click = async name => page.getByRole('button',{name,exact:true}).click();
const waitText = async value => page.getByText(value,{exact:true}).waitFor();
try {
  await page.goto(server.origin); await page.getByLabel('Fixture owner').selectOption(OWNER); await click('Enter workspace'); await page.getByRole('heading',{name:'Your Apps'}).waitFor();
  await capture('apps');
  await click('Preview App'); await page.getByRole('dialog').waitFor(); await capture('preview');
  assert.equal(store.session(principal()).get(pkg.appId).installedVersion,null);
  await click('Review installation'); await capture('needs-you'); await click('Install App');
  await click('Open Lead CRM'); await page.getByRole('heading',{name:'Lead CRM',exact:true}).waitFor();
  await click('Add lead');
  for(const [label,value] of [['Lead name','Alex Morgan'],['Company','Acme'],['Contact information','alex@example.invalid'],['Source','Conference'],['Pipeline value (cents)','500000']]) await page.getByLabel(label,{exact:true}).fill(value);
  await click('Create lead'); await page.getByRole('heading',{name:'Contact and opportunity'}).waitFor();
  await page.getByLabel('Pipeline stage',{exact:true}).selectOption('Qualified'); await click('Save stage'); await waitText('Saved. Your App and Sofie now see the same information.');
  await page.getByLabel('Add a note',{exact:true}).fill('Synthetic follow-up discussion.'); await click('Add note'); await page.locator('.notes').getByText('Synthetic follow-up discussion.').waitFor();
  await page.getByLabel('Add spend (cents)',{exact:true}).fill('15000'); await click('Record spend'); await waitText('$150 total');
  await page.getByLabel('Next follow-up',{exact:true}).fill('2026-10-08'); await click('Save follow-up');
  await page.getByLabel('Next follow-up',{exact:true}).waitFor(); await capture('lead-detail');
  const agent = new Crm(store,fixturePrincipal(OWNER,'agent'));
  let [lead]=agent.query(pkg.appId,1,row.digest,'listLeads',{});
  assert.equal(lead.stage,'Qualified'); assert.equal(lead.notes.length,1); assert.equal(lead.spendCents,15000);assert.equal(lead.followup,'2026-10-08');
  await page.getByLabel('Your request',{exact:true}).fill('Move Acme to Proposal.'); await click('Ask Sofie'); await waitText('Acme is now in Proposal.');
  assert.equal(await page.getByLabel('Pipeline stage',{exact:true}).inputValue(),'Proposal');
  agent.action(pkg.appId,1,row.digest,'updateStage',{leadId:lead.id,expectedRevision:lead.revision+1,stage:'Discovery'},'outside-ui');
  await click('Refresh'); await page.waitForFunction(()=>document.querySelector('select[name="stage"]')?.value==='Discovery');
  await click('Overview'); await waitText('Open pipeline'); await capture('overview');
  await click('Pipeline'); await page.getByRole('region',{name:'Pipeline stages'}).waitFor(); await capture('pipeline');
  await click('Leads'); await page.getByLabel('Search leads').fill('Acme'); await page.getByRole('button',{name:'Acme',exact:true}).waitFor();
  await click('Follow-ups'); await page.getByRole('heading',{name:'Upcoming and overdue'}).waitFor();await capture('followups');
  await click('App details'); await page.getByRole('heading',{name:'App details'}).waitFor(); await capture('app-details');
  await click('Disable App'); await page.getByRole('button',{name:'Enable App'}).waitFor();await click('Overview');await page.getByRole('heading',{name:'This App is disabled'}).waitFor();
  await click('App details'); await click('Enable App');await page.getByRole('button',{name:'Disable App'}).waitFor();await click('Overview');await waitText('Open pipeline');
  await page.setViewportSize({width:390,height:844});await capture('overview-narrow');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.keyboard.press('Tab');assert.notEqual(await page.evaluate(()=>document.activeElement.tagName),'BODY');
  await page.reload(); await click('Enter workspace');await click('Open Lead CRM');await waitText('Open pipeline');
  assert.equal(agent.query(pkg.appId,1,row.digest,'listLeads',{})[0].notes.length,1);
  // A second browser session must not enumerate, query or inspect another owner's candidate.
  const other=await browser.newContext();const foreign=await other.newPage();await foreign.goto(server.origin);await foreign.getByLabel('Fixture owner').selectOption('synthetic-owner-b');await foreign.getByRole('button',{name:'Enter workspace'}).click();await foreign.getByRole('heading',{name:'No Apps installed'}).waitFor();
  const denial=await foreign.evaluate(async ({id,hash,previewId})=>{
    const outputs=[];for(const body of [{appId:id,operation:'detail',version:1},{appId:id,operation:'listLeads',version:1,digest:hash,input:{}},{appId:id,operation:'preview',previewId}]){const r=await fetch('/api/app',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});outputs.push({status:r.status,body:await r.json()});}return outputs;
  },{id:pkg.appId,hash:row.digest,previewId:preview.id});
  assert.ok(denial.every(r=>r.status===404&&r.body.error==='APP_UNAVAILABLE'));await other.close();
  assert.deepEqual(errors,[]);
  writeFileSync(join(output,'qualification.json'),JSON.stringify({status:'PASS',screenshots,accessibility,consoleErrors:errors,uiAgentConsistency:'PASS',ownerIsolation:'PASS',reconnect:'PASS',fixtureOnly:true},null,2)+'\n');
  console.log(JSON.stringify({status:'PASS',screenshots:screenshots.length,accessibilitySurfaces:accessibility.length,output}));
} catch (error) {
  await page.screenshot({path:join(output,'failure.png'),fullPage:true});
  writeFileSync(join(output,'failure.html'),await page.content());
  throw error;
} finally {await context.close();await browser.close();await server.close();store.close();rmSync(directory,{recursive:true});}
