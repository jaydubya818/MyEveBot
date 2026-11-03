// Owner-operator helper (private beta, owner-local). Prints the identities a confirmed owner request derives to, so the owner (as operator) can issue
// exactly that cohort in the accounting database: charter id, member policy digest, project parent digests, plan digest and journey id.
//   npx tsx scripts/private-beta/derive-owner-request.ts <owner-local bundle JSON file> "<request text>"
// Pure: reads one local file, opens no database, sends nothing, prints no secret (the bundle holds none). The charter/member/project rows themselves are
// issued with the operator's own accounting credentials; the hash-pinned accounting SQL is not changed by this profile.
import { readFileSync } from "node:fs";
import { digest } from "../../lib/engineering/contract.ts";
import { qdevJourneyId } from "../../lib/qualification/custody-profile.ts";
import { ownerLocalBundleSchema } from "../../lib/qualification/host-source.ts";
import { deriveOwnerJourney } from "../../lib/qualification/owner-request.ts";

const [file, request] = process.argv.slice(2);
if (!file || !request) { console.error("usage: derive-owner-request.ts <bundle.json> \"<request>\""); process.exit(2); }
const bundle = ownerLocalBundleSchema.parse(JSON.parse(readFileSync(file, "utf8")));
const d = deriveOwnerJourney({ ownerId: bundle.ownerId, template: bundle.template, request });
console.log(JSON.stringify({
  requestSha256: d.requestSha256, planSha256: d.planSha256, confirm: `confirm ${d.planSha256.slice(0, 12)}`,
  charter: { id: d.policy.cohortId, journeyCeilingMicrousd: d.plan.stages.reduce((n, s) => n + s.workCeilingMicrousd, 0), maxWorks: d.plan.stages.length },
  member: { cohortId: d.policy.cohortId, slot: d.policy.slot, ownerId: d.policy.ownerId, policySha256: digest(d.policy) },
  project: { cohortId: d.policy.cohortId, ownerId: d.policy.ownerId, ...d.binding },
  journeyId: qdevJourneyId(bundle.ownerId, d.project, d.policy, d.plan),
  stageBindingIds: d.plan.stages.map(s => `${d.project.profile}:${d.planSha256}:stage:${s.stage}`),
}, null, 2));
