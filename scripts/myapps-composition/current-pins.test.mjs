import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const factory = 'e36c92e1968a6fa5ffc72b3de3ad1cfebaa6e816';
const missioncontrol = 'f9bcd0df4bb970a36a43599b00d724b07f300ad0';
test('all current qualification checkouts use the selected Factory and MissionControl sources', () => {
  const files = ['ci', 'unified-beta', 'myapps-composition', 'myapps-reference', 'missioncontrol-consumer'];
  let factoryCheckouts = 0, missioncontrolCheckouts = 0;
  for (const name of files) {
    const workflow = source('.github/workflows/' + name + '.yml');
    for (const match of workflow.matchAll(/repository: jaydubya818\/(MyFactory|MissionControl)\n/g)) {
      const remaining = workflow.slice(match.index + match[0].length);
      const end = remaining.search(/^\s*- (?:uses|name|run):/m);
      const attributes = end < 0 ? remaining : remaining.slice(0, end);
      const pin = attributes.match(/^\s*ref: ([a-f0-9]{40})$/m)?.[1];
      assert.ok(pin, 'Missing immutable checkout pin: ' + name);
      // One independently named untouched historical Factory comparison.
      if (name === 'myapps-composition' && pin === '92299fbd88004cc1da9178d52664bd0a9cd28647') {
        assert.match(attributes, /path: \.qualification\/factory-reviewed-history/);
        continue;
      }
      assert.equal(pin, match[1] === 'MyFactory' ? factory : missioncontrol, name);
      if (match[1] === 'MyFactory') factoryCheckouts++; else missioncontrolCheckouts++;
    }
  }
  assert.equal(factoryCheckouts, 7);
  assert.equal(missioncontrolCheckouts, 3);
  assert.ok(source('scripts/unified-beta/qualification-envelope.mjs').includes("snapshot,'" + factory + "'"));
  assert.ok(source('.github/workflows/unified-beta.yml').includes('MYEVE_OWNER_RESULT_MC_SHA: ' + missioncontrol));
  assert.match(source('.github/workflows/checkpoint-h.yml'), /Historical checkpoint-H comparison only; not the unified-beta MissionControl candidate/);
});

test('every composition JSON emitter is followed by the matching explicit report assertion', () => {
  for (const file of ['myapps-composition', 'unified-beta']) {
    const workflow = source('.github/workflows/' + file + '.yml');
    for (const [profile, report] of [['composed', 'composed-tests'], ['qe', 'qe-tests']]) {
      assert.match(workflow, new RegExp('outputFile=[^\\n]*' + report + '\\.json[^\\n]*\\n[^\\n]*assert-report\\.mjs ' + profile + ' '));
    }
  }
  assert.match(source('.github/workflows/myapps-composition.yml'), /outputFile=[^\n]*baseline-allowance-tests\.json\n[^\n]*assert-report\.mjs" baseline-allowance /);
});
