import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const require = createRequire(import.meta.url);
/** All callbacks exercise live native backends; no browser response is mocked. */
export async function qualifyComposedBrowser({ root, configuration, platformOwner, onDisabled, onEnabled, onRevoked }) {
  const origin = 'http://localhost:3318';
  const output = join(root, 'output/playwright/capability-composed');
  await mkdir(output, { recursive: true });
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
    NEXT_TELEMETRY_DISABLED: '1', MYEVE_ENGINEERING_MODE: 'dogfood', ...configuration, MYEVE_CAPABILITY_ORIGIN: origin };
  const server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3318'],
    { cwd: join(root, 'apps/eve'), env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = '', browser;
  server.stdout.on('data', data => { log += data; }); server.stderr.on('data', data => { log += data; });
  const checks = [];
  try {
    for (let i = 0; i < 120; i++) {
      if (server.exitCode !== null) throw Error('Isolated Next server exited');
      try { if ((await fetch(origin + '/api/capability-control', { signal: AbortSignal.timeout(3000) })).status === 401) break; } catch {}
      if (i === 119) throw Error('Isolated Next server startup timeout');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || ['/api/models', '/api/update-check'].includes(url.pathname) || (url.pathname.startsWith('/eve/') && route.request().method() !== 'GET')) return route.abort();
      return route.continue();
    });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    await page.goto(origin + '/login?returnTo=/manage/capabilities');
    await page.getByLabel('Your access password').fill(configuration.MYEVE_ACCESS_PASSWORD);
    const loginResponse = page.waitForResponse(response => response.url().endsWith('/api/auth/login'));
    await page.getByRole('button', { name: /^Open / }).click();
    const login = await loginResponse; assert.equal(login.status(), 200);
    await page.getByRole('heading', { name: 'Capabilities', exact: true }).waitFor();
    await page.getByRole('article').nth(35).waitFor();
    assert.equal(await page.getByRole('article').count(), 36);
    if (platformOwner) assert.equal(await page.getByRole('switch', { checked: true }).count(), 36);
    checks.push('real password login and canonical owner-scoped Settings readback');
    const mission = page.getByRole('article', { name: 'MissionControl', exact: true });
    await mission.getByRole('switch', { checked: true }).click();
    await mission.getByRole('switch', { checked: false }).waitFor();
    const readback = async () => {
      const response = await context.request.get(origin + '/api/capability-control');
      assert.equal(response.status(), 200); return response.json();
    };
    const disabled = await readback(); assert.equal(disabled.propagation.status, 'ACKNOWLEDGED');
    await onDisabled(disabled, await context.cookies());
    checks.push('browser disable durably propagates, Sofie reads preference, backend denies admission, existing Mission survives');
    await mission.getByRole('switch').click();
    await mission.getByRole('switch', { checked: true }).waitFor();
    assert.equal((await readback()).propagation.status, 'ACKNOWLEDGED');
    await onEnabled();
    checks.push('browser enable receives exact acknowledgment before owner-authorized native Mission admission');
    await mission.getByText('Setup, permissions, and controls', { exact: true }).click();
    await mission.getByRole('button', { name: 'Request revocation' }).click();
    await mission.getByText('REVOKE_REQUESTED · PENDING_BACKEND', { exact: true }).waitFor();
    assert.equal((await readback()).propagation.status, 'ACKNOWLEDGED');
    await onRevoked();
    await page.reload();
    await mission.getByText('REVOKE_REQUESTED · PENDING_BACKEND', { exact: true }).waitFor();
    const reconnected = await readback();
    assert.equal(reconnected.capabilities.find(item => item.id === 'missioncontrol').control, 'REVOKE_REQUESTED');
    assert.equal(reconnected.activeWork.status, 'UNKNOWN');
    checks.push('revoke, native fence, browser reconnect and durable pending cleanup/UNKNOWN readback');
    await page.addScriptTag({ content: await readFile(require.resolve('axe-core/axe.min.js'), 'utf8') });
    const violations = await page.evaluate(async () => (await axe.run(document.querySelector('[aria-label="Policy status"]').parentElement,
      { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations);
    assert.deepEqual(violations.map(item => ({ id: item.id, impact: item.impact })), []);
    await page.getByRole('button', { name: 'Refresh capabilities' }).focus(); await page.keyboard.press('Enter');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    checks.push('capability panel accessibility, keyboard refresh and narrow viewport');
    await page.screenshot({ path: join(output, `${platformOwner ? 'platform' : 'ordinary'}.png`) });
    await writeFile(join(output, `${platformOwner ? 'platform' : 'ordinary'}.json`), JSON.stringify({ status: 'PASS', checks, violations, paidOperations: 0 }, null, 2) + '\n');
    return checks;
  } finally {
    await browser?.close();
    const exited = server.exitCode !== null ? Promise.resolve() : new Promise(resolve => server.once('exit', resolve));
    try { process.kill(-server.pid, 'SIGTERM'); } catch {}
    await exited;
    await writeFile(join(output, 'server.log'), log);
  }
}
