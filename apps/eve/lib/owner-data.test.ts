import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

import {
  collectOwnerData,
  createOwnerArchive,
  ownerDataInventory,
  validateOwnerArchive,
  type OwnerDataBundle,
} from "./owner-data";

function fixtureBundle(): OwnerDataBundle {
  return {
    exportedAt: "2026-09-18T12:00:00.000Z",
    ownerFingerprint: "0123456789abcdef",
    categories: {
      goals: {
        description: "Goals",
        records: { goals: [{ id: "goal_1", title: "Ship MyEve" }] },
      },
      memories: {
        description: "Memories",
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
      fileCount: 6,
      recordCount: 2,
    });
    expect(ownerDataInventory(fixtureBundle())).toEqual([
      expect.objectContaining({ id: "goals", recordCount: 1 }),
      expect.objectContaining({ id: "memories", recordCount: 1 }),
    ]);
  });

  it("rejects an archive whose data no longer matches its manifest", async () => {
    const archive = await createOwnerArchive(fixtureBundle());
    const zip = await JSZip.loadAsync(archive);
    zip.file("data/goals.json", JSON.stringify({ changed: true }));
    const tampered = await zip.generateAsync({ type: "uint8array" });

    await expect(validateOwnerArchive(tampered)).rejects.toThrow("integrity check failed");
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
