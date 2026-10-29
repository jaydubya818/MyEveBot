import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {assertCurrentPins, factory, componentFactory} from './current-pins.mjs';
import {parse} from 'yaml';

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
test('rehearsal installs the frozen YAML dependency before qualification tooling', () => {
  const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url)));
  assert.equal(lock.packages['node_modules/yaml'].version, '2.9.1');
  const steps = parse(workflows['myapps-composition.yml']).jobs.rehearsal.steps;
  const install = steps.findIndex(step => step.run === 'npm ci --ignore-scripts --no-audit --no-fund' && step['working-directory'] === '${{ github.workspace }}/myeve');
  const tooling = steps.findIndex(step => step.run?.includes('node --test scripts/myapps-composition/*.test.mjs'));
  assert.ok(install >= 0 && tooling > install, 'Tooling cannot run before its frozen dependencies are installed');
});
test('component source peer cannot replace a release peer or escape its exact read-only checkout', () => {
  assert.notEqual(componentFactory, factory);
  const source = workflows['developer-beta-components.yml'];
  for (const mutate of [
    text => text.replace(componentFactory, factory),
    text => text.replace('paired-components:', 'other-job:'),
    text => text.replace('path: .qualification/factory', 'path: .qualification/other'),
    text => text.replace('contents: read', 'contents: write'),
    text => text.replace('paired-components:', 'paired-components:\n    permissions:\n      contents: write'),
    text => text.replace('paired-components:', 'paired-components:\n    permissions: write-all'),
    text => text.replaceAll('persist-credentials: false', 'persist-credentials: true'),
    text => text.replace('repository: jaydubya818/MyFactory', 'repository: jaydubya818/MissionControl'),
  ]) {
    const changed = mutate(source);
    assert.notEqual(changed, source);
    assert.throws(() => assertCurrentPins({...workflows, 'developer-beta-components.yml':changed}, envelope));
  }
  assert.throws(() => assertCurrentPins({...workflows,
    'unified-beta.yml':workflows['unified-beta.yml'].replace('ref: '+factory, 'ref: '+componentFactory)}, envelope));
  assert.throws(() => assertCurrentPins({...workflows, 'unreviewed-components.yml':source}, envelope));
});
