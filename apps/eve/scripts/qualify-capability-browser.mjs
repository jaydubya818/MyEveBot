import assert from 'node:assert/strict';
import { CapabilityStore } from '../lib/capability-control/store.ts';
import { signLifecycleReceipt } from '../../../packages/capability-enforcement/src/lifecycle-wire.ts';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const require = createRequire(import.meta.url);
export async function qualifyBrowser({ token, output, admin, runtime }) {
  const port = 3317;
  const origin = `http://127.0.0.1:${port}`;
  // Deliberate allowlist: never inherit model, production database, or integration credentials.
  const env = Object.fromEntries(['PATH','HOME','TMPDIR','SystemRoot'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  for (const [key,value] of Object.entries(process.env)) if (key.startsWith('MYEVE_CAPABILITY_') || ['MYEVE_OWNER_ID','MYEVE_ACCESS_PASSWORD','MYEVE_SESSION_SECRET'].includes(key)) env[key] = value;
  env.NEXT_TELEMETRY_DISABLED = '1';
  env.MYEVE_CAPABILITY_ORIGIN = origin;
  const server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], { env, stdio: ['ignore','pipe','pipe'], detached: true });
  let logs = ''; server.stdout.on('data', chunk => { logs += chunk; }); server.stderr.on('data', chunk => { logs += chunk; });
  let browser, page;
  const checks = [];
  const pass = name => { checks.push(name); console.log(`PASS browser: ${name}`); };
  const artifacts = resolve('../../output/playwright/capability-control'); await mkdir(artifacts, { recursive: true });
  try {
    for (let i=0; i<120; i++) {
      if (server.exitCode !== null) throw new Error(`Next exited: ${logs.slice(-4000)}`);
      try { if ((await fetch(`${origin}/api/capability-control`, {signal:AbortSignal.timeout(5000)})).status === 401) break; } catch {}
      if (i === 119) throw new Error(`Next startup timeout: ${logs.slice(-4000)}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? {channel:'chrome'} : {}) });
    const context = await browser.newContext({ viewport: {width:1440,height:1000} });
    await context.addCookies([{name:'myeve_session',value:token,url:origin,httpOnly:true,sameSite:'Lax'}]);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || (url.pathname.startsWith('/eve/') && route.request().method() !== 'GET')) return route.abort();
      return route.continue();
    });
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(`${origin}/manage/capabilities`);
    await page.getByRole('heading', {name:'Capabilities',exact:true}).waitFor();
    await page.getByText('Platform-owner testing defaults are enabled.',{exact:false}).waitFor();
    const cards = page.getByRole('article');
    assert.equal(await cards.count(),36);
    assert.equal(await page.getByRole('switch',{checked:true}).count(),36);
    for (const group of ['Personal Assistant','Agents and Automation','Computer and Tools','Software Development','Enterprise Engineering','Communication','Advanced']) await page.getByRole('region',{name:group,exact:true}).waitFor();
    await page.getByText('SETUP_REQUIRED',{exact:true}).first().waitFor();
    pass('all 36 synthetic platform defaults and seven categories disclose unavailable readiness');
    const mission = page.getByRole('article',{name:'MissionControl',exact:true});
    await mission.getByRole('switch').click();
    await page.getByText('Preference saved.',{exact:false}).waitFor();
    assert.equal(await mission.getByRole('switch').getAttribute('aria-checked'),'false');
    for (const name of ['MyFactory','Sofie Native Execution']) assert.equal(await page.getByRole('article',{name,exact:true}).getByRole('switch').getAttribute('aria-checked'),'true');
    await page.reload(); await mission.getByRole('switch',{checked:false}).waitFor();
    pass('disable persists through reload and preserves MyFactory and Sofie Native');
    await mission.getByRole('switch').click(); await mission.getByRole('switch',{checked:true}).waitFor();
    pass('re-enable persists through canonical command');
    // Drop only the response after the real server committed, then replay the same UI request.
    let lost = true;
    await page.route('**/api/capability-control', async route => {
      if (lost && route.request().method() === 'POST') { lost=false; await route.fetch(); return route.abort('failed'); }
      return route.continue();
    });
    const memory = page.getByRole('article',{name:'Memory',exact:true});
    await memory.getByRole('switch').click();
    await page.getByRole('button',{name:'Retry last request'}).click();
    await memory.getByRole('switch',{checked:false}).waitFor();
    const policy = await (await context.request.get(`${origin}/api/capability-control`)).json();
    assert.equal(policy.audit.filter(item => item.capability_id === 'memory').length,1);
    pass('lost response retry commits once and retains one audit event');
    await mission.getByText('Setup, permissions, and controls',{exact:true}).click();
    await mission.getByRole('spinbutton',{name:'MissionControl budget in USD'}).fill('2.50');
    await mission.getByRole('button',{name:'Save budget'}).click();
    await page.getByText('Preference saved.',{exact:false}).waitFor();
    await mission.getByRole('button',{name:'Request pause'}).click();
    await page.getByText('Control request saved.',{exact:false}).waitFor();
    await mission.getByText('PAUSE_REQUESTED · PENDING_BACKEND',{exact:true}).waitFor();
    assert.equal(await mission.getByRole('switch').isDisabled(),true);
    pass('budget and pause controls save while disclosing pending backend acknowledgement');
    const noAuth = await fetch(`${origin}/api/capability-control`, {signal:AbortSignal.timeout(5000)}); assert.equal(noAuth.status,401);
    const badOrigin = await context.request.post(`${origin}/api/capability-control`, {headers:{origin:'https://attacker.invalid'},data:{}}); assert.equal(badOrigin.status(),403);
    const malformed = await context.request.post(`${origin}/api/capability-control`,{headers:{origin},data:'{'}); assert.equal(malformed.status(),400);
    const oversized = await context.request.post(`${origin}/api/capability-control`,{headers:{origin},data:'x'.repeat(5000)}); assert.equal(oversized.status(),400);
    pass('real HTTP route refuses unsigned, cross-origin, malformed and oversized commands');
    await page.addScriptTag({content:await readFile(require.resolve('axe-core/axe.min.js'),'utf8')});
    const violations = await page.evaluate(async () => (await axe.run(document.querySelector('[aria-label="Policy status"]').parentElement,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations);
    await writeFile(join(output,'accessibility.json'),JSON.stringify({scope:'CapabilitySettings',violations},null,2)+'\n');
    assert.deepEqual(violations.map(item=>({id:item.id,impact:item.impact})),[]);
    pass('capability panel passes automated WCAG 2 A/AA and 2.1 AA checks');
    await page.getByRole('button',{name:'Refresh capabilities'}).focus();
    assert.equal(await page.getByRole('button',{name:'Refresh capabilities'}).evaluate(element=>document.activeElement===element),true);
    await page.keyboard.press('Enter'); await page.getByRole('button',{name:'Refresh capabilities'}).waitFor({state:'visible'});
    await page.reload(); await mission.getByText('PAUSE_REQUESTED · PENDING_BACKEND',{exact:true}).waitFor();
    await mission.scrollIntoViewIfNeeded();
    const baseline = await mission.screenshot({animations:'disabled'});
    await page.reload(); await mission.getByText('PAUSE_REQUESTED · PENDING_BACKEND',{exact:true}).waitFor();
    await mission.scrollIntoViewIfNeeded();
    const repeated = await mission.screenshot({animations:'disabled'});
    assert.equal(baseline.equals(repeated),true);
    pass('MissionControl card renders identical pixels after reload');
    await page.getByRole('heading',{name:'Capabilities',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:join(artifacts,'desktop.png'),fullPage:false});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth),true);
    await page.screenshot({path:join(artifacts,'mobile.png'),fullPage:false});
    pass('keyboard refresh and mobile viewport avoid horizontal overflow');
    let outage = true;
    await page.route('**/api/capability-control', route => {
      if (outage && route.request().method() === 'GET') { outage=false; return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic storage outage'})}); }
      return route.fallback();
    });
    await page.getByRole('button',{name:'Refresh capabilities'}).click();
    await page.getByRole('alert').filter({hasText:'Synthetic storage outage'}).waitFor();
    await page.getByRole('button',{name:'Refresh capabilities'}).click();
    await page.getByRole('alert').filter({hasText:'Synthetic storage outage'}).waitFor({state:'hidden'});
    pass('storage outage is disclosed and refresh recovers without discarding preferences');
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign','verify']);
    const signing = { keyId: 'browser-backend', jwk: await crypto.subtle.exportKey('jwk', pair.privateKey) };
    await admin.query('INSERT INTO capability_control.policy_destinations VALUES($1,$2,$3,$4,1,$5,$6)',
      ['qualification-1', 'synthetic-browser-owner', 'browser-backend', 'browser-epoch', signing.keyId, await crypto.subtle.exportKey('jwk', pair.publicKey)]);
    await mission.getByText('Setup, permissions, and controls',{exact:true}).click();
    await mission.getByRole('button',{name:'Request revocation'}).click();
    await mission.getByText('REVOKE_REQUESTED · PENDING_BACKEND',{exact:true}).waitFor();
    await mission.getByRole('button',{name:'Refresh backend acknowledgments'}).click();
    await mission.getByText('REVOKE_REQUESTED · PENDING_BACKEND',{exact:true}).waitFor();
    const store = new CapabilityStore(runtime, { id: 'qualification-1', environment: 'qualification' }, { ownerId: 'synthetic-browser-owner', source: 'settings' });
    const change = (await admin.query("SELECT * FROM capability_control.policy_changes WHERE owner_id='synthetic-browser-owner' ORDER BY revision DESC LIMIT 1")).rows[0];
    const observed = { schema: 'capability-control.lifecycle.v1', kind: 'CONTROL_ACK', authority: 'myeve',
      ownerId: 'synthetic-browser-owner', organizationId: 'organization-1', installationId: 'qualification-1',
      backendId: 'browser-backend', incarnation: 'browser-epoch', enrollmentVersion: 1,
      version: change.revision, policyId: change.policy_id, capabilityId: 'missioncontrol', operation: 'revoke',
      sequence: 1, observedAt: Date.now(), state: 'STOP_UNKNOWN', inventoryComplete: false,
      evidenceDigest: 'a'.repeat(64), inventoryDigest: 'b'.repeat(64) };
    await store.acknowledgeControl('browser-backend', await signLifecycleReceipt(observed, signing));
    await page.reload(); await mission.getByText('browser-backend: STOP UNKNOWN.', { exact: false }).waitFor();
    assert.equal(await mission.getByRole('switch').isDisabled(), true);
    await store.acknowledgeControl('browser-backend', await signLifecycleReceipt({ ...observed, sequence: 2, observedAt: Date.now(), state: 'CLEANUP_CONFIRMED', inventoryComplete: true }, signing));
    await page.reload(); await mission.getByText('REVOKE_REQUESTED · ACKNOWLEDGED', { exact: true }).waitFor();
    await mission.getByRole('button',{name:'Enable new Work after confirmed control'}).click();
    await mission.getByRole('switch',{checked:true}).waitFor();
    await page.reload(); await mission.getByRole('switch',{checked:true}).waitFor();
    assert.equal((await store.inspect()).audit.find(item => item.operation === 'enable').previous.control, 'REVOKE_REQUESTED');
    pass('signed backend UNKNOWN and cleanup observations survive reconnect; re-enable requires explicit owner command');
    await writeFile(join(output,'browser.json'),JSON.stringify({passed:checks.length,checks,realOwnerGoldenJourney:'NOT_QUALIFIED',visualRegression:'REPEAT_RENDER_PASS; APPROVED_BASELINE_PENDING',paidOperations:0},null,2)+'\n');
  } finally {
    if (page) { await writeFile(join(artifacts,'final-page.txt'),await page.locator('body').innerText().catch(()=>'')); }
    if (browser) await browser.close();
    try { process.kill(-server.pid,'SIGTERM'); } catch {}
    await writeFile(join(artifacts,'server.log'),logs);
  }
}
