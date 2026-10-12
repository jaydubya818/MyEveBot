import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
