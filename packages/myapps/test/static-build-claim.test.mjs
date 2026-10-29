import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { canonical } from '../src/contracts.ts';
import { StaticArtifactCandidate } from '../src/static-artifact.ts';
import { verifyStaticBuildClaim, STATIC_BUILD_CLAIM_DOMAIN, STATIC_BUILD_CLAIM_MAX_BYTES } from '../src/static-build-claim.ts';

const sha = value => createHash('sha256').update(value).digest('hex');
const now = Date.parse('2026-10-29T12:00:00.000Z');
const iso = offset => new Date(now + offset).toISOString();
const pair = generateKeyPairSync('ed25519'), otherPair = generateKeyPairSync('ed25519');
const publicPem = key => key.export({ type: 'spki', format: 'pem' });
const publicPin = key => sha(key.export({ type: 'spki', format: 'der' }));
const deny = action => assert.throws(action, { code: 'APP_BUILD_CLAIM_INVALID', message: 'APP_BUILD_CLAIM_INVALID' });

async function fixture() {
  const source = { sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), lockSha256: 'c'.repeat(64) };
  const files = new Map([['dist/index.html', Buffer.from('<div>Public synthetic build</div>')]]);
  const manifest = { schema: 'myeve.dashboard.build-inventory/v1', scope: 'BROWSER_BUILD_ONLY', ...source, node: 'v24.18.1',
    files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha(bytes) })),
    independentVerification: 'NOT_ESTABLISHED', signedResult: false, releaseQualified: false };
  const candidate = await StaticArtifactCandidate.retain(manifest, source, async path => files.get(path));
  const binding = { ownerId: 'fixture-owner', agentId: 'fixture-agent', appId: 'fixture-app', workId: 'fixture-work',
    workVersion: 1, workGeneration: 2, requestId: 'fixture-request', runId: 'fixture-run', factoryId: 'fixture-factory',
    sourceDigest: 'd'.repeat(64), configurationDigest: 'e'.repeat(64), inputCommit: 'f'.repeat(40), inputTree: '1'.repeat(40),
    candidateCommit: source.sourceCommit, candidateTree: source.sourceTree, lockSha256: source.lockSha256,
    buildProfileDigest: '2'.repeat(64), deadline: iso(60000) };
  binding.factoryVersion = sha(canonical({ sourceDigest: binding.sourceDigest, configurationDigest: binding.configurationDigest }));
  const issuer = { keyId: 'fixture-build-key', purpose: 'STATIC_BUILD_PROVENANCE_V1', ownerId: binding.ownerId,
    factoryId: binding.factoryId, factoryVersion: binding.factoryVersion, buildProfileDigest: binding.buildProfileDigest,
    publicKeyPem: publicPem(pair.publicKey), spkiSha256: publicPin(pair.publicKey), notBefore: iso(-60000), notAfter: iso(60000), revoked: false };
  const payload = { schema: 'myeve.static-build-claim/v1', keyId: issuer.keyId, binding: { ...binding },
    inventoryDigest: candidate.inventoryDigest, artifactDigest: candidate.artifactDigest, builtAt: iso(-1000) };
  const encode = (value = payload, domain = STATIC_BUILD_CLAIM_DOMAIN, key = pair.privateKey) => canonical({
    payload: value, signature: sign(null, Buffer.from(domain + canonical(value)), key).toString('base64url'),
  });
  const read = (encoded = encode(), object = candidate, expected = binding, policy = issuer, at = now) =>
    verifyStaticBuildClaim(encoded, object, expected, policy, at);
  return { source, files, manifest, candidate, binding, issuer, payload, encode, read };
}

test('matches a configured signature to exact retained bytes without creating acceptance or installation authority', async () => {
  const f = await fixture(), out = f.read();
  assert.equal(out.provenance, 'SIGNATURE_MATCHED_CONFIGURED_KEY');
  assert.equal(out.claimDigest, 'sha256:' + sha(canonical(f.payload)));
  assert.deepEqual(out.binding, f.binding); assert.equal(out.artifactDigest, f.candidate.artifactDigest);
  assert.equal(out.independentVerification, 'NOT_ESTABLISHED');
  assert.equal(out.signedResult, false); assert.equal(out.releaseQualified, false); assert.equal(out.installed, false);
  assert(Object.isFrozen(out) && Object.isFrozen(out.binding));
  f.binding.ownerId = 'changed'; assert.equal(out.binding.ownerId, 'fixture-owner');
});

test('historical signature inspection cannot renew a deadline, key or Work authority', async () => {
  const f = await fixture(), first = f.read(), later = f.read(f.encode(), f.candidate, f.binding, f.issuer, now + 3600000);
  assert.equal(first.claimDigest, later.claimDigest); assert.equal(later.binding.deadline, f.binding.deadline);
  assert.equal(later.releaseQualified, false); assert.equal(later.installed, false);
  deny(() => f.read(f.encode(), f.candidate, f.binding, { ...f.issuer, revoked: true }, now + 3600000));
});

test('restart reconstruction revalidates byte retention and preserves the same claim identity', async () => {
  const f = await fixture(), encoded = f.encode(), first = f.read(encoded);
  const recovered = await StaticArtifactCandidate.retain(JSON.parse(JSON.stringify(f.manifest)), { ...f.source }, async path => Uint8Array.from(f.files.get(path)));
  const replay = f.read(encoded, recovered, JSON.parse(JSON.stringify(f.binding)), JSON.parse(JSON.stringify(f.issuer)), now + 2000);
  assert.equal(first.claimDigest, replay.claimDigest); assert.equal(first.artifactDigest, replay.artifactDigest);
  assert.equal(replay.independentVerification, 'NOT_ESTABLISHED'); assert.equal(replay.installed, false);
  deny(() => f.read(encoded, JSON.parse(JSON.stringify(f.candidate))));
});

for (const field of ['ownerId', 'agentId', 'appId', 'workId', 'workVersion', 'workGeneration', 'requestId', 'runId', 'factoryId',
  'factoryVersion', 'sourceDigest', 'configurationDigest', 'inputCommit', 'inputTree', 'candidateCommit', 'candidateTree', 'lockSha256', 'buildProfileDigest', 'deadline']) {
  test(`a validly signed different ${field} cannot attach to the expected binding`, async () => {
    const f = await fixture(), p = structuredClone(f.payload), old = p.binding[field];
    p.binding[field] = typeof old === 'number' ? old + 1 : field === 'deadline' ? iso(61000) : /^[a-f0-9]+$/.test(old) ? '9'.repeat(old.length) : 'foreign-' + old;
    if (['sourceDigest', 'configurationDigest'].includes(field)) p.binding.factoryVersion = sha(canonical({ sourceDigest: p.binding.sourceDigest, configurationDigest: p.binding.configurationDigest }));
    deny(() => f.read(f.encode(p)));
  });
}

for (const field of ['inventoryDigest', 'artifactDigest']) test(`a signature cannot substitute the retained ${field}`, async () => {
  const f = await fixture(), p = { ...f.payload, [field]: 'sha256:' + '0'.repeat(64) };
  deny(() => f.read(f.encode(p)));
});

test('a coherent signed binding still must match the actual retained candidate source', async () => {
  const f = await fixture(), p = structuredClone(f.payload); p.binding.candidateCommit = '7'.repeat(40);
  deny(() => f.read(f.encode(p), f.candidate, p.binding));
});

test('prototype-shaped objects and proxies cannot supply a retained byte candidate', async () => {
  const f = await fixture();
  for (const value of [{ ...f.candidate }, Object.create(StaticArtifactCandidate.prototype), new Proxy(f.candidate, {})]) deny(() => f.read(f.encode(), value));
});

for (const [field, value] of [['ownerId', 'other-owner'], ['factoryId', 'other-factory'], ['factoryVersion', '0'.repeat(64)],
  ['buildProfileDigest', '0'.repeat(64)], ['keyId', 'other-key'], ['purpose', 'INDEPENDENT_ACCEPTANCE'], ['spkiSha256', '0'.repeat(64)], ['revoked', true]]) {
  test(`configured issuer ${field} must match independently supplied scope and purpose`, async () => {
    const f = await fixture(); deny(() => f.read(f.encode(), f.candidate, f.binding, { ...f.issuer, [field]: value }));
  });
}

test('key substitution fails even when its SPKI pin and metadata are coherent', async () => {
  const f = await fixture(), issuer = { ...f.issuer, publicKeyPem: publicPem(otherPair.publicKey), spkiSha256: publicPin(otherPair.publicKey) };
  deny(() => f.read(f.encode(), f.candidate, f.binding, issuer));
});

test('private-key PEM and a different public-key algorithm are not accepted as issuer configuration', async () => {
  const f = await fixture(), ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  for (const policy of [
    { ...f.issuer, publicKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) },
    { ...f.issuer, publicKeyPem: publicPem(ec.publicKey), spkiSha256: publicPin(ec.publicKey) },
  ]) deny(() => f.read(f.encode(), f.candidate, f.binding, policy));
});

test('build time is bounded by key validity, the signed deadline and observation time', async () => {
  const f = await fixture();
  for (const builtAt of [iso(-60001), iso(60000), iso(61000), iso(1), 'invalid', '2026-02-31T00:00:00.000Z']) deny(() => f.read(f.encode({ ...f.payload, builtAt })));
  deny(() => f.read(f.encode(), f.candidate, f.binding, { ...f.issuer, notAfter: f.issuer.notBefore }));
  for (const at of [NaN, Infinity, -1, 0.5]) deny(() => f.read(f.encode(), f.candidate, f.binding, f.issuer, at));
});

test('another signature domain, modified signature and noncanonical base64url are refused', async () => {
  const f = await fixture(); deny(() => f.read(f.encode(f.payload, 'different-protocol\0')));
  const wire = JSON.parse(f.encode()); wire.signature = 'A'.repeat(86); deny(() => f.read(canonical(wire)));
  const original = JSON.parse(f.encode()), alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const last = alphabet.indexOf(original.signature.at(-1)); assert.equal(last % 16, 0);
  original.signature = original.signature.slice(0, -1) + alphabet[last + 1];
  deny(() => f.read(canonical(original)));
});

test('wire shape, canonical encoding and byte bounds cannot carry acceptance claims', async () => {
  const f = await fixture();
  for (const wire of ['', '{', ' '.repeat(STATIC_BUILD_CLAIM_MAX_BYTES + 1), f.encode() + '\n',
    canonical({ ...JSON.parse(f.encode()), accepted: true }), f.encode({ ...f.payload, independentVerification: 'PASS' })]) deny(() => f.read(wire));
  deny(() => f.read({ payload: f.payload, signature: 'A'.repeat(86) }));
});

test('trusted binding and issuer are snapshotted once; unreadable details remain opaque', async () => {
  const f = await fixture(); let bindingReads = 0, issuerReads = 0;
  const expected = { ...f.binding, get ownerId() { return ++bindingReads === 1 ? f.binding.ownerId : 'changed'; } };
  const issuer = { ...f.issuer, get spkiSha256() { return ++issuerReads === 1 ? f.issuer.spkiSha256 : '0'.repeat(64); } };
  assert.equal(f.read(f.encode(), f.candidate, expected, issuer).binding.ownerId, f.binding.ownerId);
  assert.equal(bindingReads, 1); assert.equal(issuerReads, 1);
  const unreadable = { ...f.issuer, get publicKeyPem() { throw new Error('private policy detail'); } };
  deny(() => f.read(f.encode(), f.candidate, f.binding, unreadable));
});
