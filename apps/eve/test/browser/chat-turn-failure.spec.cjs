const { test, expect } = require('@playwright/test');

// Runs against the disposable Golden Work UI fixture. The transcript is injected
// into this browser context; no Eve session or model request is made.
test.skip(process.env.MYEVE_CHAT_FAILURE_FIXTURE !== '1', 'Requires the local Golden Work UI fixture');

const baseURL = process.env.MYEVE_CHAT_FAILURE_BASE_URL || 'http://localhost:3103';
const password = process.env.MYEVE_CHAT_FAILURE_PASSWORD || 'golden-ui-qualification';
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
  throw new Error('The chat failure fixture must run against a loopback host.');
}
const threadId = '00000000-0000-4000-8000-000000000061';
const chatKey = `eve-web-chat:${threadId}`;

function event(type, data, index) {
  return {
    type,
    data,
    meta: { id: `fixture-event-${index}`, at: new Date(2026, 8, 26, 10, 0, index).toISOString() },
  };
}

const failedEvents = [
  event('session.started', { sessionId: 'fixture-session', sequence: 0 }, 0),
  event('turn.started', { turnId: 'fixture-turn-1', sequence: 1 }, 1),
  event('message.received', { turnId: 'fixture-turn-1', sequence: 2, message: 'hi Sofie', parts: [{ type: 'text', text: 'hi Sofie' }], kind: 'message' }, 2),
  event('turn.failed', { turnId: 'fixture-turn-1', sequence: 3, code: 'MODEL_UNAVAILABLE', message: 'synthetic provider detail that must not appear in UI' }, 3),
  event('session.waiting', { sessionId: 'fixture-session', sequence: 4, wait: 'next-user-message' }, 4),
];

async function saveChat(page, events) {
  await page.evaluate(({ threadId, chatKey, events }) => {
    const updatedAt = Date.now();
    localStorage.setItem('eve-web-threads', JSON.stringify({
      activeId: threadId,
      threads: [{ id: threadId, title: 'Synthetic failed turn', updatedAt }],
    }));
    localStorage.setItem(chatKey, JSON.stringify({ events, savedAt: updatedAt + 60_000 }));
  }, { threadId, chatKey, events });
}

test('failed turn is visible after session.waiting and reload, then clears on a later turn', async ({ page }) => {
  const sessionPosts = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/eve/v1/session')) {
      sessionPosts.push(request.url());
    }
  });
  await page.route('**/eve/v1/session**', (route) => route.abort());
  await page.route('**/api/threads', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ threads: [] }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/threads/*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

  await page.goto(`${baseURL}/login?returnTo=%2Fchat`);
  await page.getByLabel('Access password').fill(password);
  await page.getByRole('button', { name: 'Open Sofie' }).click();
  await expect(page).toHaveURL(/\/chat$/);

  await saveChat(page, failedEvents);
  await page.reload();
  const failure = page.getByRole('alert').filter({ hasText: "Sofie couldn’t finish this turn." });
  await expect(failure).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review setup' }).last()).toBeEnabled();
  await expect(page.getByText('synthetic provider detail that must not appear in UI')).toHaveCount(0);

  await page.reload();
  await expect(failure).toBeVisible();

  await saveChat(page, [
    ...failedEvents,
    event('turn.started', { turnId: 'fixture-turn-2', sequence: 5 }, 5),
    event('message.received', { turnId: 'fixture-turn-2', sequence: 6, message: 'follow-up', parts: [{ type: 'text', text: 'follow-up' }], kind: 'message' }, 6),
    event('turn.completed', { turnId: 'fixture-turn-2', sequence: 7 }, 7),
    event('session.waiting', { sessionId: 'fixture-session', sequence: 8, wait: 'next-user-message' }, 8),
  ]);
  await page.reload();
  await expect(failure).toHaveCount(0);
  expect(sessionPosts).toHaveLength(0);
});
