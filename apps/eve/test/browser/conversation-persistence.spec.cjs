const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://localhost:3073' });
test.skip(process.env.MYEVE_SESSION_FIXTURE !== '1', 'Requires the isolated deterministic model fixture.');

test.beforeEach(async ({ page }) => {
  await page.goto('/login?returnTo=/chat');
  await page.getByLabel('Your access password').fill(process.env.MYEVE_FIXTURE_ACCESS_PASSWORD);
  await page.getByRole('button', { name: 'Open Ava', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message Ava', exact: true }).waitFor({ timeout: 45000 });
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
});

test('a failed conversation save retains the draft and never starts a model session', async ({ page }) => {
  const sessionPosts = [];
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/eve/v1/session')) sessionPosts.push(request.url());
  });
  await page.route('**/api/threads/*', async route => {
    if (route.request().method() === 'PUT') await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' });
    else await route.continue();
  });
  const composer = page.getByRole('textbox', { name: 'Message Ava', exact: true });
  await composer.fill('Keep this draft when conversation storage is unavailable.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Your conversation could not be saved' })).toBeVisible();
  await expect(composer).toHaveValue('Keep this draft when conversation storage is unavailable.');
  expect(sessionPosts).toEqual([]);
  await page.unroute('**/api/threads/*');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Migration fixture reply.', { exact: true })).toHaveCount(1, { timeout: 45000 });
  expect(sessionPosts).toHaveLength(1);
});

test('first send waits for conversation storage and prevents duplicate submissions', async ({ page }) => {
  const sessionPosts = [];
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/eve/v1/session')) sessionPosts.push(request.url());
  });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/threads/*', async route => {
    if (route.request().method() === 'PUT') await gate;
    await route.continue();
  });
  const composer = page.getByRole('textbox', { name: 'Message Ava', exact: true });
  await composer.fill('fixture delayed save');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  try {
    await expect(page.getByRole('status').filter({ hasText: 'Saving conversation' })).toBeVisible();
    await expect(composer).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await composer.evaluate(node => node.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await page.locator('main').evaluate(node => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File(['Synthetic late file'], 'late-file.txt', { type: 'text/plain' }));
      node.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    });
    await expect(page.getByRole('alert').filter({ hasText: 'Wait until the current message is ready' })).toBeVisible();
    await expect(page.getByText('late-file.txt', { exact: true })).toHaveCount(0);
    expect(sessionPosts).toEqual([]);
  } finally { release(); }
  await expect(page.getByText('Migration fixture reply.', { exact: true })).toHaveCount(1, { timeout: 45000 });
  expect(sessionPosts).toHaveLength(1);
});

test('failed save preserves staged attachments and retry is gated by storage', async ({ page }) => {
  const posts = [];
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/eve/v1/session')) posts.push(request.url());
  });
  const composer = page.getByRole('textbox', { name: 'Message Ava', exact: true });
  await composer.fill('fixture first message');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Migration fixture reply.', { exact: true })).toHaveCount(1, { timeout: 45000 });
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  await page.route('**/api/threads/*', async route => {
    if (route.request().method() === 'PUT') await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' });
    else await route.continue();
  });
  await composer.fill('Preserve this attachment draft.');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Attach files', exact: true }).click();
  await (await chooser).setFiles({ name: 'preserved.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic saved notes.') });
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Your conversation could not be saved' })).toBeVisible();
  await expect(composer).toHaveValue('Preserve this attachment draft.');
  await expect(page.getByText('preserved.txt', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Your conversation could not be saved' })).toBeVisible();
  expect(posts).toHaveLength(1);
  await expect(composer).toHaveValue('Preserve this attachment draft.');
});

test('staged files cannot be removed during the save wait', async ({ page }) => {
  const composer = page.getByRole('textbox', { name: 'Message Ava', exact: true });
  await composer.fill('fixture pending attachment');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Attach files', exact: true }).click();
  await (await chooser).setFiles({ name: 'pending.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic pending notes.') });
  await expect(page.getByRole('button', { name: 'Remove pending.txt', exact: true })).toBeVisible();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/threads/*', async route => {
    if (route.request().method() === 'PUT') {
      await gate;
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  try {
    await expect(page.getByRole('status').filter({ hasText: 'Saving conversation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove pending.txt', exact: true })).toHaveCount(0);
    await expect(page.getByText('pending.txt', { exact: true })).toBeVisible();
    await expect(composer).toBeDisabled();
  } finally { release(); }
  await expect(page.getByRole('alert').filter({ hasText: 'Your conversation could not be saved' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove pending.txt', exact: true })).toBeVisible();
  await expect(composer).toHaveValue('fixture pending attachment');
});

test('authenticated local runtime denies anonymous and forged-owner session creation', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    for (const path of ['/api/threads', '/eve/v1/session']) {
      const response = path.includes('/eve/')
        ? await context.request.post('http://localhost:3073' + path, { data: {}, headers: { 'x-myeve-owner-id': 'acceptance-sarah' } })
        : await context.request.get('http://localhost:3073' + path);
      expect(response.status()).toBe(401);
    }
  } finally { await context.close(); }
});

test('reconnect waits for the durable session before accepting a new draft', async ({ page }) => {
  const composer = page.getByRole('textbox', { name: 'Message Ava', exact: true });
  await composer.fill('fixture before reconnect');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Migration fixture reply.', { exact: true })).toHaveCount(1, { timeout: 45000 });
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/eve/v1/session/*/stream*', async route => { await gate; await route.continue(); });
  await page.reload();
  try {
    await expect(page.getByRole('status').filter({ hasText: 'Restoring conversation' })).toBeVisible();
    await expect(composer).toBeDisabled();
  } finally { release(); }
  await expect(composer).toBeEnabled();
  await composer.fill('Preserve this new draft after reconnect.');
  await expect(composer).toHaveValue('Preserve this new draft after reconnect.');
  await expect(page.getByText('Migration fixture reply.', { exact: true })).toHaveCount(1);
});

test('a failed upload retains the draft and does not start a model session', async ({ page }) => {
  const sessionPosts = [];
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/eve/v1/session')) sessionPosts.push(request.url());
  });
  await page.route('**/api/files/upload', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' }));
  const composer = page.getByRole('textbox', { name: 'Message Ava', exact: true });
  await composer.fill('Keep this draft when attachment storage fails.');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Attach files', exact: true }).click();
  await (await chooser).setFiles({ name: 'synthetic-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic test notes.') });
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Attachment upload or retrieval failed' })).toBeVisible();
  await expect(composer).toHaveValue('Keep this draft when attachment storage fails.');
  expect(sessionPosts).toEqual([]);
});

test('a successful first turn survives reload and continues on desktop and mobile', async ({ page }, testInfo) => {
  const sessionPosts = [];
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/eve/v1/session')) sessionPosts.push(new URL(request.url()).pathname);
  });
  const composer = page.getByRole('textbox', { name: 'Message Ava', exact: true });
  await composer.fill('fixture hello');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Migration fixture reply.', { exact: true })).toHaveCount(1, { timeout: 45000 });
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Migration fixture reply.', { exact: true })).toHaveCount(1);
  await composer.fill('fixture follow-up');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Migration fixture reply.', { exact: true })).toHaveCount(2, { timeout: 45000 });
  expect(sessionPosts.filter(path => path === '/eve/v1/session')).toHaveLength(1);
  expect(sessionPosts.filter(path => /^\/eve\/v1\/session\/[^/]+$/.test(path))).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await composer.fill('fixture mobile follow-up');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Migration fixture reply.', { exact: true })).toHaveCount(3, { timeout: 45000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile-conversation.png') });
  await page.getByRole('button', { name: 'Open threads', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'App navigation' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name: 'Work', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'App navigation' })).toBeHidden();
  await expect(page).toHaveURL(/\/work$/);
});
