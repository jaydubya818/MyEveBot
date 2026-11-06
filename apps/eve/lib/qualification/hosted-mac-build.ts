import { createHash } from "node:crypto";
import { StaticArtifactCandidate, type StaticSourcePins } from "../../../../packages/myapps/src/static-artifact.ts";
import { verifyStaticBuildClaim, type StaticBuildBinding } from "../../../../packages/myapps/src/static-build-claim.ts";
import { prepareAuthenticatedLocalFactoryInputV4 } from "../engineering/factory-authenticated-result.ts";
import type { MailboxDb } from "../engineering/factory-mailbox.ts";
import { bareSha256, DeliveryObservationError, observeServedDelivery, type RetainedBuild } from "./delivery-observer.ts";
import type { RetainedFactoryAdmission } from "./factory-live-port.ts";
import { hostedBinding, type HostedProfile } from "./hosted-profile.ts";
import { PREVIEW_LIMITS, PreviewRefused, previewBlobKey, readPreview, servePreviewFile, type PreviewBlobStore } from "./hosted-preview.ts";
import { canonical } from "../engineering/factory-producer-protocol.ts";
import { absenceAuthenticationSha256 } from "./rollback.ts";
import { StaticBuildRefused } from "./static-build.ts";
import { macBuildAuthority, type MacBuildAuthority } from "./hosted-mac-job.ts";
import type { MyAppsPort } from "./wiring.ts";

/**
 * Hosted MyApps port: hosted MyEve NEVER builds (no Docker, no git, no build signer on Vercel). The static build runs on the owner's Mac.
 *
 *  1. retainBuild(candidate) records the accepted stage-3 candidate and the EXPECTED build binding hosted derives from its own retained,
 *     authenticated stage-3 admission (REQUESTED). Until the Mac has delivered a verified build it refuses with QDEV_HOSTED_BUILD_PENDING (the
 *     journey halts before anything is accepted and resumes on the next run; nothing is charged or resent).
 *  2. The Mac (scripts/private-beta/hosted-mac-worker.ts, poller credential) lists pending builds, builds in its pinned container, signs the
 *     build claim with its Mac-only issuer key, stages the exact bytes to its local verifier, and uploads inventory + claim + bytes.
 *  3. Hosted re-retains the bytes from its private store and verifies the claim against the expected binding and the PINNED public issuer
 *     (verifyStaticBuildClaim) before the build is VERIFIED; retainBuild re-does both checks before returning the artifact digest.
 *  4. The verifier evaluates through the mailbox (target verifier). After a PASS the Mac uploads the private preview (hosted-preview.ts).
 *  5. observe(candidate) re-derives the artifact identity from the bytes served by the hosted private preview route (observeServedDelivery
 *     over servePreviewFile: verdict, manifest and file sha256 re-verified) - the same delivery contract the owner-local journey uses.
 */
type Candidate = { commit: string; tree: string };
type InventoryFile = { path: string; bytes: number; sha256: string };
/** v2: carries the Factory authority the Mac verifies before it runs anything (hosted-mac-job.ts) and the protected specification the preview binds. */
export type MacBuildRequest = { schema: "myeve.hosted-mac-build-request/v2"; candidate: Candidate; binding: StaticBuildBinding;
  projectSha256: string; sourceSha256: string; protectedSpecificationSha256: string; appId: string; authority: MacBuildAuthority };
export type MacBuildSubmission = { schema: "myeve.hosted-mac-build-upload/v1"; candidate: Candidate; inventory: { files: InventoryFile[] } & Record<string, unknown>;
  lockSha256: string; claim: string };
export type MacBuildRow = { request: MacBuildRequest; state: "REQUESTED" | "UPLOADING" | "VERIFIED"; submission: MacBuildSubmission | null; artifactSha256: string | null };
const COMMIT = /^[a-f0-9]{40}$/, HEX = /^[a-f0-9]{64}$/;
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const refuse = (code: string, status = 409): never => { throw new PreviewRefused(code, status); };
const json = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
export const candidateKey = (c: Candidate) => `${c.commit}.${c.tree}`;
export function parseCandidateKey(key: string): Candidate | null {
  const m = /^([a-f0-9]{40})\.([a-f0-9]{40})$/.exec(key ?? "");
  return m ? { commit: m[1], tree: m[2] } : null;
}

/** The expected build binding for the accepted stage-3 candidate: the same formula as the owner-local `candidateStaticBuildSource.binding`. */
export function hostedBuildBinding(profile: HostedProfile, admission: RetainedFactoryAdmission, candidate: Candidate): StaticBuildBinding {
  const b = prepareAuthenticatedLocalFactoryInputV4(admission.binding);
  if (admission.request.requestId !== b.requestId || !Number.isFinite(Date.parse(admission.request.deadline))) return refuse("QDEV_ASSEMBLY_BINDING");
  return { ownerId: profile.ownerId, agentId: b.agentId, appId: profile.build.appId, workId: b.workId, workVersion: b.workVersion, workGeneration: b.workGeneration,
    requestId: b.requestId, runId: b.runId, factoryId: b.factoryId, factoryVersion: b.factoryVersion, sourceDigest: b.sourceDigest,
    configurationDigest: b.configurationDigest, inputCommit: b.inputCommit, inputTree: b.inputTree, candidateCommit: candidate.commit,
    candidateTree: candidate.tree, lockSha256: profile.build.lockSha256, buildProfileDigest: profile.build.buildProfileDigest,
    deadline: new Date(admission.request.deadline).toISOString() };
}

export async function readMacBuild(db: MailboxDb, profile: HostedProfile, candidate: Candidate): Promise<MacBuildRow | null> {
  const binding = hostedBinding(profile);
  const [row] = await db.query(`SELECT request, state, submission, artifact_sha256 FROM hosted_mac_builds
    WHERE installation_id=$1 AND owner_id=$2 AND candidate_commit=$3 AND candidate_tree=$4`, [binding.installationId, binding.ownerId, candidate.commit, candidate.tree]);
  return row ? { request: json(row.request), state: row.state as MacBuildRow["state"], submission: row.submission ? json(row.submission) : null,
    artifactSha256: row.artifact_sha256 ? String(row.artifact_sha256) : null } : null;
}

/** Hosted: record (idempotently) the build the journey needs. A different expected binding for the same candidate is refused. */
export async function requestMacBuild(db: MailboxDb, profile: HostedProfile, request: MacBuildRequest): Promise<MacBuildRow> {
  const binding = hostedBinding(profile), c = request.candidate;
  if (!COMMIT.test(c.commit) || !COMMIT.test(c.tree)) return refuse("QDEV_HOSTED_BUILD_CANDIDATE", 400);
  await db.query(`INSERT INTO hosted_mac_builds(installation_id,owner_id,candidate_commit,candidate_tree,request,state) VALUES($1,$2,$3,$4,$5::jsonb,'REQUESTED')
    ON CONFLICT (installation_id, candidate_commit, candidate_tree) DO NOTHING`, [binding.installationId, binding.ownerId, c.commit, c.tree, JSON.stringify(request)]);
  const row = await readMacBuild(db, profile, c);
  if (!row || canonical(row.request) !== canonical(request)) return refuse("QDEV_HOSTED_BUILD_REQUEST_CONFLICT");
  return row;
}

/** Mac (poller credential): every build of this installation that still needs work, with its preview state. */
export async function pendingMacBuilds(db: MailboxDb, profile: HostedProfile) {
  const binding = hostedBinding(profile);
  const rows = await db.query(`SELECT b.request, b.state, b.artifact_sha256, p.state AS preview_state FROM hosted_mac_builds b
    LEFT JOIN hosted_verified_previews p ON p.installation_id=b.installation_id AND p.artifact_sha256=b.artifact_sha256
    WHERE b.installation_id=$1 AND b.owner_id=$2 AND (b.state<>'VERIFIED' OR p.state IS DISTINCT FROM 'READY') ORDER BY b.created_at LIMIT 8`,
    [binding.installationId, binding.ownerId]);
  return rows.map(r => ({ request: json<MacBuildRequest>(r.request), state: String(r.state), artifactSha256: r.artifact_sha256 ? String(r.artifact_sha256) : null,
    previewReady: r.preview_state === "READY" }));
}

function claimedArtifact(claim: unknown): string {
  try {
    const envelope = JSON.parse(String(claim)) as { payload?: { artifactDigest?: unknown } };
    return bareSha256(String(envelope.payload?.artifactDigest));
  } catch { return refuse("QDEV_HOSTED_BUILD_CLAIM", 400); }
}
function inventoryFiles(inventory: unknown): InventoryFile[] {
  const files = (inventory as { files?: unknown })?.files;
  if (!Array.isArray(files) || files.length < 1 || files.length > PREVIEW_LIMITS.files) return refuse("QDEV_HOSTED_BUILD_INVENTORY", 400);
  let total = 0;
  for (const f of files as InventoryFile[]) {
    if (!f || typeof f.path !== "string" || !f.path.startsWith("dist/") || !HEX.test(f.sha256) || !Number.isSafeInteger(f.bytes) || f.bytes < 0 || f.bytes > PREVIEW_LIMITS.fileBytes)
      return refuse("QDEV_HOSTED_BUILD_INVENTORY", 400);
    total += f.bytes;
  }
  if (total > PREVIEW_LIMITS.totalBytes) return refuse("QDEV_HOSTED_BUILD_INVENTORY", 413);
  return files as InventoryFile[];
}

/** Mac step 1: register the build of a REQUESTED candidate (inventory, lock pin, signed claim). Returns the files still to upload. */
export async function beginMacBuildUpload(db: MailboxDb, profile: HostedProfile, blob: PreviewBlobStore, input: unknown) {
  const body = input as MacBuildSubmission;
  if (!body || typeof body !== "object" || Object.keys(body).sort().join(",") !== "candidate,claim,inventory,lockSha256,schema" || body.schema !== "myeve.hosted-mac-build-upload/v1"
    || typeof body.claim !== "string" || body.claim.length > 8192 || !HEX.test(body.lockSha256)) return refuse("QDEV_HOSTED_BUILD_UPLOAD_SHAPE", 400);
  const row = await readMacBuild(db, profile, body.candidate ?? {} as Candidate);
  if (!row) return refuse("QDEV_HOSTED_BUILD_NOT_REQUESTED", 404);
  if (row.state === "VERIFIED") return { candidate: row.request.candidate, state: row.state, artifactSha256: row.artifactSha256, missing: [] as string[] };
  if (body.lockSha256 !== row.request.binding.lockSha256) return refuse("QDEV_HOSTED_BUILD_LOCK", 422);
  const files = inventoryFiles(body.inventory), artifactSha256 = claimedArtifact(body.claim), binding = hostedBinding(profile);
  await db.query(`UPDATE hosted_mac_builds SET state='UPLOADING', submission=$5::jsonb WHERE installation_id=$1 AND owner_id=$2 AND candidate_commit=$3 AND candidate_tree=$4 AND state<>'VERIFIED'`,
    [binding.installationId, binding.ownerId, row.request.candidate.commit, row.request.candidate.tree, JSON.stringify(body)]);
  const missing: string[] = [];
  for (const f of files) if (!await blob.get(previewBlobKey(binding, artifactSha256, f.sha256))) missing.push(f.path);
  return { candidate: row.request.candidate, state: "UPLOADING", artifactSha256, missing };
}

/** Mac step 2: one inventoried file; length and sha256 must match the submitted inventory. Stored content-addressed in the private store. */
export async function putMacBuildFile(db: MailboxDb, profile: HostedProfile, blob: PreviewBlobStore, candidate: Candidate, path: string, bytes: Uint8Array) {
  const row = await readMacBuild(db, profile, candidate);
  if (!row || row.state !== "UPLOADING" || !row.submission) return refuse("QDEV_HOSTED_BUILD_NOT_UPLOADING", 404);
  const entry = inventoryFiles(row.submission.inventory).find(f => f.path === path);
  if (!entry) return refuse("QDEV_HOSTED_BUILD_PATH", 404);
  if (bytes.length !== entry.bytes || sha(bytes) !== entry.sha256) return refuse("QDEV_HOSTED_BUILD_FILE_INTEGRITY", 422);
  await blob.put(previewBlobKey(hostedBinding(profile), claimedArtifact(row.submission.claim), entry.sha256), bytes);
  return { path, sha256: entry.sha256 };
}

/** Re-retains the exact bytes from the private store and verifies the Mac's claim against the hosted EXPECTED binding and the pinned issuer. */
async function retainSubmitted(profile: HostedProfile, blob: PreviewBlobStore, row: MacBuildRow, now?: number): Promise<RetainedBuild> {
  const submission = row.submission!, c = row.request.candidate, artifactSha256 = claimedArtifact(submission.claim), binding = hostedBinding(profile);
  const pins: StaticSourcePins = { sourceCommit: c.commit, sourceTree: c.tree, lockSha256: submission.lockSha256 };
  const files = inventoryFiles(submission.inventory);
  const load = async (path: string) => {
    const entry = files.find(f => f.path === path), bytes = entry ? await blob.get(previewBlobKey(binding, artifactSha256, entry.sha256)) : null;
    if (!bytes) throw new Error("missing");
    return bytes;
  };
  let candidate: StaticArtifactCandidate;
  try { candidate = await StaticArtifactCandidate.retain(submission.inventory, pins, load); } catch { return refuse("QDEV_HOSTED_BUILD_INCOMPLETE"); }
  try { verifyStaticBuildClaim(submission.claim, candidate, row.request.binding, profile.build.issuer, now); } catch { return refuse("QDEV_HOSTED_BUILD_CLAIM_REJECTED", 422); }
  if (bareSha256(candidate.artifactDigest) !== artifactSha256) return refuse("QDEV_HOSTED_BUILD_CLAIM_REJECTED", 422);
  return { inventory: submission.inventory, pins, candidate };
}

/** Mac step 3: hosted re-verifies everything; only then the build is VERIFIED (the journey can use it). */
export async function completeMacBuildUpload(db: MailboxDb, profile: HostedProfile, blob: PreviewBlobStore, candidate: Candidate, now?: number) {
  const row = await readMacBuild(db, profile, candidate);
  if (!row || !row.submission) return refuse("QDEV_HOSTED_BUILD_NOT_UPLOADING", 404);
  if (row.state === "VERIFIED") return { candidate, state: "VERIFIED" as const, artifactSha256: row.artifactSha256! };
  const retained = await retainSubmitted(profile, blob, row, now), artifactSha256 = bareSha256(retained.candidate.artifactDigest), binding = hostedBinding(profile);
  await db.query(`UPDATE hosted_mac_builds SET state='VERIFIED', artifact_sha256=$5, verified_at=now() WHERE installation_id=$1 AND owner_id=$2 AND candidate_commit=$3 AND candidate_tree=$4 AND state='UPLOADING'`,
    [binding.installationId, binding.ownerId, candidate.commit, candidate.tree, artifactSha256]);
  return { candidate, state: "VERIFIED" as const, artifactSha256 };
}

export type HostedMacMyAppsConfig = {
  db: MailboxDb; profile: HostedProfile; blob: PreviewBlobStore;
  /** The retained stage-3 admission (hosted's own authenticated custody) from which the expected build binding is derived. */
  retained(stage: 3): Promise<RetainedFactoryAdmission>;
  /** Test seam only (labelled synthetic tests): supplies the expected binding instead of deriving it from a retained V4 admission. */
  bindingFor?(candidate: Candidate): Promise<StaticBuildBinding>;
  project: { projectSha256: string; sourceSha256: string; protectedSpecificationSha256: string; environment: string };
  /** The accepted stage-3 signed Factory Result (a readback; the journey has already authenticated it). Its manifest and signature (no artifact
   *  bytes) travel with the job so the Mac verifies the Factory authority itself. Absent: bound later by composeRuntimePorts (bindStageResult). */
  stageResult?(): Promise<unknown>;
  now?: () => number;
};
/** MyApps port for the hosted profile (see the module comment). It owns no build, no signer and no publication authority. */
export class HostedMacMyAppsPort implements MyAppsPort {
  private retainedBuild: (RetainedBuild & Candidate) | null = null;
  private stageResult: (() => Promise<unknown>) | null;
  constructor(private readonly c: HostedMacMyAppsConfig) { this.stageResult = c.stageResult ?? null; }
  /** The Mac build issuer: a producer key that the verifier key set must be disjoint from (runtime-ports adds it to the exclusions). */
  get issuer(): { keyId: string; publicKeyPem: string } { return { keyId: this.c.profile.build.issuer.keyId, publicKeyPem: this.c.profile.build.issuer.publicKeyPem }; }
  bindStageResult(read: () => Promise<unknown>): void { if (!this.stageResult) this.stageResult = read; }

  async retainBuild(candidate: Candidate): Promise<{ buildArtifactSha256: string }> {
    const binding = this.c.bindingFor ? await this.c.bindingFor(candidate) : hostedBuildBinding(this.c.profile, await this.c.retained(3), candidate);
    if (!this.stageResult) throw new StaticBuildRefused("QDEV_HOSTED_BUILD_AUTHORITY");
    let authority: MacBuildAuthority;
    try { authority = macBuildAuthority(this.c.profile, await this.stageResult()); } catch { throw new StaticBuildRefused("QDEV_HOSTED_BUILD_AUTHORITY"); }
    const row = await requestMacBuild(this.c.db, this.c.profile, { schema: "myeve.hosted-mac-build-request/v2", candidate: { commit: candidate.commit, tree: candidate.tree },
      binding, projectSha256: this.c.project.projectSha256, sourceSha256: this.c.project.sourceSha256,
      protectedSpecificationSha256: this.c.project.protectedSpecificationSha256, appId: this.c.profile.build.appId, authority });
    if (row.state !== "VERIFIED") throw new StaticBuildRefused("QDEV_HOSTED_BUILD_PENDING");
    const retained = await retainSubmitted(this.c.profile, this.c.blob, row, this.c.now?.());
    if (bareSha256(retained.candidate.artifactDigest) !== row.artifactSha256) throw new StaticBuildRefused("QDEV_HOSTED_BUILD_CHANGED");
    this.retainedBuild = { ...retained, commit: candidate.commit, tree: candidate.tree };
    return { buildArtifactSha256: row.artifactSha256! };
  }

  async observe(candidate: Candidate): Promise<unknown> {
    const r = this.retainedBuild;
    if (!r || r.commit !== candidate.commit || r.tree !== candidate.tree) throw new StaticBuildRefused("QDEV_BUILD_NOT_RETAINED");
    const { db, profile, blob, project } = this.c, binding = hostedBinding(profile), hex = bareSha256(r.candidate.artifactDigest);
    const preview = await readPreview(db, binding, hex);
    if (!preview || preview.state !== "READY") throw new DeliveryObservationError("QDEV_HOSTED_PREVIEW_PENDING");
    const v = preview.verdict.verdict;
    if (v.candidateCommit !== candidate.commit || v.candidateTree !== candidate.tree || v.projectSha256 !== project.projectSha256 || v.sourceSha256 !== project.sourceSha256
      || v.protectedSpecificationSha256 !== project.protectedSpecificationSha256)
      throw new DeliveryObservationError("QDEV_HOSTED_PREVIEW_BINDING");
    const [prior] = await db.query(`SELECT artifact_sha256 FROM hosted_verified_previews WHERE installation_id=$1 AND owner_id=$2 AND state='READY' AND artifact_sha256<>$3
      AND ready_at <= (SELECT ready_at FROM hosted_verified_previews WHERE installation_id=$1 AND artifact_sha256=$3) ORDER BY ready_at DESC LIMIT 1`, [binding.installationId, binding.ownerId, hex]);
    const appId = profile.build.appId, absent = absenceAuthenticationSha256({ appId, ownerId: profile.ownerId, projectSha256: project.projectSha256,
      installation: { environment: project.environment, installationId: profile.installationId } });
    const priorHex = prior ? String(prior.artifact_sha256) : null;
    return observeServedDelivery({ enabled: true, environment: project.environment, servedOrigin: profile.servedOrigin, projectSha256: project.projectSha256,
      sourceSha256: project.sourceSha256, now: this.c.now ? () => new Date(this.c.now!()) : undefined,
      priorRevision: async () => priorHex ? { kind: "REVISION", id: `${appId}@preview:${priorHex.slice(0, 16)}`, sha256: priorHex } : { kind: "ABSENT", authenticationSha256: absent },
      restorePointId: async () => priorHex ? `myapps-restore:${appId}@preview:${priorHex.slice(0, 16)}` : "myapps-absent:" + absent.slice(0, 32),
      // Served bytes come from the hosted private preview handler itself (owner-scoped, verdict/manifest/file re-verified), never a public URL.
      fetcher: (async (input: RequestInfo | URL) => servePreviewFile(db, profile, blob, hex, new URL(String(input)).pathname.slice(1), "GET", this.c.now?.())) as typeof fetch,
    }, candidate, r);
  }
}
