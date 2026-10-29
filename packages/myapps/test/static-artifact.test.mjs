import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { StaticArtifactCandidate, STATIC_ARTIFACT_LIMITS } from '../src/static-artifact.ts';

const sha = value => createHash('sha256').update(value).digest('hex');
const pins = { sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), lockSha256: 'c'.repeat(64) };
function fixture() {
  const bytes = new Map([['dist/index.html', Buffer.from('<div id="root"></div>')], ['dist/assets/app.js', Buffer.from('/* public synthetic static build */')]]);
  const manifest = { schema: 'myeve.dashboard.build-inventory/v1', scope: 'BROWSER_BUILD_ONLY', ...pins, node: 'v24.18.1', files: [...bytes].map(([path, body]) => ({ path, bytes: body.length, sha256: sha(body) })), independentVerification: 'NOT_ESTABLISHED', signedResult: false, releaseQualified: false };
  return { bytes, manifest, load: async path => bytes.get(path) };
}

test('retains exact source/tree/lock-bound bytes without acceptance or installation authority', async () => {
  const f = fixture(); const candidate = await StaticArtifactCandidate.retain(f.manifest, pins, f.load);
  assert.deepEqual(candidate.source, pins); assert.equal(candidate.installed, false);
  assert.equal(candidate.independentVerification, 'NOT_ESTABLISHED');
  assert.match(candidate.inventoryDigest, /^sha256:[a-f0-9]{64}$/); assert.match(candidate.artifactDigest, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(Buffer.from(candidate.candidateBytes('dist/index.html')), f.bytes.get('dist/index.html'));
});

test('retained metadata and bytes cannot be changed through caller-owned references', async () => {
  const f = fixture(); const candidate = await StaticArtifactCandidate.retain(f.manifest, pins, f.load);
  f.bytes.get('dist/index.html').fill(0); f.manifest.files[0].path = 'dist/changed.html';
  const read = candidate.candidateBytes('dist/index.html'); read.fill(0);
  assert.equal(Buffer.from(candidate.candidateBytes('dist/index.html')).toString(), '<div id="root"></div>');
  assert.throws(() => { candidate.source.sourceCommit = 'd'.repeat(40); });
  assert.throws(() => { candidate.files[0].sha256 = 'd'.repeat(64); });
});

test('runtime callers cannot construct an artifact without validated byte retention', () => {
  const f = fixture();
  const unvalidated = new Map([['dist/index.html', Buffer.from('unverified replacement bytes')]]);
  for (const token of [undefined, Symbol('retained-static-artifact')]) {
    assert.throws(() => Reflect.construct(StaticArtifactCandidate, [f.manifest, unvalidated, token]), { code: 'APP_ARTIFACT_UNAVAILABLE' });
  }
});

test('snapshots accessor-backed inventory before validating any paths or loading bytes', async () => {
  const f = fixture(); let reads = 0; const requested = [];
  Object.defineProperty(f.manifest.files[1], 'path', { enumerable: true, get: () => ++reads <= 2 ? 'dist/assets/app.js' : '../outside.js' });
  await StaticArtifactCandidate.retain(f.manifest, pins, async path => { requested.push(path); return f.bytes.get(path) ?? f.bytes.get('dist/assets/app.js'); });
  assert.deepEqual(requested, ['dist/index.html', 'dist/assets/app.js']);
});

test('file ordering does not change the retained artifact digest', async () => {
  const f = fixture(); const first = await StaticArtifactCandidate.retain(f.manifest, pins, f.load);
  f.manifest.files.reverse(); const second = await StaticArtifactCandidate.retain(f.manifest, pins, f.load);
  assert.equal(first.artifactDigest, second.artifactDigest); assert.notEqual(first.inventoryDigest, second.inventoryDigest);
});

for (const key of Object.keys(pins)) test(`rejects a different trusted ${key} before reading bytes`, async () => {
  const f = fixture(); let reads = 0;
  await assert.rejects(StaticArtifactCandidate.retain(f.manifest, { ...pins, [key]: 'd'.repeat(pins[key].length) }, async () => { reads++; return new Uint8Array(); }), { code: 'APP_ARTIFACT_SOURCE_MISMATCH' });
  assert.equal(reads, 0);
});

for (const key of Object.keys(pins)) test(`compares the first snapshot of trusted ${key} before reading bytes`, async () => {
  const f = fixture(); let pinReads = 0; let byteReads = 0;
  const expected = { ...pins };
  Object.defineProperty(expected, key, { enumerable: true, get: () => ++pinReads === 1 ? 'd'.repeat(pins[key].length) : pins[key] });
  await assert.rejects(StaticArtifactCandidate.retain(f.manifest, expected, async path => { byteReads++; return f.bytes.get(path); }), { code: 'APP_ARTIFACT_SOURCE_MISMATCH' });
  assert.equal(pinReads, 1); assert.equal(byteReads, 0);
});

test('a failing trusted-source snapshot returns an opaque error without loading bytes', async () => {
  const f = fixture(); let reads = 0; const expected = { ...pins };
  Object.defineProperty(expected, 'sourceCommit', { enumerable: true, get: () => { throw new Error('private expected-source detail'); } });
  await assert.rejects(StaticArtifactCandidate.retain(f.manifest, expected, async () => { reads++; return new Uint8Array(); }), { code: 'APP_ARTIFACT_SOURCE_INVALID', message: 'APP_ARTIFACT_SOURCE_INVALID' });
  assert.equal(reads, 0);
});

for (const path of ['../index.html', 'dist/../secret', 'dist//app.js', 'dist/.env', 'dist/a/../../secret', 'dist/%2e%2e/secret', 'dist/a\\secret', 'dist/asset.js?token=x', '/dist/index.html', 'dist/asset.']) test(`rejects unsafe path ${path} before reading bytes`, async () => {
  const f = fixture(); f.manifest.files[1].path = path; let reads = 0;
  await assert.rejects(StaticArtifactCandidate.retain(f.manifest, pins, async () => { reads++; return new Uint8Array(); })); assert.equal(reads, 0);
});

test('rejects duplicate, case-alias and file/directory collisions', async () => {
  for (const path of ['dist/index.html', 'dist/INDEX.html', 'dist/index.html/child.js']) {
    const f = fixture(); f.manifest.files[1].path = path;
    await assert.rejects(StaticArtifactCandidate.retain(f.manifest, pins, f.load), { code: 'APP_ARTIFACT_PATH_CONFLICT' });
  }
});

test('rejects missing entry point, noncanonical metadata and fake verification flags', async () => {
  for (const alter of [m => m.files.shift(), m => { m.files[0].bytes = NaN; }, m => { m.ownerId = 'foreign-owner'; }, m => { m.signedResult = true; }, m => { m.releaseQualified = true; }, m => { m.independentVerification = 'PASS'; }]) {
    const f = fixture(); alter(f.manifest); await assert.rejects(StaticArtifactCandidate.retain(f.manifest, pins, f.load));
  }
});

test('rejects unsupported runtime and file, count and total size bounds before loading', async () => {
  for (const alter of [m => { m.node = 'v25.0.0'; }, m => { m.files[0].bytes = STATIC_ARTIFACT_LIMITS.fileBytes + 1; }, m => { m.files = Array.from({ length: STATIC_ARTIFACT_LIMITS.files + 1 }, (_, i) => ({ ...m.files[0], path: `dist/${i}.html` })); }, m => { m.files = ['index.html', 'a.js', 'b.js'].map(path => ({ path: `dist/${path}`, bytes: STATIC_ARTIFACT_LIMITS.fileBytes, sha256: 'a'.repeat(64) })); }]) {
    const f = fixture(); alter(f.manifest); let reads = 0;
    await assert.rejects(StaticArtifactCandidate.retain(f.manifest, pins, async () => { reads++; return new Uint8Array(); })); assert.equal(reads, 0);
  }
});

test('rejects modified or missing file bytes without producing a candidate', async () => {
  const f = fixture();
  for (const body of [Buffer.alloc(f.bytes.get('dist/index.html').length), new Uint8Array(0), 'not bytes', undefined]) await assert.rejects(StaticArtifactCandidate.retain(f.manifest, pins, async () => body), { code: 'APP_ARTIFACT_BYTES_MISMATCH' });
  await assert.rejects(StaticArtifactCandidate.retain(f.manifest, pins, async () => { throw new Error('private loader detail'); }), { code: 'APP_ARTIFACT_UNAVAILABLE', message: 'APP_ARTIFACT_UNAVAILABLE' });
});

test('only returns retained paths; it performs no decoding or disk fallback', async () => {
  const f = fixture(); const candidate = await StaticArtifactCandidate.retain(f.manifest, pins, f.load);
  for (const path of ['index.html', 'dist/INDEX.html', 'dist/assets/missing.js', 'dist/../secret']) assert.throws(() => candidate.candidateBytes(path), { code: 'APP_ARTIFACT_UNAVAILABLE' });
});
