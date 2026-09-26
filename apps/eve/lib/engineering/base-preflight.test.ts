import { describe, expect, it } from "vitest";
import { fixture } from "../../test/engineering-fixtures.ts";
import {
  GOLDEN_QUALIFICATION_BASE_SHA,
  GOLDEN_QUALIFICATION_REPOSITORY,
  approvedBaseSchema,
  manifestForSnapshot,
  preflightApprovedBase,
} from "./base-preflight.ts";
import { runtimeSchema } from "./runtime.ts";

const files = {
  ".github/workflows/quantity-ci.yml": "name: quantity-ci\n",
  ".gitignore": "node_modules\n",
  "README.md": "# Golden Work\n",
  "package.json": '{"scripts":{"test":"node --test"}}\n',
  "test/quantity.test.mjs": "import test from 'node:test';\n",
};
const snapshot = { sha: GOLDEN_QUALIFICATION_BASE_SHA, files };
function profile() {
  return {
    ...fixture().contract.profile,
    repository: GOLDEN_QUALIFICATION_REPOSITORY,
    baseBranch: "main",
    allowedPaths: ["quantity.mjs"],
    requiredCI: ["quantity-ci"],
    reviewerLogins: ["jaydubya818"],
  };
}

describe("Golden Work approved-base preflight", () => {
  it("accepts the exact pinned revision and reviewed five-file manifest", () => {
    expect(preflightApprovedBase(profile(), manifestForSnapshot(snapshot), snapshot, 1)).toBeUndefined();
  });

  it("blocks a moved main branch before admission, even when the file list looks the same", () => {
    expect(() => preflightApprovedBase(profile(), manifestForSnapshot(snapshot),
      { ...snapshot, sha: "a".repeat(40) }, 1)).toThrow(/base moved/);
  });

  it("blocks changed bytes, extra files, and missing files at the pinned revision", () => {
    const approved = manifestForSnapshot(snapshot);
    for (const observed of [
      { ...snapshot, files: { ...files, "README.md": "# Different\n" } },
      { ...snapshot, files: { ...files, "unexpected.txt": "other" } },
      { ...snapshot, files: Object.fromEntries(Object.entries(files).filter(([path]) => path !== "README.md")) },
    ]) expect(() => preflightApprovedBase(profile(), approved, observed, 1)).toThrow(/base files differ/);
  });

  it("blocks a substituted approval and changes to the bounded fixture profile", () => {
    const approved = manifestForSnapshot(snapshot);
    expect(() => preflightApprovedBase(profile(), { ...approved, sha: "a".repeat(40) }, snapshot, 1)).toThrow(/fixture profile/);
    expect(() => preflightApprovedBase(profile(), approved, snapshot, 2)).toThrow(/fixture profile/);
    expect(() => preflightApprovedBase({ ...profile(), allowedPaths: ["other.mjs"] }, approved, snapshot, 1)).toThrow(/fixture profile/);
    expect(() => preflightApprovedBase({ ...profile(), requiredCI: ["other-ci"] }, approved, snapshot, 1)).toThrow(/fixture profile/);
  });

  it("rejects duplicate and unsafe manifest paths", () => {
    const approved = manifestForSnapshot(snapshot);
    expect(approvedBaseSchema.safeParse({ ...approved, files: [...approved.files, approved.files[0]] }).success).toBe(false);
    expect(approvedBaseSchema.safeParse({ ...approved, files: [{ path: ".git/config", sha256: "a".repeat(64) }] }).success).toBe(false);
  });

  it("requires the reviewed manifest in live runtime configuration", () => {
    const configured = {
      mode: "isolated-dogfood", ownerId: "owner", agentId: "agent", objective: "Implement issue #1",
      criteria: fixture().work.criteria, profile: profile(), brokerPort: 3101, model: "claude-sonnet-5",
    };
    expect(runtimeSchema.safeParse(configured).success).toBe(false);
    expect(runtimeSchema.safeParse({ ...configured, approvedBase: manifestForSnapshot(snapshot) }).success).toBe(true);
  });
});
