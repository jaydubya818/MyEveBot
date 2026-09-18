import { apiError, requireDatabase } from "@/lib/api-errors";
import { requestOwnerId } from "@/lib/agent-api";
import { createHash } from "node:crypto";
import {
  collectOwnerData,
  createOwnerArchive,
  OWNER_ARCHIVE_MAX_BYTES,
  OWNER_DATA_EXCLUSIONS,
  OWNER_DATA_RETENTION,
  ownerDataInventory,
  validateOwnerArchive,
} from "@/lib/owner-data";
import { listOwnerDataOperations, recordOwnerDataOperation } from "@/lib/owner-data-operations";
import { requireWebAuth } from "@/lib/web-auth";

function guard(request: Request): Response | null {
  return requireWebAuth(request) ?? requireDatabase(request);
}

export async function GET(request: Request): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const ownerId = requestOwnerId(request);
  const downloading = new URL(request.url).searchParams.get("download") === "1";
  try {
    const bundle = await collectOwnerData(ownerId);
    if (downloading) {
      const archive = await createOwnerArchive(bundle);
      const verification = await validateOwnerArchive(archive);
      const inventory = ownerDataInventory(bundle);
      await recordOwnerDataOperation({
        ownerId, type: "export_completed", status: "completed", archiveVersion: 1,
        recordCount: inventory.reduce((total, item) => total + item.recordCount, 0),
        domainCounts: Object.fromEntries(inventory.map((item) => [item.id, item.recordCount])),
        checksum: createHash("sha256").update(archive).digest("hex"),
        metadata: { destinationType: "owner_download", verificationResult: "verified", verifiedFileCount: verification.fileCount },
      });
      const date = bundle.exportedAt.slice(0, 10);
      return new Response(new Uint8Array(archive), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="myeve-backup-${date}.zip"`,
          "Content-Length": String(archive.byteLength),
          "Content-Type": "application/zip",
        },
      });
    }
    return Response.json(
      {
        generatedAt: bundle.exportedAt,
        inventory: ownerDataInventory(bundle),
        exclusions: OWNER_DATA_EXCLUSIONS,
        retention: OWNER_DATA_RETENTION,
        history: await listOwnerDataOperations(ownerId),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Owner data export failed", error);
    if (downloading) {
      await recordOwnerDataOperation({
        ownerId, type: "export_failed", status: "failed", archiveVersion: 1,
        errorSummary: error instanceof Error ? error.message : "Export failed",
      }).catch(() => undefined);
    }
    return apiError(request, 503, "owner_data_unavailable", "Your data inventory is temporarily unavailable.");
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const ownerId = requestOwnerId(request);
  try {
    const form = await request.formData();
    const archive = form.get("archive");
    if (!(archive instanceof File)) {
      return apiError(request, 400, "archive_required", "Choose a MyEve archive to verify.");
    }
    if (archive.size > OWNER_ARCHIVE_MAX_BYTES) {
      return apiError(request, 413, "archive_too_large", "The selected archive is larger than 25 MB.");
    }
    const validation = await validateOwnerArchive(new Uint8Array(await archive.arrayBuffer()));
    await recordOwnerDataOperation({
      ownerId, type: "backup_verified", status: "completed", archiveVersion: validation.version,
      recordCount: validation.recordCount,
    });
    return Response.json({ validation }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Owner archive validation failed", error);
    return apiError(
      request,
      400,
      "invalid_owner_archive",
      error instanceof Error ? error.message : "The selected archive could not be verified.",
    );
  }
}
