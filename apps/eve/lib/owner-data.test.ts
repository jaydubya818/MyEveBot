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
  it("exports peer policy as owner-scoped non-restorable metadata without credentials", async () => {
    const domain = OWNER_DATA_DOMAINS.find(domain => domain.id === "peer_permissions")!;
    const query = vi.fn().mockResolvedValue([{ id: "permission", local_agent_id: "sofie", peer_agent_id: "atlas", policies: [], expires_at: null }]);
    const exported = await domain.load({ ownerId: "owner", query });
    expect(domain.restorable).toBe(false);
    expect(exported.portability).toBe("non_restorable");
    expect(exported.records.relationships[0]).toMatchObject({ restorableAuthority: false, restoreStatus: "requires_fresh_owner_review" });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE owner_id=$1"), ["owner"]);
    expect(query.mock.calls[0][0]).not.toMatch(/SELECT \*|credential|session|private_key/);
    const bundle = fixtureBundle(); bundle.categories.peer_permissions = exported;
    const archive = await createOwnerArchive(bundle);
    expect((await validateOwnerArchive(new Uint8Array(archive))).valid).toBe(true);
  });
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

  it("exports all session-Run bindings without restoring execution authority",async()=>{
    const links=[{session_id:"session",task_id:"old",is_current:false},{session_id:"session",task_id:"current",is_current:true}];
    const query=vi.fn(async(sql:string)=>sql.includes("FROM task_run_sessions s")?links:[]);
    const bundle=await collectOwnerData("owner-a",query);
    expect(bundle.categories.runs.records.sessionRuns).toEqual(links);
    expect(query.mock.calls.find(([sql])=>sql.includes("FROM task_run_sessions s"))?.[0]).toContain("WHERE r.owner_id=$1");
    expect(ownerDataInventory(bundle).find(row=>row.id==="runs")?.portability).toBe("non_restorable");
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
    expect(allSql).toContain("from memory_records where owner_id=$1 and status <> 'deleted'");
    expect(allSql).not.toContain("update chat_files");
    expect(allSql).not.toContain("alter table chat_files");

    const inventory = ownerDataInventory(bundle);
    expect(inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "routines", ownerScope: "owner_scoped", portability: "partially_restorable" }),
      expect.objectContaining({ id: "finance", ownerScope: "single_owner_legacy" }),
      expect.objectContaining({ id: "browser_profiles", ownerScope: "owner_scoped", portability: "restorable_with_reconnection" }),
      expect.objectContaining({ id: "computer_history", ownerScope: "owner_scoped", portability: "non_restorable" }),
      expect.objectContaining({ id: "approval_history", ownerScope: "owner_scoped", portability: "non_restorable" }),
      expect.objectContaining({ id: "action_history", ownerScope: "owner_scoped", portability: "non_restorable" }),
    ]));

    const profileSql = statements.find(({ sql }) => sql.includes("FROM persistent_browser_profiles"))?.sql ?? "";
    const computerSql = statements.filter(({ sql }) => /computer_sessions|browser_sessions|computer_control_|computer_actions/.test(sql)).map(({ sql }) => sql).join("\n");
    const approvalSql = statements.find(({ sql }) => sql.includes("FROM task_approval_decisions WHERE owner_id=$1"))?.sql ?? "";
    const actionSql = statements.filter(({ sql }) => /FROM action_(requests|receipts) WHERE owner_id=\$1/.test(sql)).map(({ sql }) => sql).join("\n");
    const routineSql = statements.filter(({ sql }) => /FROM (reminders|execution_routines|execution_routine_versions|execution_occurrences|execution_attempts|review_deliveries) WHERE owner_id=\$1/.test(sql)).map(({ sql }) => sql).join("\n");
    expect(profileSql).not.toContain("failure_summary");
    expect(computerSql).not.toMatch(/runtime_session_id|sandbox_id|checkpoint|state_fingerprint|input_summary|output_summary|call_id/);
    expect(approvalSql).toMatch(/binding_hash.*risk.*effects.*expires_at.*decision_reason/);
    expect(approvalSql).not.toMatch(/action_parameters|prompt|resource,/);
    expect(actionSql).not.toMatch(/parameter_hash|provider_receipt|recovery_token|recovery_result/);
    expect(routineSql).not.toMatch(/claimed_by|claim_version|lease_expires_at|heartbeat_at|runtime_session_id/);
    expect(
      statements
        .filter(({ sql }) => /persistent_browser_|computer_sessions|browser_sessions|computer_control_|computer_actions|task_approval_decisions WHERE/.test(sql))
        .every(({ params }) => params?.[0] === "owner-a"),
    ).toBe(true);
  });

  it("exports operational authority only as non-restorable history", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM computer_control_leases")) return [{ computer_session_id: "computer-1", controller: "OWNER", version: 4 }];
      if (sql.includes("FROM task_approval_decisions WHERE")) return [{ id: "approval-1", status: "approved", binding_hash: "sha256:binding", risk: "high", effects: ["external_write"] }];
      if (sql.includes("FROM action_requests WHERE")) return [{ id: "action-1", status: "completed", decision: "ALLOW" }];
      if (sql.includes("FROM execution_routines WHERE")) return [{ id: "routine-1", status: "active", version: 2 }];
      if (sql.includes("FROM execution_occurrences WHERE")) return [{ id: "blocked-1", status: "blocked_precheck", run_id: null, admission: { state: "NEEDS_CONFIGURATION" }, preflight: null }];
      if (sql.includes("FROM persistent_browser_profiles")) return [{ id: "profile-1", provider: "orgo", status: "ready" }];
      return [];
    });

    const bundle = await collectOwnerData("owner-a", query);
    expect(bundle.categories.browser_profiles.records.profiles[0]).toMatchObject({ authentication: "requires_reconnection" });
    expect(bundle.categories.computer_history.records.controlLeases[0]).toMatchObject({ authority: "historical_only", restorableAuthority: false });
    expect(bundle.categories.approval_history.records.approvals[0]).toMatchObject({ authority: "historical_only", restorableAuthority: false });
    expect(bundle.categories.action_history.records.requests[0]).toMatchObject({ authority: "historical_only", restorableAuthority: false });
    expect(bundle.categories.routines.records.routines[0]).toMatchObject({ restoreStatus: "disabled_needs_owner_review", restorableAuthority: false });
    expect(bundle.categories.routines.records.occurrences[0]).toMatchObject({ status: "blocked_precheck", run_id: null, admission: { state: "NEEDS_CONFIGURATION" }, authority: "historical_only", restorableAuthority: false });

    const validation = await validateOwnerArchive(await createOwnerArchive(bundle));
    expect(validation.domains).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "computer_history", portability: "non_restorable" }),
      expect.objectContaining({ id: "approval_history", portability: "non_restorable" }),
      expect.objectContaining({ id: "action_history", portability: "non_restorable" }),
      expect.objectContaining({ id: "routines", portability: "partially_restorable" }),
    ]));
  });
});
