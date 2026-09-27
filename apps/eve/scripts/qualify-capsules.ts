import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fixtureCandidates, freshDestination } from "../lib/capsules/fixtures";
import { byteSize, canonicalJson, digest, exportCapsule, exportPreview, inspectCapsule } from "../lib/capsules/format";
import { prepareImport, previewImport } from "../lib/capsules/import";
import { FixtureDestination } from "../lib/capsules/fixture-store";
import type { ExportCandidate } from "../lib/capsules/schema";

const output = resolve(process.argv[2] ?? "../../docs/verification/portable-sofie-capsules");
mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(tmpdir(), "capsule-evidence-"));
function build(candidates: ExportCandidate[]) {
  const ownerRef = candidates[0].policy.ownerRef; const selectedIds = candidates.map(c => c.item.id);
  return exportCapsule({ candidates, selectedIds, ownerRef, eveRef: "sofie-a", reviewedDigest: exportPreview(candidates, selectedIds, ownerRef).reviewDigest });
}
const performanceResults = [];
for (const [label, count, length] of [["small", 1, 100], ["medium", 25, 4000], ["maximum-1MiB", 62, 16384]] as const) {
  const candidates = Array.from({ length: count }, (_, index) => {
    const candidate = fixtureCandidates()[0]; candidate.item.id = `item-${index}`; candidate.item.key = `key-${index}`; candidate.item.text = "Owner project context. ".repeat(Math.ceil(length / 23)).slice(0, length); return candidate;
  });
  if (label === "maximum-1MiB") {
    const last = candidates.at(-1)!;
    let low = 1, high = 16384, best = 1;
    while (low <= high) {
      const length = Math.floor((low + high) / 2);
      last.item.text = "Readable context. ".repeat(length).slice(0, length);
      try { build(candidates); best = length; low = length + 1; }
      catch (error) { if (!(error instanceof Error) || !error.message.includes("1 MiB")) throw error; high = length - 1; }
    }
    last.item.text = "Readable context. ".repeat(best).slice(0, best);
  }
  const beforeMemory = process.memoryUsage().heapUsed; const start = performance.now(); const capsule = build(candidates); const exportMs = performance.now() - start;
  const raw = canonicalJson(capsule); const destination = new FixtureDestination(join(directory, `${label}.sqlite`));
  const importStart = performance.now(); const state = await destination.snapshot(); const preview = previewImport(raw, state);
  await destination.commit(prepareImport(raw, state, preview.reviewDigest, preview.items.map(row => ({ id: row.item.id, choice: "include" }))));
  const importMs = performance.now() - importStart; destination.close();
  performanceResults.push({ label, items: count, payloadBytes: byteSize(capsule), manifestBytes: byteSize(capsule.manifest), exportMs: Math.round(exportMs * 100) / 100, importMs: Math.round(importMs * 100) / 100, heapDeltaBytes: process.memoryUsage().heapUsed - beforeMemory });
}
const raw = canonicalJson(build(fixtureCandidates()));
const dbPath = join(directory, "benefit.sqlite");
let destination = new FixtureDestination(dbPath);
const requiredKeys = ["response-style", "project-convention", "meeting-day"];
const before = destination.retrieveForNewWork("project-sellerfi");
const state = await destination.snapshot(); const preview = previewImport(raw, state);
await destination.commit(prepareImport(raw, state, preview.reviewDigest, preview.items.map(row => ({ id: row.item.id, choice: "include" }))));
destination.close(); destination = new FixtureDestination(dbPath);
const after = destination.retrieveForNewWork("project-sellerfi");
const benefit = { method: "Deterministic scoped retrieval for a new Work fixture after process-independent reopen; not an LLM or live Work evaluation.", task: "Prepare the SellerFi project update with the owner's preferred format, UI conventions and planning day.", withoutCapsule: { contextKeysFound: requiredKeys.filter(key => before.some(r => r.item.key === key)).length, clarificationInputsNeeded: 3 }, withCapsule: { contextKeysFound: requiredKeys.filter(key => after.some(r => r.item.key === key)).length, clarificationInputsNeeded: requiredKeys.filter(key => !after.some(r => r.item.key === key)).length }, evidence: after.filter(r => requiredKeys.includes(r.item.key)).map(r => ({ key: r.item.key, text: r.item.text, provenance: r.provenance })) };
const counters: Record<string, number> = {};
const authorityFields = ["credentials", "sessions", "grants", "approvals", "activeWorkAuthority", "writerAuthority", "providerAuthority", "billingAuthority", "publicationAuthority"];
const importedState = await destination.snapshot();
for (const field of authorityFields) counters[`${field}Transferred`] = importedState.imported.filter(r => Object.hasOwn(r, field) || Object.hasOwn(r.item, field)).length;
let tamperedAccepted = 0;
for (const kind of ["memory", "skill", "file"]) { const capsule = JSON.parse(raw); capsule.items.find((i: { kind: string }) => i.kind === kind).text += " changed"; try { inspectCapsule(canonicalJson(capsule)); tamperedAccepted++; } catch {} }
const secrets = ["api_key=synthetic-secret", "Cookie: session=synthetic", "-----BEGIN PRIVATE KEY-----", "postgres://user:pass@localhost/test", "ghp_abcdefghijklm123456789", "vercel_token=synthetic", "relay_credential=synthetic", "one-time secret: 123456"];
let secretsExported = 0, secretsImported = 0;
for (const secret of secrets) {
  const candidates = fixtureCandidates(); candidates[0].item.text = secret;
  try { build(candidates); secretsExported++; } catch {}
  const capsule = JSON.parse(raw); capsule.items[0].text = secret; capsule.manifest.inventory = capsule.items.map((item: unknown) => ({ id: (item as { id: string }).id, digest: digest(item), bytes: byteSize(item) })); const { digest: _, ...body } = capsule; capsule.digest = digest(body);
  try { inspectCapsule(canonicalJson(capsule)); secretsImported++; } catch {}
}
let unauthorizedPrivateData = 0;
for (const classification of ["corporate", "third_party_private"] as const) { const candidates = fixtureCandidates(); candidates[0].policy.classification = classification; try { build(candidates); unauthorizedPrivateData++; } catch {} }
const report = { generatedAt: new Date().toISOString(), qualification: "local fixtures only", performance: performanceResults, benefit, counters: { ...counters, credentialsExported: secretsExported, credentialsImported: secretsImported, unauthorizedPrivateDataTransferred: unauthorizedPrivateData, tamperedCapsulesSilentlyAccepted: tamperedAccepted }, securityCorpus: { secretCases: secrets.length, tamperCases: 3, unauthorizedPolicyCases: 2 }, sourceAuthorityUsed: false, productionMemoryPromotion: false };
writeFileSync(join(output, "qualification.json"), JSON.stringify(report, null, 2) + "\n");
writeFileSync(join(output, "design-partner.memory-capsule.json"), raw + "\n");
destination.close(); rmSync(directory, { recursive: true, force: true });
if (Object.values(report.counters).some(value => value !== 0) || benefit.withCapsule.contextKeysFound !== 3) throw new Error("Capsule qualification failed");
console.log(JSON.stringify(report, null, 2));
