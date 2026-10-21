import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('historical fixture inputs match original composition provenance, never the release HEAD', () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const fixtures = JSON.parse(readFileSync(new URL('../../docs/myapps/historical-composition-fixtures.json', import.meta.url)));
  const original = 'd0ecbfa4cf2f0760c1752ae535946c4a83bba213';
  assert.equal(fixtures.scope, 'HISTORICAL_TEST_INPUTS_ONLY');
  assert.equal(fixtures.myeve.provenanceCommit, original);
  const message = execFileSync('git', ['-C', root, 'show', '-s', '--format=%B', original], {encoding: 'utf8'});
  assert(message.includes(`Preparation: ${fixtures.myeve.phase3Preparation}\n`));
  const manifest = JSON.parse(execFileSync('git', ['-C', root, 'show', `${original}:docs/myapps/phase3/factory-main-sources.json`], {encoding: 'utf8'}));
  assert.equal(fixtures.myfactory.phase3Preparation, manifest.identity.record.preparationCommit);
});

test('composition rejects an unreviewed preparation before creating output or Git objects', () => {
  const directory = mkdtempSync(join(tmpdir(), 'composition-preparation-'));
  try {
    const git = args => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
    git(['init', '--quiet']);
    writeFileSync(join(directory, 'unreviewed.txt'), 'Unreviewed source must not enter the candidate.\n');
    git(['add', 'unreviewed.txt']);
    git(['-c', 'user.name=Synthetic fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'unreviewed preparation']);
    const head = git(['rev-parse', 'HEAD']), objects = git(['count-objects', '-v']);
    const output = join(directory, 'output');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./materialize.mjs', import.meta.url)), directory, directory, output], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unreviewed myeve preparation source/);
    assert.equal(existsSync(output), false);
    assert.equal(git(['rev-parse', 'HEAD']), head);
    assert.equal(git(['count-objects', '-v']), objects);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
