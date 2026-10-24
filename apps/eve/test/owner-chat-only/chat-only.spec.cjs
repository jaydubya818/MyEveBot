const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { capture } = require('./provenance.cjs');
const { checkMobileConversationLayout } = require('../browser/mobile-conversation-layout.mjs');
const config = JSON.parse(fs.readFileSync(process.env.MYEVE_CHAT_ONLY_BROWSER_CONFIG, 'utf8'));
const stage = process.env.MYEVE_CHAT_ONLY_STAGE;
const evidence = process.env.MYEVE_CHAT_ONLY_EVIDENCE;
if (!['chat','restart-readback'].includes(stage) || !evidence || config.slots.length !== 2) throw Error('Source-bound fixture configuration required');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const message = slot => [`Keep this private planning marker: ${slot.marker}. Reply in one sentence.`,
  'Use my earlier planning marker in one short sentence.', 'Book a flight, charge my card, and start paid Work.'];
const reply = slot => [`I can plan with your marker ${slot.marker}.`, `Your earlier marker is ${slot.marker}.`,
  "I can't book flights, make purchases, or charge cards in this beta. Paid Work is disabled; I can help plan in chat."];
async function oracle(context, slot) {
  const response = await context.request.get(slot.oracle + '/fixture/status'); expect(response.status()).toBe(200);
  return response.json();
}
async function login(page, slot) {
  await page.goto(slot.base + '/login');
  await page.getByLabel('Your access password').fill(slot.password);
  await page.getByRole('button', { name: 'Open Sofie', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/today$'));
  const status = await (await page.request.get(slot.base + '/api/auth/status')).json();
  expect(status).toMatchObject({ ownerId: slot.ownerId, authenticated: true, mode: 'owner-session' });
}
async function usage(context, slot) {
  const response = await context.request.get(slot.base + '/api/chat-usage'); expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('private, no-store'); expect(response.headers().vary).toBe('Cookie');
  const value = await response.json();
  expect(value.limits).toEqual({ dailyTurns: 10, perTurnMicrousd: 100000, dailyMicrousd: 1000000,
    trialMicrousd: 5000000, sharedDailyMicrousd: 2000000, sharedTrialMicrousd: 10000000 });
  expect(value.state).toBe('active'); expect(value.localPaused).toBe(false);
  expect(value.measured).toEqual({ dailyMicrousd: 0, trialMicrousd: 0, unsettledOperations: 0 });
  return value;
}
function assertAccounting(value, turns) {
  expect(value.modelCalls).toBe(turns);
  for (const rows of [value.allowances, value.operations, value.admissions, value.dispatches]) expect(rows).toHaveLength(turns);
  expect(Object.values(value.effects).every(count => count === 0)).toBe(true);
  expect(value.operations.every(row => row.state === 'SETTLED' && row.source === 'SOFIE' && row.spent_microusd !== null && Number(row.spent_microusd) === 0)).toBe(true);
  expect(value.dispatches.every(row => row.state === 'SETTLED')).toBe(true);
  expect(value.allowances.every(row => row.kind === 'CHAT' && Number(row.ceiling_microusd) === 100000)).toBe(true);
  expect(value.admissions.every(row => row.kind === 'CHAT' && row.state === 'BOUND' && Number(row.ceiling_microusd) === 100000 && value.allowances.some(a => a.id === row.local_allowance_id))).toBe(true);
  const today = value.admissions.filter(row => Number(row.day_index) === value.usage.dayIndex).length;
  expect(value.usage).toMatchObject({ dailyTurnsUsed: today, quotaRemaining: 10 - today,
    dailyReservedMicrousd: today * 100000, trialReservedMicrousd: turns * 100000 });
  expect(value.threads.every(thread => thread.failedTurns === 0)).toBe(true);
}
async function saved(context, slot, turns) {
  await expect.poll(async () => {
    const value = await oracle(context, slot);
    return value.threads.length === 1 && value.threads[0].persistedReplies === turns && value.threads[0].completedTurns === turns &&
      value.threads[0].sessionId && value.operations.length === turns && value.operations.every(row => row.state === 'SETTLED') &&
      value.dispatches.length === turns && value.dispatches.every(row => row.state === 'SETTLED');
  }).toBeTruthy();
  const value = await oracle(context, slot); assertAccounting(value, turns);
  return value;
}
async function checkReadback(page, slot, before) {
  await page.goto(slot.base + '/chat?thread=' + encodeURIComponent(before.threads[0].id));
  for (const text of reply(slot)) await expect(page.getByText(text, { exact: true })).toBeVisible();
  await expect(page.locator('[data-thread-id]')).toHaveAttribute('data-thread-id', before.threads[0].id);
  const after = await oracle(page.context(), slot); assertAccounting(after, 3);
  for (const key of ['allowances','operations','admissions','dispatches','threads','runs','password','local']) expect(after[key]).toEqual(before[key]);
  return after;
}
async function audit(page, slot) {
  for (const width of [1440,390]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 390) await checkMobileConversationLayout(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await expect(page.getByRole('textbox', { name: 'Message Sofie', exact: true })).toBeVisible();
    await page.addScriptTag({ content: axe });
    const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(v => ({ id: v.id, impact: v.impact })));
    expect(violations.filter(v => ['critical','serious'].includes(v.impact))).toEqual([]);
    await capture(page, path.join(evidence, `${stage}-slot-${slot.slot}-${width}.png`), config, slot.slot);
  }
}

test('current-profile synthetic chat persists with Work denied and no productive qualification', async ({ browser }) => {
  const contexts = [], results = [];
  const previous = stage === 'restart-readback' ? JSON.parse(fs.readFileSync(path.join(evidence, 'chat-state.json'), 'utf8')) : null;
  try {
    for (const slot of config.slots) {
      const context = await browser.newContext(); contexts.push(context);
      const origins = new Set([new URL(slot.base).origin]);
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (!origins.has(url.origin)) return route.abort('blockedbyclient');
        const method = route.request().method(), name = url.pathname;
        const allowed = ['GET','HEAD'].includes(method) ||
          (method === 'POST' && (['/api/auth/login','/api/auth/logout'].includes(name) || /^\/eve\/v1\/session(?:\/[^/]+)?$/.test(name))) ||
          (method === 'PUT' && /^\/api\/threads\/[^/]+$/.test(name));
        return allowed ? route.continue() : route.abort('blockedbyclient');
      });
      const page = await context.newPage();
      expect((await context.request.get(slot.base + '/api/chat-usage')).status()).toBe(401);
      expect((await context.request.get(slot.base + '/api/threads')).status()).toBe(401);
      const initial = await oracle(context, slot); assertAccounting(initial, previous ? 3 : 0);
      await login(page, slot);
      const active = await usage(context, slot);
      expect(active.trialReservedMicrousd).toBe(previous ? 300000 : 0);
      const credential = (await oracle(context, slot)).password;
      expect(credential).toEqual([{ ownerId: slot.ownerId, version: 0, hashed: true }]);
      if (previous) {
        const before = previous.slots.find(item => item.slot === slot.slot);
        results.push(await checkReadback(page, slot, before));
      } else {
        await page.goto(slot.base + '/chat');
        for (let turn = 0; turn < 3; turn++) {
          const box = page.getByRole('textbox', { name: 'Message Sofie', exact: true });
          await expect(box).toBeEnabled(); await box.fill(message(slot)[turn]);
          if (turn === 0) await box.press('Enter'); else await page.getByRole('button', { name: 'Send', exact: true }).click();
          // Submission and semantic completion are separate. Never automatically
          // resend because a reply is absent or a submitted turn failed.
          await expect(page.getByText(message(slot)[turn], { exact: true })).toBeVisible();
          await expect(box).toHaveValue('');
          await expect(page.getByText(reply(slot)[turn], { exact: true })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
          await saved(context, slot, turn + 1);
        }
        const before = await saved(context, slot, 3);
        expect(before.threads[0]).toMatchObject({ ownerId: slot.ownerId, persistedReplies: 3, failedTurns: 0 });
        expect(before.threads[0].agentId).toBeTruthy();
        expect(before.runs.length).toBeGreaterThan(0);
        expect(before.runs.every(run => run.owner_id === slot.ownerId && run.thread_id === before.threads[0].id && run.session_id === before.threads[0].sessionId && run.agent_id === before.threads[0].agentId)).toBe(true);
        expect((await context.request.get(slot.base + '/work/new')).status()).toBe(404);
        await expect(page.locator('.owner-work-summary')).toHaveCount(0);
        await page.reload(); await checkReadback(page, slot, before);
        await context.setOffline(true); expect(await page.evaluate(() => navigator.onLine)).toBe(false);
        await context.setOffline(false); expect(await page.evaluate(() => navigator.onLine)).toBe(true);
        await checkReadback(page, slot, before);
        const fresh = await context.newPage(); await checkReadback(fresh, slot, before); await fresh.close();
        expect((await context.request.post(slot.base + '/api/auth/logout')).status()).toBe(200);
        expect((await context.request.get(slot.base + '/api/threads')).status()).toBe(401);
        await login(page, slot); results.push(await checkReadback(page, slot, before));
      }
      await audit(page, slot);
      const value = await usage(context, slot);
      const shown = page.getByRole('region', { name: 'Beta chat usage', exact: true });
      await expect(shown).toContainText(`${value.quotaRemaining}/10 chat turns remaining today`);
      await expect(shown).toContainText(`Daily budget reserved: $${(value.dailyReservedMicrousd / 1000000).toFixed(2)} / $1.00`);
      await expect(shown).toContainText('Trial: $0.30 / $5.00');
    }
    // Both requesting sessions remain valid at their own origins. Missing IDs
    // in another database are a topology/not-found case, not same-store proof.
    for (let index = 0; index < 2; index++) {
      const slot = config.slots[index], foreign = results[1 - index], own = results[index], context = contexts[index];
      expect((await context.request.get(slot.base + '/api/threads/' + own.threads[0].id)).status()).toBe(200);
      expect((await context.request.get(slot.base + '/api/threads/' + foreign.threads[0].id)).status()).toBe(404);
      const status = await context.request.get(slot.base + '/api/chat-usage?ownerId=' + foreign.ownerId + '&mode=reserve');
      expect(status.status()).toBe(200); expect(JSON.stringify(await status.json())).not.toContain(foreign.ownerId);
      const altered = await context.request.get(slot.base + '/api/threads', { headers: { 'x-myeve-browser-owner': foreign.ownerId } });
      expect(altered.status()).toBe(401);
      // Known own session + wrong thread has an explicit owner-session denial;
      // do not count the 500 from an absent session row as isolation success.
      const denied = await context.request.get(slot.base + '/eve/v1/session/' + encodeURIComponent(own.threads[0].sessionId) + '/stream',
        { headers: { 'x-myeve-thread-id': foreign.threads[0].id } });
      expect(denied.status()).toBe(403);
      const ownStream = await context.pages()[0].evaluate(async ({ url, thread }) => {
        const abort = new AbortController();
        try { return (await fetch(url, { headers: { 'x-myeve-thread-id': thread }, signal: abort.signal })).status; }
        finally { abort.abort(); }
      }, { url: slot.base + '/eve/v1/session/' + encodeURIComponent(own.threads[0].sessionId) + '/stream', thread: own.threads[0].id });
      expect(ownStream).toBe(200);
      await checkReadback(context.pages()[0], slot, own);
    }
    fs.writeFileSync(path.join(evidence, stage === 'chat' ? 'chat-state.json' : 'restart-state.json'), JSON.stringify({
      source: config.source, scope: 'synthetic chat-only', slots: results,
      isolation: { validOwnReads: 'PASS', crossDatabaseForeignThread: 'NOT_FOUND_TOPOLOGY_CHECK',
        knownOwnSessionWrongThread: 'DENIED_403', browserOwnerOverride: 'DENIED_401',
        sameStoreKnownForeignOwner: 'EXISTING_CONTRACT_COVERAGE_NOT_EXECUTED_HERE', foreignCookie: 'NOT_EXECUTED_NOT_SUBSTITUTED' },
      originalPositiveWorkJourneys: 'FAILED_HOLD_DOWNSTREAM_NOT_REACHED_UNCHANGED',
    }, null, 2) + '\n');
  } finally { for (const context of contexts) await context.close(); }
});
