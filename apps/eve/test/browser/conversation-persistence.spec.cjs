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
    await page.keyboard.press('Enter');
    expect(sessionPosts).toEqual([]);
  } finally { release(); }
  await expect(page.getByText('Migration fixture reply.', { exact: true })).toHaveCount(1, { timeout: 45000 });
  expect(sessionPosts).toHaveLength(1);
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
