import assert from 'node:assert/strict';
import {parse} from 'yaml';
// Qualification uses YAML 2.9.1 already present in the frozen root dependency
// closure. CI must install that closure before running this tooling; preserve
// the separately qualified Builder lock bytes rather than repinning metadata.

export const factory = '416a633c7c7d2d9a31feb98a89e716c0bb74de52';
export const missioncontrol = 'f9bcd0df4bb970a36a43599b00d724b07f300ad0';
const reports = {'composed-tests.json': 'composed', 'qe-tests.json': 'qe', 'baseline-allowance-tests.json': 'baseline-allowance'};
const words = line => (line.match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? []).map(word => word.replace(/^(["'])(.*)\1$/, '$2'));

export function assertCurrentPins(workflows, envelope) {
  let factoryCheckouts = 0, missioncontrolCheckouts = 0, historicalFactory = 0, historicalMissioncontrol = 0, emitters = 0, assertions = 0;
  for (const [name, text] of Object.entries(workflows)) {
    const workflow = parse(text);
    const checkEnvironment = env => {
      if (env && Object.hasOwn(env, 'MYEVE_OWNER_RESULT_MC_SHA')) assert.equal(env.MYEVE_OWNER_RESULT_MC_SHA, missioncontrol, name);
    };
    checkEnvironment(workflow.env);
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      checkEnvironment(job.env);
      for (const step of job.steps ?? []) {
        checkEnvironment(step.env);
        if (typeof step.uses === 'string' && step.uses.toLowerCase().startsWith('actions/checkout@')) {
          const repository = step.with?.repository?.toLowerCase();
          if (repository === 'jaydubya818/myfactory' || repository === 'jaydubya818/missioncontrol') {
            const pin = step.with.ref;
            // Historical comparisons have an exact workflow/job/path/source identity.
            if (name === 'myapps-composition.yml' && jobName === 'rehearsal' && step.with.path === '.qualification/factory-reviewed-history') {
              assert.equal(repository, 'jaydubya818/myfactory');
              assert.equal(pin, '92299fbd88004cc1da9178d52664bd0a9cd28647'); historicalFactory++;
            } else if (name === 'checkpoint-h.yml' && step.with.path === '.qualification/missioncontrol') {
              assert.equal(repository, 'jaydubya818/missioncontrol');
              assert.equal(pin, 'af521c92c05a1c79d1aff11510efea8dcf23e350'); historicalMissioncontrol++;
              assert.match(text, /Historical checkpoint-H comparison only; not the unified-beta MissionControl candidate/);
            } else {
              assert.equal(pin, repository.endsWith('/myfactory') ? factory : missioncontrol, name);
              if (repository.endsWith('/myfactory')) factoryCheckouts++; else missioncontrolCheckouts++;
            }
          }
        }
        if (typeof step.run !== 'string') continue;
        // GitHub interpolates expressions before the shell sees whitespace.
        // Treat each expression atomically for both quoted and unquoted paths.
        const lines = step.run.replace(/\$\{\{[^}]*\}\}/g, expression => expression.replace(/\s/g, '')).split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('#')) continue;
          if (line.includes('assert-report.mjs')) assertions++;
          const output = line.match(/--outputFile(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/);
          if (!output) continue;
          const path = output[1] ?? output[2] ?? output[3], filename = path.split('/').at(-1);
          if (!Object.hasOwn(reports, filename)) continue;
          emitters++;
          const next = words(lines[i + 1] ?? '');
          assert.equal(next.length, 5, 'Missing immediate report assertion: ' + name);
          assert.equal(next[0], 'node');
          assert.ok(next[1].endsWith('/assert-report.mjs'));
          assert.equal(next[2], reports[filename]);
          assert.equal(next[3], path, 'Assertion reads a different report: ' + name);
        }
      }
    }
  }
  assert.equal(factoryCheckouts, 7); assert.equal(missioncontrolCheckouts, 3);
  assert.equal(historicalFactory, 1); assert.equal(historicalMissioncontrol, 1);
  assert.equal(emitters, 5); assert.equal(assertions, emitters);
  assert.ok(envelope.includes("snapshot,'" + factory + "'"));
}
