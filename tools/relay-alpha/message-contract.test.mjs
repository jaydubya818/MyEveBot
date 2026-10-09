import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptsMessage } from './message-contract.mjs';
const scope = { alphaAddress: 'relay://acct_alpha/agt_alpha', sofieOwnerId: 'acct_sofie', sofieAgentId: 'agt_sofie' };
const message = { id: 'request', capability: 'message.send', resource: scope.alphaAddress,
  target: { address: scope.alphaAddress }, caller: { ownerId: scope.sofieOwnerId, agentId: scope.sofieAgentId }, payload: { body: 'Hello' } };
test('accepts canonical recipient resource and legacy messages after signature verification', () => {
  assert(acceptsMessage(message, 'request', scope));
  assert(acceptsMessage({ ...message, resource: 'messages' }, 'request', scope));
});
test('denies unrelated resources, callers, destinations, capabilities and malformed bodies', () => {
  for (const changed of [
    { resource: 'relay://acct_other/agt_other' }, { capability: 'knowledge.query' },
    { id: 'other-request' }, { target: { address: 'relay://acct_other/agt_other' } },
    { caller: { ...message.caller, ownerId: 'other' } }, { caller: { ...message.caller, agentId: 'other' } },
    { payload: { body: '' } }, { payload: { body: 'x'.repeat(4001) } }, { payload: {} },
  ]) assert.equal(acceptsMessage({ ...message, ...changed }, 'request', scope), false);
});
