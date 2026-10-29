import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { createWebSessionToken } from '../../lib/web-auth.ts';
import { requireAvailablePort, stopOwnedProcess } from './production-browser-runtime.mjs';

// Real production Next/React UI; synthetic same-origin resource responses.
// No Vercel environment, application DB, provider key, model call or deployment.
const app = resolve(import.meta.dirname, '../..'), require = createRequire(import.meta.url);
const output = resolve(process.argv[2] ?? 'output/playwright/beta-chat-feedback');
await mkdir(output, { recursive: true });
const port = 3187, origin = `http://localhost:${port}`;
await requireAvailablePort(port);
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(PATH|HOME|USER|TMPDIR)$/.test(k)));
Object.assign(env, { NODE_ENV: 'production', EVE_PROJECT_NAME: 'myeve-alpha-tester-1',
  MYEVE_OWNER_ID: 'feedback-owner-1', MYEVE_PARTNER_OWNER_ID: 'feedback-owner-2',
  MYEVE_ACCESS_PASSWORD: randomBytes(24).toString('hex'), MYEVE_PARTNER_ACCESS_PASSWORD: randomBytes(24).toString('hex'),
  MYEVE_SESSION_SECRET: randomBytes(32).toString('hex'), NEXT_TELEMETRY_DISABLED: '1' });
const tokens = [1, 2].map(n => createWebSessionToken(env, Date.now(), `feedback-owner-${n}`));
const log = await open(resolve(output, 'browser-server.log'), 'w');
const server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: app, env, stdio: ['ignore', log.fd, log.fd] });
let browser;
try {
  for (let attempt = 0; ; attempt++) {
    if (server.exitCode !== null) throw Error('Owned browser fixture server exited');
    try { if ((await fetch(origin + '/login')).ok) break; } catch {}
    if (attempt > 60) throw Error('Owned browser fixture server did not start');
    await new Promise(r => setTimeout(r, 250));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  await context.addCookies([{ name: 'myeve_session', value: tokens[0], url: origin }]);
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = [], forbidden = [], reads = [], writes = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
  page.on('console', message => { if(message.type()==='error') console.error('Browser console:', message.text()); });
  let failUsage = false, failInbox = false, turn = 9;
  const thread = { id: '00000000-0000-4000-8000-000000000071', title: 'Preserved beta conversation', updatedAt: Date.now(), agentId: 'fixture-sofie', agentName: 'Sofie', renamed: true };
  const second = { ...thread, id: '00000000-0000-4000-8000-000000000072', title: 'Second beta conversation' };
  const usage = (owner) => ({ version: 1, checkedAt: new Date().toISOString(), dayIndex: Math.floor(Date.now() / 86400000), resetsAt: new Date((Math.floor(Date.now() / 86400000) + 1) * 86400000).toISOString(), activatedAt: '2026-10-23T16:50:12Z', expiresAt: '2026-10-28T16:50:12Z', state: 'active', localPaused: false,
    dailyTurnsUsed: owner === 1 ? turn : 2, quotaRemaining: owner === 1 ? 10 - turn : 8,
    dailyReservedMicrousd: (owner === 1 ? turn : 2) * 100000, trialReservedMicrousd: (owner === 1 ? turn + 2 : 2) * 100000,
    limits: { dailyTurns: 10, perTurnMicrousd: 100000, dailyMicrousd: 1000000, trialMicrousd: 5000000, sharedDailyMicrousd: 2000000, sharedTrialMicrousd: 10000000 }, measured: { dailyMicrousd: 41234, trialMicrousd: 51234, unsettledOperations: 0 } });
  const work = { works: [], counts: { 'Needs You': 0, Working: 0, Monitoring: 0, Completed: 0, Waiting: 0, Stopped: 0, Ready: 0 }, nextOffset: null, offset: 0, limit: 20 };
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) { forbidden.push(url.origin); return route.abort('blockedbyclient'); }
    if (!/^\/(api|eve)\//.test(url.pathname)) return route.continue();
    if (url.pathname.startsWith('/api/auth/')) return route.continue();
    if (req.method() !== 'GET') writes.push(`${req.method()} ${url.pathname}`);
    reads.push(url.pathname);
    const owner = req.headers().cookie?.includes(tokens[1]) ? 2 : 1;
    const send = (json, status = 200) => route.fulfill({ status, json });
    if (url.pathname === '/api/chat-usage') return send(failUsage ? { error: 'private synthetic outage' } : usage(owner), failUsage ? 503 : 200);
    if (url.pathname === '/api/work-inbox') return send(work, failInbox ? 503 : 200);
    if (url.pathname === '/api/work-thread') return send({ works: [], nextOffset: null, offset: 0, createdWork: null });
    if (url.pathname === '/api/chat-work') return send({ works: [], selectionAvailable: true });
    // Reproduce the original warning if Today still makes this unused read.
    if (url.pathname === '/api/beta/work') return route.abort('failed');
    if (url.pathname === '/api/beta/goals') return send({ contractVersion: 1, goals: [], canProceed: [], doing: [], blocked: [], needsYou: [], recentlyCompleted: [], nextCursor: null });
    if (url.pathname === '/api/beta/results') return send({ results: [] });
    if (url.pathname === '/api/beta/inbox') return send({ items: [], nextCursor: null });
    if (url.pathname === '/api/capabilities') return send({ capabilities: [] });
    if (url.pathname === '/api/threads') return send({ threads: owner === 1 ? [thread, second] : [] });
    if (url.pathname.startsWith('/api/threads/') && req.method() === 'DELETE') return send({error:'Synthetic delete outage'},503);
    if (url.pathname.startsWith('/api/threads/')) return send({ chat: { events: [] } });
    if (url.pathname === '/api/agents') return send({ agents: [] });
    if (url.pathname === '/api/commands') return send({ commands: [] });
    if (url.pathname === '/api/needs-you') return send({ items: [] });
    if (url.pathname.startsWith('/eve/')) return send({});
    return send({});
  });
  await page.goto(origin + '/today');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  const account=page.getByRole('navigation',{name:'Primary',exact:true});
  await expect(account.getByRole('link',{name:'Results',exact:true})).toBeVisible();
  await expect(account.getByRole('link',{name:'Activity',exact:true})).toBeVisible();
  await expect(account.getByRole('link',{name:'Memory',exact:true})).toHaveCount(0);
  await expect(account.getByTestId('deep-agent-unavailable')).toHaveText('Deep Agent is unavailable until qualified');
  // An empty overview renders no Work cards. Wait for its canonical read rather
  // than racing the visible loading placeholder against an empty container.
  await expect(page.getByRole('region', { name: 'Work', exact: true })).toBeAttached();
  await expect.poll(() => reads.includes('/api/work-inbox')).toBe(true);
  await expect(page.getByText('Loading your Work…', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Checking your current state…')).toHaveCount(0);
  assert.ok(reads.includes('/api/work-inbox'));
  assert.ok(!reads.includes('/api/beta/work'), 'Today must not make the unused legacy Work request');
  await expect(page.getByRole('alert').filter({ hasText: 'Some information is unavailable' })).toHaveCount(0);
  failInbox = true; await page.reload();
  await expect(page.getByText('Work could not be refreshed.', { exact: true })).toBeVisible();
  failInbox = false; await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('Work could not be refreshed.', { exact: true })).toHaveCount(0);
  await page.goto(origin + '/chat');
  const panel = page.getByRole('region', { name: 'Beta chat usage', exact: true });
  await expect(panel).toContainText('1/10 chat turns remaining today', { timeout: 15000 });
  // Seed only synthetic conversations in the signed owner's actual namespace.
  await page.evaluate(({thread, second}) => {
    const prefix = 'myeve-private:feedback-owner-1:';
    localStorage.setItem(prefix + 'eve-web-threads', JSON.stringify({ activeId: thread.id, threads: [thread, second] }));
    const event=(type,data,index)=>({type,data,meta:{id:`fixture-${index}`,at:new Date().toISOString()}});
    const events=[event('session.started',{sessionId:'fixture',sequence:0},0),event('turn.started',{turnId:'fixture-turn',sequence:1},1),event('message.received',{turnId:'fixture-turn',sequence:2,message:'Unsynced history fixture.',parts:[{type:'text',text:'Unsynced history fixture.'}],kind:'message'},2),event('turn.completed',{turnId:'fixture-turn',sequence:3},3),event('session.waiting',{sessionId:'fixture',sequence:4,wait:'next-user-message'},4)];
    for (const item of [thread, second]) localStorage.setItem(prefix + `eve-web-chat:${item.id}`, JSON.stringify({ events:item.id===thread.id?events:[], savedAt:Date.now()+60000 }));
  }, { thread, second });
  await page.reload();
  await expect(panel).toContainText('1/10 chat turns remaining today');
  await expect(page.getByText('Direct Agent conversation', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'View Agent', exact: true })).toHaveCount(0);
  await panel.getByText('Usage details and limits', { exact: true }).click();
  await expect(panel).toContainText('$0.90 / $1.00'); await expect(panel).toContainText('$1.10 / $5.00');
  await expect(panel).toContainText('$0.0412'); await expect(panel).toContainText('Reservations are not refunded');
  await panel.getByText('Usage details and limits', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Message Sofie', exact: true }).fill('Preserve this unsent draft.');
  await expect(page.getByText('Unsynced history fixture.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:`Delete ${thread.title}`,exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Delete',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Your messages and draft are still here.'})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Message Sofie',exact:true})).toHaveValue('Preserve this unsent draft.');
  await expect(page.getByText('Unsynced history fixture.',{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox',{name:'Message Sofie',exact:true})).toHaveValue('Preserve this unsent draft.');
  await expect(page.getByText('Unsynced history fixture.',{exact:true})).toBeVisible();
  assert.equal(await page.getByRole('button',{name:`Delete ${thread.title}`,exact:true}).count(),1);
  turn = 10;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(panel).toContainText('0/10 chat turns remaining today');
  await expect(panel).toContainText("Today's chat allowance is fully reserved");
  failUsage = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(panel).toContainText('Chat usage could not be refreshed. Limits still apply.');
  await expect(panel).not.toContainText('0/10');
  failUsage = false;
  await panel.getByRole('button', { name: 'Refresh usage', exact: true }).click();
  await expect(panel).toContainText('0/10 chat turns remaining today');
  await expect(page.getByRole('textbox', { name: 'Message Sofie', exact: true })).toHaveValue('Preserve this unsent draft.');
  const axe = await readFile(require.resolve('axe-core'), 'utf8'), accessibility = [];
  for (const [name, width, height] of [['desktop', 1280, 960], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole('textbox', { name: 'Message Sofie', exact: true })).toBeInViewport();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.evaluate(axe);
    const serious = await page.evaluate(async () => (await window.axe.run(document.querySelector('[aria-label="Beta chat usage"]'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => ({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
    if(serious.length) console.error(JSON.stringify({name,serious}));
    await page.screenshot({path:resolve(output,`${name}-contrast-check.png`)});
    assert.deepEqual(serious, []); accessibility.push({ name, serious });
    await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: false });
    await panel.getByText('Usage details and limits', { exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Message Sofie', exact: true })).toBeInViewport();
    await expect(page.getByRole('textbox', { name: 'Message Sofie', exact: true })).toBeEnabled();
    assert.ok(await panel.evaluate(el => el.getBoundingClientRect().height <= 161));
    await page.screenshot({ path: resolve(output, `${name}-expanded.png`), fullPage: false });
    await panel.getByText('Usage details and limits', { exact: true }).click();
  }
  await context.addCookies([{ name: 'myeve_session', value: tokens[1], url: origin }]);
  await page.reload();
  await expect(panel).toContainText('8/10 chat turns remaining today');
  await expect(page.getByText(thread.title, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Message Sofie', exact: true })).toHaveValue('');
  assert.equal(writes.filter(x => x.startsWith('POST /eve/')).length, 0);
  assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
  const receipt = { status: 'PASS', productionBuildId: (await readFile(resolve(app, '.next/BUILD_ID'), 'utf8')).trim(), scope: 'Real built application; synthetic resource responses. Prompt delivery tested separately; live model behavior not exercised.', checks: ['Today ignores failed unused Work endpoint', 'real Work outage remains visible and retryable', 'owner daily and trial reservations distinct from measured cost', 'quota refresh and exhaustion', 'failure removes stale values and retry preserves draft', 'failed thread deletion preserves unsynced history and draft through reload without duplicate metadata', 'primary Agent chip hidden in alpha', 'desktop/mobile collapsed and expanded details keep composer visible', 'usage accessibility', 'same-browser owner switch isolates threads, draft and usage'], accessibility, paidOperations: 0, productionMutations: 0 };
  await writeFile(resolve(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
} finally { await browser?.close(); await stopOwnedProcess(server); await log.close(); }
