import { validatePublicOutputContract } from "./public-output-contract.ts";
import { createHash } from "node:crypto";
import { z } from "zod";
import { shaSchema, type RepositoryProfile } from "./contract.ts";
import type { RepositorySnapshot } from "./github.ts";
import { WorkError } from "./types.ts";

export const GOLDEN_QUALIFICATION_REPOSITORY = "jaydubya818/myeve-golden-work-qual";
export const GOLDEN_SAFE_INTEGER_BASE_SHA = "0d61cf7cbad18831543ae93f118f18595d2a0be2";
export const GOLDEN_SAFE_INTEGER_BASE_BRANCH = "codex/quantity-safe-integer-contract";
export const GOLDEN_PUBLIC_CONTRACT_BASE_SHA = "7380d3324224a5660daa1556384c7a1a17d7d21e";
export const GOLDEN_QUALIFICATION_BASE_SHA = "db5d95cf3d1dadf04a118f38bd5b388a5a226c31";

const manifestPathSchema = z.string().min(1).max(240).refine(path =>
  /^[A-Za-z0-9_./-]+$/.test(path) && !path.startsWith("/") &&
  !path.split("/").some(part => !part || part === "." || part === ".." || part === ".git"),
"A regular repository path is required.");

export const approvedBaseSchema = z.object({
  sha: shaSchema,
  files: z.array(z.object({
    path: manifestPathSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()).min(1).max(200).refine(files =>
    new Set(files.map(file => file.path)).size === files.length,
  "Base manifest paths must be unique."),
}).strict();
export type ApprovedBase = z.infer<typeof approvedBaseSchema>;

export function manifestForSnapshot(snapshot: RepositorySnapshot): ApprovedBase {
  return approvedBaseSchema.parse({
    sha: snapshot.sha,
    files: Object.entries(snapshot.files).sort(([a], [b]) => a.localeCompare(b)).map(([path, content]) => ({
      path,
      sha256: createHash("sha256").update(content, "utf8").digest("hex"),
    })),
  });
}

/** Admission uses a separately pinned, reviewed manifest; it never learns its approval from the current GitHub response. */
export function preflightApprovedBase(profile: RepositoryProfile, approved: ApprovedBase, observed: RepositorySnapshot, issueNumber: number) {
  const expected = approvedBaseSchema.parse(approved);
  if(profile.publicOutputContract)validatePublicOutputContract(profile.publicOutputContract,observed.files,profile.checks);
  if (profile.repository === GOLDEN_QUALIFICATION_REPOSITORY) {
    const safeIntegerBase = expected.sha === GOLDEN_SAFE_INTEGER_BASE_SHA;
    const publicContractBase = safeIntegerBase || expected.sha === GOLDEN_PUBLIC_CONTRACT_BASE_SHA;
    if ((!publicContractBase && expected.sha !== GOLDEN_QUALIFICATION_BASE_SHA) ||
      (publicContractBase && !profile.publicOutputContract) || profile.baseBranch !== (safeIntegerBase ? GOLDEN_SAFE_INTEGER_BASE_BRANCH : publicContractBase ? "codex/private-alpha-release" : "main") || issueNumber !== 1 ||
      profile.allowedPaths.length !== 1 || profile.allowedPaths[0] !== "quantity.mjs" ||
      !profile.requiredCI.includes("quantity-ci") || !profile.reviewerLogins.includes("jaydubya818") ||
      expected.files.length !== (safeIntegerBase ? 7 : publicContractBase ? 6 : 5) || expected.files.some(file => file.path === "quantity.mjs") ||
      (safeIntegerBase && !expected.files.some(file => file.path === "test/quantity-contract.json")) ||
      ![".github/workflows/quantity-ci.yml", "package.json", "test/quantity.test.mjs"].every(path =>
        expected.files.some(file => file.path === path)))
      throw new WorkError("fixture_profile_changed", "The Golden Work fixture profile or approved base manifest changed; review it before admission.");
  }
  if (observed.sha !== expected.sha) {
    throw new WorkError("base_changed", "The repository base moved from the approved revision; review it before admission.");
  }
  const actual = manifestForSnapshot(observed);
  const pinnedFiles = [...expected.files].sort((a, b) => a.path.localeCompare(b.path));
  if (actual.files.length !== expected.files.length || actual.files.some((file, index) => {
    const pinned = pinnedFiles[index];
    return file.path !== pinned?.path || file.sha256 !== pinned.sha256;
  })) {
    throw new WorkError("base_manifest_changed", "The repository base files differ from the approved manifest; review them before admission.");
  }
}
