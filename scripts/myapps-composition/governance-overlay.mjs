import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const reviewedGovernance = JSON.parse(readFileSync(new URL('../../docs/myapps/phase3/governance-source.json', import.meta.url)));
const digest = (value) => value === null ? null : createHash('sha256').update(value).digest('hex');
const recordDigest = (entry) => entry === undefined ? null : digest(JSON.stringify(entry));

/** Copy exact reviewed canonical bytes, never regenerate fingerprints from output. */
export function applyGovernanceOverlay({integration, source, inventory, read, put}) {
  assert.equal(integration, reviewedGovernance.integration, 'Unreviewed governance integration');
  assert.equal(source, reviewedGovernance.source, 'Unreviewed governance source');
  const canonical = JSON.parse(read(source, 'apps/eve/scripts/executor-inventory.json'));
  const outputs = new Map();
  for (const [path, expected] of Object.entries(reviewedGovernance.files)) {
    assert.equal(digest(read(integration, path)), expected.integrationSha256, `Changed governance input: ${path}`);
    const bytes = read(source, path);
    assert.equal(digest(bytes), expected.sourceSha256, `Unreviewed canonical source bytes: ${path}`);
    outputs.set(path, bytes);
  }
  const entries = new Map();
  for (const [path, expected] of Object.entries(reviewedGovernance.inventory)) {
    const original = inventory.executors[path], entry = canonical.executors[path];
    assert.equal(recordDigest(original), expected.integrationRecordSha256, `Changed governance record: ${path}`);
    assert.equal(recordDigest(entry), expected.sourceRecordSha256, `Unreviewed canonical record: ${path}`);
    if (original) {
      assert.equal(entry.classification, original.classification, `Changed source classification: ${path}`);
      assert.equal(entry.disposition, original.disposition, `Changed source disposition: ${path}`);
    }
    const resultingSource = outputs.get('apps/eve/' + path) ?? read(integration, 'apps/eve/' + path);
    assert.equal(digest(resultingSource), expected.sourceSha256, `Canonical record does not match resulting source: ${path}`);
    assert.equal(entry.sha256, expected.sourceSha256);
    entries.set(path, structuredClone(entry));
  }
  // Validate the entire immutable bundle before changing any output or record.
  for (const [path, bytes] of outputs) put(path, bytes);
  for (const [path, entry] of entries) inventory.executors[path] = entry;
  return {source, files: [...outputs.keys()], inventorySources: [...entries.keys()]};
}
