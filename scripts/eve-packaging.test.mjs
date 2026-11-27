import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const manifest = JSON.parse(await readFile(new URL('../patches/eve-node-esm-compat.json', import.meta.url), 'utf8'));
const sdk = dirname(require.resolve('eve/package.json'));
const { createNodeEsmCompatBannerPlugin } = await import(pathToFileURL(join(sdk, manifest.files[0].path)).href);

test('installed packaging module is the reviewed upstream replacement on the pinned SDK', async () => {
  assert.equal(require('eve/package.json').version, '0.66.3');
  const digest = createHash('sha256').update(await readFile(join(sdk, manifest.files[0].path))).digest('hex');
  assert.equal(digest, manifest.patchedSha256);
});

test('vendor suffixes and ordinary Unicode escapes do not trigger full-chunk AST parsing', async () => {
  const code = String.raw`const __filename$1 = 'vendor-file', __dirname$1 = 'vendor-dir', require$1 = 'vendor-require';
const label = 'caf\u00e9';
const instructions = 'Before a destructive call, require all three. Changes conflict in behavior, require another task.';
export const globals = { filename: __filename, dirname: __dirname, requireType: typeof require, label };`;
  const plugin = createNodeEsmCompatBannerPlugin({ includeRequire: true });
  const result = plugin.renderChunk.call({ parse() { throw Error('Unexpected full-chunk AST parse'); } }, code);
  const root = await realpath(await mkdtemp(join(tmpdir(), 'eve-banner-')));
  try {
    const file = join(root, 'runtime.mjs'); await writeFile(file, result.code);
    const { globals } = await import(pathToFileURL(file).href);
    assert.equal(globals.filename, file); assert.equal(globals.dirname, root); assert.equal(globals.requireType, 'function'); assert.equal(globals.label, 'café');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('real and escaped compatibility bindings still invoke the parser and are not redeclared', () => {
  for (const name of ['__filename', String.raw`__filen\u0061me`]) {
    const code = `const ${name} = 'existing';`;
    let parses = 0;
    const result = createNodeEsmCompatBannerPlugin().renderChunk.call({ parse() {
      parses++; return { body: [{ type: 'VariableDeclaration', declarations: [{ id: { type: 'Identifier', name: '__filename' } }] }] };
    } }, code);
    const banner = result.code.slice(0, -code.length);
    assert.equal(parses, 1); assert.ok(!banner.includes('const __filename =')); assert.ok(banner.includes('const __dirname ='));
  }
});

test('only the exact native AST conversion defect uses the validating JavaScript fallback', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'eve-banner-fallback-')));
  const plugin = createNodeEsmCompatBannerPlugin({includeRequire:true});
  const parse = () => {throw Error('Failed to convert rust `String` into napi `string`');};
  try {
    const code = `const __filename = 'retained', __dirname = 'retained-dir'; export const value = [__filename, __dirname, typeof require];`;
    const result = plugin.renderChunk.call({parse},code);
    const file = join(root,'fallback.mjs'); await writeFile(file,result.code);
    assert.deepEqual((await import(pathToFileURL(file).href)).value,['retained','retained-dir','function']);
    assert.throws(()=>plugin.renderChunk.call({parse},'const __filename = ;'),SyntaxError);
    assert.throws(()=>plugin.renderChunk.call({parse(){throw Error('Unrelated parser failure');}},code),/Unrelated parser failure/);
  } finally {await rm(root,{recursive:true,force:true});}
});
