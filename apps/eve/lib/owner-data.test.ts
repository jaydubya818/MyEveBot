import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

import {
  collectOwnerData,
  createOwnerArchive,
  OWNER_DATA_DOMAINS,
  ownerDataInventory,
  validateOwnerArchive,
  type OwnerDataBundle,
} from "./owner-data";

function fixtureBundle(): OwnerDataBundle {
  const categories = Object.fromEntries(
    OWNER_DATA_DOMAINS.filter((domain) => domain.required).map((domain) => [
      domain.id,
      {
        description: domain.description,
        completeness: "complete" as const,
        portability: "fully_restorable" as const,
        notes: [],
        records: {},
      },
    ]),
  );
  return {
    exportedAt: "2026-09-18T12:00:00.000Z",
    ownerFingerprint: "0123456789abcdef",
    categories: {
      ...categories,
      goals: {
        description: "Goals",
        completeness: "complete",
        portability: "fully_restorable",
        notes: [],
        records: { goals: [{ id: "goal_1", title: "Ship MyEve" }] },
      },
      memories: {
        description: "Memories",
        completeness: "complete",
        portability: "fully_restorable",
        notes: [],
        records: { memories: [{ id: "memory_1", content: "Prefers concise updates" }] },
      },
    },
  };
}

describe("owner data archives", () => {
  it("creates a portable archive whose manifest and checksums validate", async () => {
    const archive = await createOwnerArchive(fixtureBundle());
    const validation = await validateOwnerArchive(new Uint8Array(archive));

    expect(validation).toMatchObject({
      valid: true,
      version: 1,
      fileCount: OWNER_DATA_DOMAINS.filter((domain) => domain.required).length * 2 + 2,
      recordCount: 2,
    });
    expect(ownerDataInventory(fixtureBundle())).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "goals", recordCount: 1 }),
      expect.objectContaining({ id: "memories", recordCount: 1 }),
    ]));
    expect(validation.domains.some((domain) => domain.id === "files")).toBe(false);
  });

  it("rejects an archive whose data no longer matches its manifest", async () => {
    const archive = await createOwnerArchive(fixtureBundle());
    const zip = await JSZip.loadAsync(archive);
    zip.file("data/goals.json", JSON.stringify({ changed: true }));
    const tampered = await zip.generateAsync({ type: "uint8array" });

    await expect(validateOwnerArchive(tampered)).rejects.toThrow("integrity check failed");
  });

  it("rejects a newer unsupported format version", async () => {
    const archive = await createOwnerArchive(fixtureBundle());
    const zip = await JSZip.loadAsync(archive);
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string")) as { version: number };
    manifest.version = 2;
    zip.file("manifest.json", JSON.stringify(manifest));

    await expect(validateOwnerArchive(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow("supports up to version 1");
  });

  it("rejects duplicate domain identifiers", async () => {
    const archive = await createOwnerArchive(fixtureBundle());
    const zip = await JSZip.loadAsync(archive);
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string")) as { domains: Array<Record<string, unknown>> };
    manifest.domains.push({ ...manifest.domains[0] });
    zip.file("manifest.json", JSON.stringify(manifest));

    await expect(validateOwnerArchive(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow("domain manifest is invalid");
  });

  it("rejects entries whose declared size exceeds the per-file limit", async () => {
    const archive = await createOwnerArchive(fixtureBundle());
    const zip = await JSZip.loadAsync(archive);
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string")) as { files: Array<{ bytes: number }> };
    manifest.files[0].bytes = 11 * 1024 * 1024;
    zip.file("manifest.json", JSON.stringify(manifest));

    await expect(validateOwnerArchive(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow("invalid file entry");
  });

  it("rejects path traversal entries before reading the manifest", async () => {
    const zip = new JSZip();
    zip.file("../../secret.json", "{}");
    zip.file("manifest.json", "{}");

    await expect(validateOwnerArchive(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow("Archive path is unsafe");
  });

  it("keeps canonical domain data deterministic when only export time changes", async () => {
    const first = await JSZip.loadAsync(await createOwnerArchive(fixtureBundle()));
    const secondBundle = fixtureBundle();
    secondBundle.exportedAt = "2026-09-19T12:00:00.000Z";
    const second = await JSZip.loadAsync(await createOwnerArchive(secondBundle));

    expect(await first.file("data/goals.json")!.async("string")).toBe(await second.file("data/goals.json")!.async("string"));
  });

  it("rejects secret-bearing fields before creating an archive", async () => {
    const bundle = fixtureBundle();
    bundle.categories.goals.records.goals[0].api_key = "should-never-export";

    await expect(createOwnerArchive(bundle)).rejects.toThrow("Unsafe secret-bearing field");
  });

  it("uses owner filters and an explicit field allowlist", async () => {
    const statements: Array<{ sql: string; params: unknown[] | undefined }> = [];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      statements.push({ sql, params });
      return [];
    });

    const bundle = await collectOwnerData("owner-a", query, new Date("2026-09-18T12:00:00.000Z"));
    const allSql = statements.map(({ sql }) => sql).join("\n").toLowerCase();

    expect(bundle.ownerFingerprint).not.toContain("owner-a");
    expect(statements.filter(({ sql }) => sql.includes("$1"))).not.toContainEqual(
      expect.objectContaining({ params: expect.not.arrayContaining(["owner-a"]) }),
    );
    expect(allSql).not.toMatch(/select\s+\*/);
    expect(allSql).not.toContain("webhooks.secret");
    expect(allSql).not.toContain("provider_id");
    expect(allSql).not.toContain("storage_key");
  });
});
