import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerConversationState, readDurableSessionTail, waitForOwnerSession, continueOwnerConversation } from './owner-conversation-qualification.mjs';

const identity = { ownerId: 'test-owner', workId: 'test-work', threadId: 'test-thread', sessionId: 'test-session' };
const event = (type, turnId = 'turn_0', extra = {}) => ({ type, data: { turnId, ...extra } });
const completedTurn = (turnId = 'turn_0') => [event('turn.started', turnId), event('message.completed', turnId), event('turn.completed', turnId), { type: 'session.waiting', data: { wait: 'next-user-message' }, meta: { id: 'waiting-' + turnId } }];
const snapshot = events => ({ activeId: identity.threadId, sessionId: identity.sessionId, workId: identity.workId, locked: true, events });
const tail = observed => ({ id: observed.events.at(-1).meta?.id, type: observed.events.at(-1).type, wait: observed.events.at(-1).data?.wait });

test('completed assistant turn then normal waiting permits same-session owner continuation', async () => {
  let observed = snapshot(completedTurn('turn_0')), sends = 0;
  const response = { request: () => ({ method: () => 'POST', allHeaders: async () => ({ 'x-myeve-thread-id': identity.threadId,
    'x-myeve-engineering-work-id': identity.workId, 'x-myeve-engineering-intent': 'observe' }) }),
    url: () => 'https://test.invalid/eve/v1/session/' + identity.sessionId,
    ok: () => true, json: async () => ({ ok: true, sessionId: identity.sessionId }), status: () => 202 };
  const page = { evaluate: async (_, args) => args.timeoutMs === undefined ? observed : tail(observed),
    waitForResponse: async predicate => { assert.equal(predicate(response), true); return response; },
    getByRole: role => ({ selectOption: async value => assert.equal(value, 'observe'), fill: async () => {},
      click: async () => { assert.equal(role, 'button'); sends++; observed = snapshot([...observed.events, ...completedTurn('turn_1')]); } }) };
  const ack = await continueOwnerConversation({ page, ...identity, message: 'Explain the retained result.', deadline: new Date(Date.now() + 5000).toISOString() });
  assert.equal(sends, 1); assert.equal(ack.sessionId, identity.sessionId); assert.equal(ack.threadId, identity.threadId);
  assert.equal((await waitForOwnerSession({ page, ...identity, settled: true })).boundary, 'READY');
});

for (const type of ['turn.failed', 'turn.cancelled', 'session.failed']) test(type + ' followed by waiting never permits Send', async () => {
  const observed = snapshot([event('turn.started'), event('message.completed'), event(type), completedTurn()[3]]);
  await assert.rejects(waitForOwnerSession({ page: { evaluate: async () => observed }, ...identity, settled: true }), /NOT_CONTINUABLE/);
});

test('wrong thread/session/Work and unlocked state are checked before foreign failure events', () => {
  for (const key of ['activeId', 'sessionId', 'workId', 'locked']) {
    assert.equal(ownerConversationState({ ...snapshot([event('session.failed')]), [key]: key === 'locked' ? false : 'foreign' }, identity), 'DETACHED');
  }
});

test('old completed turn cannot authorize a new unfinished turn', () => {
  assert.equal(ownerConversationState(snapshot([...completedTurn(), event('turn.started', 'turn_1'), completedTurn()[3]]), identity), 'UNSETTLED');
});

test('waiting alone, wrong completed-turn identity and partial assistant output do not prove completion', () => {
  for (const events of [[completedTurn()[3]], [event('turn.started'), event('message.completed'), event('turn.completed', 'other'), completedTurn()[3]],
    [event('turn.started'), event('message.appended'), event('turn.completed'), completedTurn()[3]]]) {
    assert.equal(ownerConversationState(snapshot(events), identity), 'UNSETTLED');
  }
});

test('pending human authorization/input, behind copies and terminal sessions cannot continue', () => {
  for (const type of ['authorization.required', 'input.requested']) assert.equal(ownerConversationState(snapshot([event('turn.started'), event(type), ...completedTurn().slice(1)]), identity), 'HUMAN_INPUT');
  for (const key of ['behind', 'pendingMessage']) assert.equal(ownerConversationState({ ...snapshot(completedTurn()), [key]: true }, identity), 'CATCHING_UP');
  assert.equal(ownerConversationState(snapshot([...completedTurn(), event('session.completed')]), identity), 'TERMINAL');
});

test('expired/invalid deadline or absent owner identity cannot send', async () => {
  for (const override of [{ deadline: 'invalid' }, { deadline: new Date(0).toISOString() }, { ownerId: '' }]) {
    await assert.rejects(continueOwnerConversation({ page: {}, ...identity, message: 'No send', deadline: new Date(Date.now() + 1000).toISOString(), ...override }));
  }
});

test('ambiguous acknowledgment never retries the send', async () => {
  let sends = 0;
  const page = { evaluate: async (_, args) => args.timeoutMs === undefined ? snapshot(completedTurn()) : tail(snapshot(completedTurn())),
    getByRole: () => ({ selectOption: async () => {}, fill: async () => {}, click: async () => { sends++; } }),
    waitForResponse: async () => ({ request: () => ({ allHeaders: async () => ({}) }), ok: () => false, json: async () => ({ ok: false }) }) };
  await assert.rejects(continueOwnerConversation({ page, ...identity, message: 'Explain', deadline: new Date(Date.now() + 5000).toISOString() }), /AMBIGUOUS_NO_RETRY/);
  assert.equal(sends, 1);
});

test('actual saved shape cannot authorize Send when the durable session advanced', async () => {
  const cached = snapshot(completedTurn()); // No invented behind/pending fields.
  for (const type of ['turn.started', 'turn.failed', 'session.waiting']) {
    const page = { evaluate: async (_, args) => args.timeoutMs === undefined ? cached : { id: 'newer-event', type, wait: 'next-user-message' } };
    await assert.rejects(continueOwnerConversation({ page, ...identity, message: 'No send', deadline: new Date(Date.now() + 5000).toISOString() }), /DURABLE_SESSION_CHANGED/);
  }
});

test('unavailable authenticated durable snapshot fails closed', async () => {
  const page = { evaluate: async (_, args) => { if (args.timeoutMs !== undefined) throw Error('SESSION_TAIL_UNAVAILABLE'); return snapshot(completedTurn()); } };
  await assert.rejects(continueOwnerConversation({ page, ...identity, message: 'No send', deadline: new Date(Date.now() + 5000).toISOString() }), /SESSION_TAIL_UNAVAILABLE/);
});

test('durable-tail reader uses authenticated GET and rejects malformed or unauthorized snapshots', async () => {
  const original = globalThis.fetch, page = { evaluate: (fn, args) => fn(args) };
  const valid = JSON.stringify(completedTurn().at(-1)) + '\n';
  try {
    for (const [status, version, body, accepted] of [[200, '25', valid, true], [403, '25', valid, false],
      [200, 'unknown', valid, false], [200, '25', 'invalid\n', false], [200, '25', '', false]]) {
      globalThis.fetch = async (url, options) => {
        assert.equal(url, '/eve/v1/session/test-session/stream?startIndex=-1');
        assert.equal(options.method ?? 'GET', 'GET'); assert.equal(options.credentials, 'same-origin');
        assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
        return new Response(body, { status, headers: { 'x-eve-stream-version': version } });
      };
      if (accepted) assert.equal((await readDurableSessionTail(page, identity.sessionId, 500)).id, 'waiting-turn_0');
      else await assert.rejects(readDurableSessionTail(page, identity.sessionId, 500), /SESSION_TAIL_UNAVAILABLE/);
    }
  } finally { globalThis.fetch = original; }
});
