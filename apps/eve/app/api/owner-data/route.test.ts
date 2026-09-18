import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireWebAuth: vi.fn(),
  requireDatabase: vi.fn(),
  requestOwnerId: vi.fn(),
  collectOwnerData: vi.fn(),
  createOwnerArchive: vi.fn(),
  ownerDataInventory: vi.fn(),
  validateOwnerArchive: vi.fn(),
  listOwnerDataOperations: vi.fn(),
  recordOwnerDataOperation: vi.fn(),
}));

vi.mock("@/lib/web-auth", () => ({ requireWebAuth: mocks.requireWebAuth }));
vi.mock("@/lib/api-errors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-errors")>()),
  requireDatabase: mocks.requireDatabase,
}));
vi.mock("@/lib/agent-api", () => ({ requestOwnerId: mocks.requestOwnerId }));
vi.mock("@/lib/owner-data", () => ({
  OWNER_ARCHIVE_MAX_BYTES: 25 * 1024 * 1024,
  OWNER_DATA_EXCLUSIONS: ["Credentials"],
  OWNER_DATA_RETENTION: [{ dataClass: "Memories", policy: "Until forgotten" }],
  collectOwnerData: mocks.collectOwnerData,
  createOwnerArchive: mocks.createOwnerArchive,
  ownerDataInventory: mocks.ownerDataInventory,
  validateOwnerArchive: mocks.validateOwnerArchive,
}));
vi.mock("@/lib/owner-data-operations", () => ({
  listOwnerDataOperations: mocks.listOwnerDataOperations,
  recordOwnerDataOperation: mocks.recordOwnerDataOperation,
}));

import { GET, POST } from "./route";

describe("/api/owner-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWebAuth.mockReturnValue(null);
    mocks.requireDatabase.mockReturnValue(null);
    mocks.requestOwnerId.mockReturnValue("owner-a");
    mocks.collectOwnerData.mockResolvedValue({ exportedAt: "2026-09-18T12:00:00.000Z" });
    mocks.ownerDataInventory.mockReturnValue([]);
    mocks.createOwnerArchive.mockResolvedValue(Buffer.from("archive"));
    mocks.validateOwnerArchive.mockResolvedValue({ valid: true, version: 1 });
    mocks.listOwnerDataOperations.mockResolvedValue([]);
    mocks.recordOwnerDataOperation.mockResolvedValue({ id: "dataop_1" });
  });

  it("scopes inventory and downloads to the authenticated owner", async () => {
    const inventory = await GET(new Request("https://myeve.example/api/owner-data"));
    const download = await GET(new Request("https://myeve.example/api/owner-data?download=1"));

    expect(inventory.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("application/zip");
    expect(mocks.collectOwnerData).toHaveBeenNthCalledWith(1, "owner-a");
    expect(mocks.collectOwnerData).toHaveBeenNthCalledWith(2, "owner-a");
  });

  it("validates uploads without invoking any restore operation", async () => {
    const form = new FormData();
    form.set("archive", new File(["archive"], "owner.zip", { type: "application/zip" }));
    const response = await POST(new Request("https://myeve.example/api/owner-data", { method: "POST", body: form }));

    expect(response.status).toBe(200);
    expect(mocks.validateOwnerArchive).toHaveBeenCalledOnce();
  });

  it("fails closed before reading owner data when authentication is denied", async () => {
    mocks.requireWebAuth.mockReturnValue(new Response("Denied", { status: 401 }));
    const response = await GET(new Request("https://myeve.example/api/owner-data"));

    expect(response.status).toBe(401);
    expect(mocks.collectOwnerData).not.toHaveBeenCalled();
  });
});
