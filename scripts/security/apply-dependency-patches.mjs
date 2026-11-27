import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath, writeFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const hash = value => createHash('sha256').update(value).digest('hex');
export async function applyDependencyPatches({
  root: requestedRoot = fileURLToPath(new URL('../../', import.meta.url)),
  check = false,
} = {}) {
  const root = await realpath(requestedRoot);
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  const writes = [], summaries = [];
  for (const name of ['sprintf-js-1.1.3.json', 'eve-node-esm-compat.json']) {
    const manifest = JSON.parse(await readFile(path.join(root, 'patches', name), 'utf8'));
    const replacement = await readFile(path.join(root, manifest.replacement));
    if (hash(replacement) !== manifest.patchedSha256) throw new Error('Reviewed dependency patch digest mismatch');
    const entries = Object.entries(lock.packages).filter(([key]) => key.endsWith(`node_modules/${manifest.package}`));
    if (!entries.length) throw new Error(`Expected ${manifest.package} dependency missing from lock; review patch retirement`);
    for (const [key, dependency] of entries) {
      if (dependency.version !== manifest.version) throw new Error(`${manifest.package} identity changed; review patch retirement`);
      const directory = await realpath(path.join(root, key));
      if (!directory.startsWith(`${root}${path.sep}`)) throw new Error('Dependency escaped workspace');
      const installed = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
      if (installed.name !== manifest.package || installed.version !== manifest.version) throw new Error('Installed dependency identity mismatch');
      if (manifest.parserDependency) {
        const parser = manifest.parserDependency;
        const parserFile = await realpath(createRequire(path.join(directory,'package.json')).resolve(`${parser.package}/package.json`));
        if (!parserFile.startsWith(`${root}${path.sep}`)) throw new Error('Parser dependency escaped workspace');
        const identity = JSON.parse(await readFile(parserFile,'utf8'));
        if(identity.name !== parser.package || identity.version !== parser.version) throw new Error('Packaging parser identity mismatch');
      }
      for (const file of manifest.files) {
        const target = await realpath(path.join(directory, file.path));
        if (!target.startsWith(`${directory}${path.sep}`)) throw new Error('Dependency file escaped package');
        const digest = hash(await readFile(target));
        if (digest === manifest.patchedSha256) continue;
        if (digest !== file.upstreamSha256) throw new Error(`Unexpected dependency bytes: ${key}/${file.path}`);
        if (check) throw new Error(`Unapplied ${manifest.kind ?? 'security'} patch: ${key}/${file.path}`);
        writes.push({ target, replacement });
      }
    }
    summaries.push(`${manifest.package} ${manifest.kind ?? 'security'} patch ${check ? 'verified' : 'applied'} (${entries.length} package copy; package version preserved)`);
  }
  // Validate every package before writing; replacements are atomic. A later
  // --check also fails closed if installation stopped between files.
  for (const { target, replacement } of writes) {
    const temporary = `${target}.patch-${randomUUID()}`;
    try { await writeFile(temporary, replacement, { flag: 'wx' }); await rename(temporary, target); }
    finally { await rm(temporary, { force: true }); }
  }
  return summaries;
}

const main = process.argv[1] && await realpath(process.argv[1]).then(file => pathToFileURL(file).href === import.meta.url).catch(() => false);
if (main) {
  for (const summary of await applyDependencyPatches({ check: process.argv.includes('--check') })) console.log(summary);
}
