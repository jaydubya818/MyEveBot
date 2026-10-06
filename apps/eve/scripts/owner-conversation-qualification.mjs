/** Operator browser qualification only. Readiness never grants model/Work authority. */
export function ownerConversationState(observed, expected) {
  if (observed.activeId !== expected.threadId || observed.sessionId !== expected.sessionId ||
      observed.workId !== expected.workId || observed.locked !== true) return 'DETACHED';
  if (observed.behind || observed.pendingMessage) return 'CATCHING_UP';
  const events = observed.events ?? [];
  const start = events.findLastIndex(event => event.type === 'turn.started');
  const turn = start < 0 ? [] : events.slice(start);
  const last = events.at(-1);
  if (turn.some(event => ['turn.failed', 'turn.cancelled', 'session.failed'].includes(event.type)) ||
      last?.type === 'session.failed') return 'FAILED_OR_CANCELLED';
  if (last?.type === 'session.completed') return 'TERMINAL';
  // Waiting also follows cancellation and human-input requests. It is not
  // sufficient alone: require this exact turn's completed assistant response.
  if (last?.type !== 'session.waiting' || last.data?.wait !== 'next-user-message') return 'UNSETTLED';
  if (turn.some(event => ['input.requested', 'authorization.required'].includes(event.type))) return 'HUMAN_INPUT';
  const turnId = turn[0]?.data?.turnId;
  const completed = turn.findLastIndex(event => event.type === 'turn.completed');
  if (!turnId || completed < 0 || turn[completed].data?.turnId !== turnId ||
      !turn.slice(0, completed).some(event => event.type === 'message.completed' && event.data?.turnId === turnId) ||
      turn.slice(completed + 1).some(event => event.type !== 'session.waiting')) return 'UNSETTLED';
  return 'READY';
}

/** Read the real owner-scoped browser copy; never seed sessions or synthetic events. */
export async function readOwnerConversation(page, { ownerId, threadId }) {
  return page.evaluate(({ ownerId, threadId }) => {
    const prefix = 'myeve-private:' + encodeURIComponent(ownerId) + ':';
    const chat = JSON.parse(localStorage.getItem(prefix + 'eve-web-chat:' + threadId) || 'null');
    const index = JSON.parse(localStorage.getItem(prefix + 'eve-web-threads') || 'null');
    return { activeId: index?.activeId, sessionId: chat?.session?.sessionId,
      workId: chat?.workSelection?.workId, locked: chat?.workContextLocked,
      behind: chat?.behind, pendingMessage: !!chat?.pendingMessage, events: chat?.events ?? [] };
  }, { ownerId, threadId });
}

/** Negative startIndex is Eve's authenticated, read-only durable-tail API. */
export async function readDurableSessionTail(page, sessionId, timeoutMs) {
  return page.evaluate(async ({ sessionId, timeoutMs }) => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
    let reader;
    try {
      const response = await fetch('/eve/v1/session/' + encodeURIComponent(sessionId) + '/stream?startIndex=-1', {
        credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
      });
      if (!response.ok || !response.body || response.headers.get('x-eve-stream-version') !== '25') throw Error('SESSION_TAIL_UNAVAILABLE');
      reader = response.body.getReader();
      const decoder = new TextDecoder(); let text = '';
      while (text.length < 65536) {
        const chunk = await reader.read();
        if (chunk.done) break;
        text += decoder.decode(chunk.value, { stream: true });
        const line = text.split('\n').find(value => value.trim());
        if (line && text.includes(line + '\n')) {
          const event = JSON.parse(line);
          return { id: event.meta?.id, type: event.type, wait: event.data?.wait };
        }
      }
      throw Error('SESSION_TAIL_UNAVAILABLE');
    } catch {
      throw Error('SESSION_TAIL_UNAVAILABLE');
    } finally { clearTimeout(timer); await reader?.cancel().catch(() => {}); }
  }, { sessionId, timeoutMs });
}

export async function waitForOwnerSession({ page, ownerId, workId, threadId, sessionId, settled = false, deadline }) {
  const expected = { ownerId, workId, threadId, sessionId };
  if (Object.values(expected).some(value => typeof value !== 'string' || !value)) throw Error('OWNER_SESSION_IDENTITY_REQUIRED');
  if (deadline !== undefined && !Number.isFinite(Date.parse(deadline))) throw Error('INVALID_SESSION_DEADLINE');
  const limit = Math.min(Date.now() + 15000, deadline === undefined ? Infinity : Date.parse(deadline));
  while (Date.now() < limit) {
    const observed = await readOwnerConversation(page, expected);
    const state = ownerConversationState(observed, expected);
    if (settled && ['FAILED_OR_CANCELLED', 'TERMINAL', 'HUMAN_INPUT'].includes(state)) {
      throw Error('ORIGINAL_SESSION_NOT_CONTINUABLE_NO_SEND');
    }
    if (settled && state === 'READY') {
      const tail = await readDurableSessionTail(page, sessionId, Math.min(5000, Math.max(1, limit - Date.now())));
      const cached = observed.events.at(-1);
      if (!tail.id || tail.id !== cached.meta?.id || tail.type !== 'session.waiting' || tail.wait !== 'next-user-message') {
        throw Error('DURABLE_SESSION_CHANGED_NO_SEND');
      }
      if (Date.now() >= limit) throw Error('SESSION_READBACK_DEADLINE_EXPIRED');
    }
    if ((!settled && state !== 'DETACHED') || state === 'READY') {
      return { threadId, sessionId, workId, locked: true, settled, boundary: state };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error(settled ? 'ORIGINAL_SESSION_NOT_REATTACHED_NO_SEND' : 'ORIGINAL_SESSION_NOT_PERSISTED_NO_DISCONNECT');
}

/** Caller must separately establish live paid authority before invoking this UI action. */
export async function continueOwnerConversation({ page, message, deadline, ...expected }) {
  await waitForOwnerSession({ page, ...expected, settled: true, deadline });
  const remaining = () => Math.min(20000, Date.parse(deadline) - Date.now());
  if (!Number.isFinite(remaining()) || remaining() <= 0) throw Error('PRODUCTIVE_DEADLINE_EXPIRED');
  await page.getByRole('combobox', { name: 'Request type', exact: true }).selectOption('observe', { timeout: remaining() });
  await page.getByRole('textbox', { name: 'Message Sofie', exact: true }).fill(message, { timeout: remaining() });
  // Recheck binding after editing, immediately before the single Send.
  await waitForOwnerSession({ page, ...expected, settled: true, deadline });
  if (remaining() <= 0) throw Error('PRODUCTIVE_DEADLINE_EXPIRED');
  const acknowledgment = page.waitForResponse(response => response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/eve/v1/session/' + expected.sessionId, { timeout: remaining() });
  const [response] = await Promise.all([acknowledgment, page.getByRole('button', { name: 'Send', exact: true }).click({ timeout: remaining() })]);
  const headers = await response.request().allHeaders(), body = await response.json();
  if (!response.ok() || !body.ok || (body.sessionId && body.sessionId !== expected.sessionId) ||
      headers['x-myeve-thread-id'] !== expected.threadId || headers['x-myeve-engineering-work-id'] !== expected.workId ||
      headers['x-myeve-engineering-intent'] !== 'observe') throw Error('CONTINUATION_AMBIGUOUS_NO_RETRY');
  return { ...expected, status: response.status(), transport: 'PRODUCTION_UI' };
}
