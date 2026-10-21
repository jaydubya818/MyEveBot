import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluate, extractWindow, readWindows, PRICE_FILES} from './pricing-window-check.mjs';

const DAY = 86400000;
const sample = (revision, validUntil) => `export const price=Object.freeze({revision:'${revision}',model:'openai/gpt-5.4-mini',validUntil:'${validUntil}',x:1});`;

test('extracts revision and window and rejects unrecognised shapes', () => {
  assert.deepEqual(extractWindow('f', sample('r-v3', '2026-10-28T00:00:00.000Z')), {file: 'f', revision: 'r-v3', validUntil: '2026-10-28T00:00:00.000Z'});
  assert.throws(() => extractWindow('f', 'export const price={}'), /PRICE_WINDOW_UNPARSEABLE:f/);
  assert.throws(() => extractWindow('f', sample('r', 'tomorrow').replace(/'tomorrow'/, "'2026-13-45T99:99:99Z'")), /PRICE_WINDOW_UNPARSEABLE/);
});

test('expired, expiring and healthy windows are distinguished; any unhealthy window fails the whole check', () => {
  const end = Date.parse('2026-10-28T00:00:00.000Z');
  const w = [{file: 'a', revision: 'a', validUntil: '2026-10-28T00:00:00.000Z'}];
  assert.equal(evaluate(w, {now: end - 10 * DAY}).rows[0].status, 'OK');
  assert.equal(evaluate(w, {now: end - 3 * DAY}).rows[0].status, 'EXPIRING');
  assert.equal(evaluate(w, {now: end}).rows[0].status, 'EXPIRED');
  assert.equal(evaluate(w, {now: end + 1}).ok, false);
  assert.equal(evaluate([...w, {file: 'b', revision: 'b', validUntil: '2027-01-01T00:00:00.000Z'}], {now: end - 2 * DAY}).ok, false);
  assert.equal(evaluate([{file: 'b', revision: 'b', validUntil: '2027-01-01T00:00:00.000Z'}], {now: end}).ok, true);
});

test('invalid arguments fail closed (no default that could hide an expiry)', () => {
  assert.throws(() => evaluate([], {now: NaN}), /PRICE_WINDOW_ARGUMENTS/);
  assert.throws(() => evaluate([], {warnDays: -1}), /PRICE_WINDOW_ARGUMENTS/);
});

test('reads exactly the two pinned price sources', () => {
  const seen = [];
  const rows = readWindows('/root', p => { seen.push(p); return sample('r', '2026-10-28T00:00:00.000Z'); });
  assert.deepEqual(seen, PRICE_FILES.map(f => '/root/' + f));
  assert.equal(rows.length, 2);
});
