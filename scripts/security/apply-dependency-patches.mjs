import { createHash } from 'node:crypto';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
const check = process.argv.includes('--check');
const manifest = JSON.parse(await readFile(path.join(root, 'patches/sprintf-js-1.1.3.json'), 'utf8'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const replacement = await readFile(path.join(root, manifest.replacement));
if (hash(replacement) !== manifest.patchedSha256) throw new Error('Reviewed dependency patch digest mismatch');
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
const entries = Object.entries(lock.packages).filter(([key]) => key.endsWith('node_modules/sprintf-js'));
if (!entries.length) throw new Error('Expected sprintf-js dependency missing from lock; review patch retirement');
const writes = [];
for (const [key, dependency] of entries) {
  if (dependency.version !== manifest.version) throw new Error('sprintf-js identity changed; review patch retirement');
  const directory = await realpath(path.join(root, key));
  if (!directory.startsWith(`${root}${path.sep}`)) throw new Error('Dependency escaped workspace');
  const installed = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  if (installed.name !== manifest.package || installed.version !== manifest.version) throw new Error('Installed dependency identity mismatch');
  for (const file of manifest.files) {
    const target = await realpath(path.join(directory, file.path));
    if (!target.startsWith(`${directory}${path.sep}`)) throw new Error('Dependency file escaped package');
    const digest = hash(await readFile(target));
    if (digest === manifest.patchedSha256) continue;
    if (digest !== file.upstreamSha256) throw new Error(`Unexpected dependency bytes: ${key}/${file.path}`);
    if (check) throw new Error(`Unapplied security patch: ${key}/${file.path}`);
    writes.push(target);
  }
}
// Validate the entire installation before changing any file; subsequent checks fail closed on interruption.
for (const target of writes) await writeFile(target, replacement);
console.log(`sprintf-js security patch ${check ? 'verified' : 'applied'} (${entries.length} package copy; package version preserved)`);
