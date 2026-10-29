import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { verifySourceClosure } from '../src/alpha-tasks/source.ts';

// Git itself independently calculates the inert fixture's blob and tree IDs.
// No hooks, repository writes, candidate execution or network are involved.
function fixture() {
  const bytes = Buffer.from('export const value = "safe";\n');
  const hash = (kind, content) => execFileSync('/usr/bin/git', ['hash-object', '--stdin', '-t', kind], { input: content, encoding: 'utf8', cwd: tmpdir(), env: { PATH: '/usr/bin:/bin' } }).trim();
  const blob = hash('blob', bytes);
  const tree = hash('tree', Buffer.concat([Buffer.from('100644 safe.js\0'), Buffer.from(blob, 'hex')]));
  const file = { path: 'safe.js', mode: '100644', base64: bytes.toString('base64') };
  return { original: { ...file }, closure: { format: 'myapps.source-closure.v1', tree, files: [file] } };
}

for (const [field, beforeReads, substituted] of [
  ['base64', 4, Buffer.from('export const value = "substituted";\n').toString('base64')],
  ['path', 4, 'renamed.js'],
  ['mode', 2, '100755'],
]) test(`returned source closure preserves verified ${field} despite an accessor changing later`, () => {
  const f = fixture(); let reads = 0;
  Object.defineProperty(f.closure.files[0], field, { enumerable: true, get: () => ++reads <= beforeReads ? f.original[field] : substituted });
  const retained = verifySourceClosure(f.closure, f.closure.tree);
  assert.deepEqual(retained.files, [f.original]);
  assert.deepEqual(verifySourceClosure(retained, retained.tree), retained);
});
