import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {assertCurrentPins, factory} from './current-pins.mjs';

const root = new URL('../../.github/workflows/', import.meta.url);
const workflows = Object.fromEntries(readdirSync(root).filter(name => /\.ya?ml$/i.test(name)).map(name => [name, readFileSync(new URL(name, root), 'utf8')]));
const envelope = readFileSync(new URL('../unified-beta/qualification-envelope.mjs', import.meta.url), 'utf8');
test('every workflow checkout and composition JSON emitter has its exact qualified binding', () => {
  assertCurrentPins(workflows, envelope);
  const quoted = Object.fromEntries(Object.entries(workflows).map(([name, text]) => [name, text.replaceAll('repository: jaydubya818/MyFactory', 'repository: "JAYDUBYA818/myfactory"')]));
  assertCurrentPins(quoted, envelope);
});
test('rejects wrong pins in new or differently formatted workflows and every unasserted emitter', () => {
  const wrong = 'a'.repeat(40);
  for (const repository of ['"jaydubya818/MyFactory"', 'jaydubya818/myfactory']) {
    const added = `name: additional\non: push\njobs:\n  check:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          repository: ${repository}\n          ref: ${wrong}\n`;
    assert.throws(() => assertCurrentPins({...workflows, 'new-workflow.yaml': added}, envelope));
  }
  for (const mutation of [
    text => text.replace('ref: ' + factory, 'ref: ' + wrong),
    text => text.replace(/(.*--outputFile=.*composed-tests\.json.*\n)/, '$1$1'),
    text => text.replace(/(.*--outputFile=.*composed-tests\.json.*\n)/, '$1        node_modules/.bin/vitest run --outputFile=${{ github.workspace }}/composed-tests.json\n'),
    text => text.replace(/(.*assert-report\.mjs composed .*\n)/, ''),
    text => text.replace(/(assert-report\.mjs composed [^\n]*composed-tests)\.json/, '$1-wrong.json'),
  ]) {
    const changed = mutation(workflows['unified-beta.yml']);
    assert.notEqual(changed, workflows['unified-beta.yml']);
    assert.throws(() => assertCurrentPins({...workflows, 'unified-beta.yml': changed}, envelope));
  }
  assert.throws(() => assertCurrentPins(workflows, envelope.replace(factory, wrong)));
});
