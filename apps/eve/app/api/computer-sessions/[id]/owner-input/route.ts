import { apiError, requireDatabase } from "@/lib/api-errors";
import { sendComputerOwnerInput } from "@/lib/computer-sessions";
import { ControlConflictError } from "@/lib/computer-control";
import type { OwnerInput } from "@/lib/live-session-provider";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

type RouteContext = { params: Promise<{ id: string }> };

function finite(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function parseInput(value: unknown): OwnerInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.type === "text") return typeof raw.text === "string" && raw.text.length > 0 && raw.text.length <= 4_000 ? { type: "text", text: raw.text } : null;
  if (raw.type === "key") {
    if (typeof raw.key !== "string" || typeof raw.code !== "string" || raw.key.length > 40 || raw.code.length > 40) return null;
    const modifiers = raw.modifiers === undefined ? 0 : finite(raw.modifiers, 0, 15);
    return modifiers === null ? null : { type: "key", key: raw.key, code: raw.code, modifiers };
  }
  const x = finite(raw.x, 0, 10_000); const y = finite(raw.y, 0, 10_000);
  if (x === null || y === null) return null;
  if (raw.type === "pointerMove") return { type: "pointerMove", x, y };
  if (raw.type === "click" || raw.type === "doubleClick") {
    const button = raw.button === undefined ? "left" : raw.button;
    return ["left", "right", "middle"].includes(String(button)) ? { type: raw.type, x, y, button: button as "left" | "right" | "middle" } : null;
  }
  if (raw.type === "scroll") {
    const deltaX = finite(raw.deltaX, -10_000, 10_000); const deltaY = finite(raw.deltaY, -10_000, 10_000);
    return deltaX === null || deltaY === null ? null : { type: "scroll", x, y, deltaX, deltaY };
  }
  return null;
}

export async function POST(request: Request, ctx: RouteContext): Promise<Response> {
  const denied = requireWebAuth(request) ?? requireDatabase(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const ownerInput = parseInput(body?.input);
  if (!body || typeof body.runId !== "string" || typeof body.browserSessionId !== "string"
    || !Number.isInteger(body.controlVersion) || Number(body.controlVersion) < 1 || !ownerInput) {
    return apiError(request, 400, "invalid_owner_input", "A valid session binding, control version, and owner input are required.");
  }
  const { id } = await ctx.params;
  const ownerId = webPrincipal(request)!.id;
  try {
    await sendComputerOwnerInput({
      ownerId, id, runId: body.runId, browserSessionId: body.browserSessionId,
      controlVersion: Number(body.controlVersion), requestedBy: ownerId, ownerInput,
    });
    return Response.json({ delivered: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Owner input could not be delivered.";
    if (/not found/i.test(message)) return apiError(request, 404, "computer_session_not_found", message);
    if (error instanceof ControlConflictError || /binding|control|lease/i.test(message)) return apiError(request, 409, "owner_input_rejected", message);
    if (/not supported/i.test(message)) return apiError(request, 422, "owner_input_unsupported", message);
    return apiError(request, 503, "owner_input_failed", "Owner input could not be delivered safely.");
  }
}
