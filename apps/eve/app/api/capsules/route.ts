import { CanonicalCapsules } from "@/lib/capsules/canonical-memory";
import { betaIntegration } from "@/lib/beta-integration/runtime";
import { z } from "zod";
import {
  requireSameOrigin, authenticateWebPrincipal,
  requireWebAuth,
  webPrincipal,
} from "@/lib/web-auth";
import {
  byteSize,
  canonicalJson,
  exportCapsule,
  exportPreview,
  ownerReference,
} from "@/lib/capsules/format";
import { prepareImport, previewImport } from "@/lib/capsules/import";
import { candidateSummaries, capsuleService } from "@/lib/capsules/service";
import { CAPSULE_EXCLUSIONS, CapsuleError } from "@/lib/capsules/schema";

export const runtime = "nodejs";
const selection = {
  destinationEveRef: z.string().min(1).max(160).optional(),
  selectedIds: z.array(z.string().max(160)).min(1).max(100),
};
const requestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("approve_personal_export"),
      memoryId: z.string().min(1).max(160),
      itemDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      destinationEveRef: z.string().min(1).max(160),
      personal: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("rollback"),
      id: z.string().regex(/^capsule_[a-f0-9]{64}$/),
    })
    .strict(),
  z.object({ action: z.literal("export_preview"), ...selection }).strict(),
  z
    .object({
      action: z.literal("export"),
      ...selection,
      reviewedDigest: z.string().max(80),
    })
    .strict(),
  z
    .object({
      action: z.literal("import_preview"),
      raw: z.string().max(1_048_576),
    })
    .strict(),
  z
    .object({
      action: z.literal("import"),
      raw: z.string().max(1_048_576),
      reviewedDigest: z.string().max(80),
      decisions: z.unknown(),
    })
    .strict(),
]);
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers });
function failure(error: unknown) {
  return error instanceof CapsuleError
    ? json({ error: error.message, code: error.code }, 400)
    : json(
        {
          error:
            "Capsule review is temporarily unavailable. Try again; no active experience was changed.",
        },
        503,
      );
}
async function boundedBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new CapsuleError("body", "A request body is required.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > 2_200_000) {
        await reader.cancel();
        throw new CapsuleError(
          "size",
          "The request exceeds the Capsule size limit.",
        );
      }
      chunks.push(next.value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new CapsuleError("body", "Invalid request JSON.");
    }
  } finally {
    reader.releaseLock();
  }
}
const guard = async (request: Request) =>
  process.env.MYEVE_CAPSULE_EVE_ID
    ? !(await authenticateWebPrincipal(request, { ...process.env, NODE_ENV: "production" }))
      ? json({ error: "Sign in to continue." }, 401)
      : requireSameOrigin(request)
    : (await requireWebAuth(request) ?? requireSameOrigin(request));
function canonical(owner: string) {
  return process.env.MYEVE_CAPSULE_EVE_ID
    ? new CanonicalCapsules(
        betaIntegration(),
        owner,
        process.env.MYEVE_CAPSULE_EVE_ID,
      )
    : null;
}
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  let service: Awaited<ReturnType<typeof capsuleService>> | undefined;
  try {
    const ownerId = webPrincipal(request)!.id;
    const active = canonical(ownerId);
    if (active)
      return json({
        ...(await active.catalog(
          new URL(request.url).searchParams.get("destinationEveRef") ?? "",
        )),
        exclusions: CAPSULE_EXCLUSIONS,
      });
    service = await capsuleService(ownerId);
    return json({
      mode: service.mode,
      candidates: candidateSummaries(service.candidates, ownerId),
      exclusions: CAPSULE_EXCLUSIONS,
      reviews: service.reviews,
    });
  } catch (error) {
    return failure(error);
  } finally {
    service?.close();
  }
}
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  let service: Awaited<ReturnType<typeof capsuleService>> | undefined;
  try {
    const parsed = requestSchema.safeParse(await boundedBody(request));
    if (!parsed.success)
      throw new CapsuleError("request", "Choose a valid Capsule operation.");
    const body = parsed.data;
    const ownerId = webPrincipal(request)!.id;
    const active = canonical(ownerId);
    if (active) {
      if (body.action === "approve_personal_export")
        return json(await active.approve(body));
      if (body.action === "rollback")
        return json(await active.rollback(body.id));
      if (body.action === "export_preview" || body.action === "export")
        return json(
          await active.export(
            body.destinationEveRef ?? "",
            body.selectedIds,
            body.action === "export" ? body.reviewedDigest : undefined,
          ),
        );
      if (body.action === "import_preview")
        return json(await active.preview(body.raw));
      return json(
        await active.import(body.raw, body.reviewedDigest, body.decisions),
      );
    }
    if (body.action === "approve_personal_export" || body.action === "rollback")
      throw new CapsuleError(
        "configuration",
        "Canonical Memory integration is not configured.",
      );
    service = await capsuleService(ownerId);
    if (body.action === "export_preview")
      return json(
        exportPreview(
          service.candidates,
          body.selectedIds,
          ownerReference(ownerId),
        ),
      );
    if (body.action === "export") {
      const capsule = exportCapsule({
        candidates: service.candidates,
        selectedIds: body.selectedIds,
        reviewedDigest: body.reviewedDigest,
        ownerRef: ownerReference(ownerId),
        eveRef: service.mode === "qualification" ? "sofie-a" : "source-eve",
      });
      return json({
        raw: canonicalJson(capsule),
        bytes: byteSize(capsule),
        digest: capsule.digest,
      });
    }
    const destination = await service.adapter.snapshot();
    if (body.action === "import_preview")
      return json(previewImport(body.raw, destination));
    const batch = prepareImport(
      body.raw,
      destination,
      body.reviewedDigest,
      body.decisions,
    );
    return json({
      ...(await service.adapter.commit(batch)),
      mode: service.mode,
      message:
        "Review saved. Current Truth is unchanged; Skills and behavior remain inactive until destination qualification.",
    });
  } catch (error) {
    return failure(error);
  } finally {
    service?.close();
  }
}
export async function DELETE(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  let service: Awaited<ReturnType<typeof capsuleService>> | undefined;
  try {
    const body = z
      .object({ id: z.string().regex(/^capsule_[a-f0-9]{64}$/) })
      .strict()
      .safeParse(await boundedBody(request));
    if (!body.success)
      throw new CapsuleError("request", "Choose a saved Capsule review.");
    service = await capsuleService(webPrincipal(request)!.id);
    return json({ removed: await service.remove(body.data.id) });
  } catch (error) {
    return failure(error);
  } finally {
    service?.close();
  }
}
