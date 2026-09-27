import { FixtureDestination } from '../../lib/capsules/fixture-store.ts';
import { fixtureCandidates } from '../../lib/capsules/fixtures.ts';
import { canonicalJson, exportCapsule, exportPreview } from '../../lib/capsules/format.ts';
import { prepareImport, previewImport } from '../../lib/capsules/import.ts';
const [path, phase] = process.argv.slice(2);
const source = fixtureCandidates();
const selectedIds = source.map(c => c.item.id);
const ownerRef = source[0].policy.ownerRef;
if (phase === 'generation') process.kill(process.pid, 'SIGKILL');
const review = exportPreview(source, selectedIds, ownerRef);
if (phase === 'manifest') process.kill(process.pid, 'SIGKILL');
const capsule = exportCapsule({ candidates: source, selectedIds, ownerRef, eveRef: 'sofie-a', reviewedDigest: review.reviewDigest });
if (phase === 'finalization') process.kill(process.pid, 'SIGKILL');
const adapter = new FixtureDestination(path, undefined, reached => { if (reached === phase) process.kill(process.pid, 'SIGKILL'); });
if (phase === 'conflict_resolution') {
  const existing = structuredClone(source[0].item);
  existing.text = 'Newer destination preference'; existing.version = '2.0.0';
  adapter.seedCurrent([existing]);
}
const destination = await adapter.snapshot();
const raw = canonicalJson(capsule);
const preview = previewImport(raw, destination);
if (phase === 'preview' || phase === 'conflict_resolution') process.kill(process.pid, 'SIGKILL');
const batch = prepareImport(raw, destination, preview.reviewDigest, preview.items.map(row => ({ id: row.item.id, choice: 'include' })));
await adapter.commit(batch);
adapter.close();
