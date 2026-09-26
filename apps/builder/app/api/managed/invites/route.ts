import { adminDenied, isManagedAdmin } from "@/managed/admin-auth";
import { issueManagedInvite, revokeManagedInvite } from "@/managed/invites";

export async function POST(request: Request): Promise<Response> {
  if (!isManagedAdmin(request)) return adminDenied();
  try {
    const input = await request.json() as Record<string, unknown>;
    if (typeof input.email !== "string" || typeof input.relayInviteUrl !== "string" || typeof input.monthlyModelBudgetUsd !== "number") {
      return Response.json({ error: "Email, Relay invitation URL, and model budget are required" }, { status: 400 });
    }
    const origin = process.env.MANAGED_EVE_PUBLIC_ORIGIN;
    if (!origin || new URL(origin).origin !== origin) throw new Error("Managed Eve public origin is not configured");
    const invite = await issueManagedInvite({
      email: input.email,
      relayInviteUrl: input.relayInviteUrl,
      builderOrigin: origin,
      monthlyModelBudgetUsd: input.monthlyModelBudgetUsd,
    });
    return Response.json(invite, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not issue invitation";
    const expected = /valid tester email|approved production signup URL|already has|capacity reached/.test(message);
    return Response.json({ error: expected ? message : "Invitation service is unavailable" }, {
      status: expected ? 409 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  if (!isManagedAdmin(request)) return adminDenied();
  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  if (typeof body?.id !== "string") {
    return Response.json({ error: "Invitation ID is required" }, { status: 400 });
  }
  try {
    const revoked = await revokeManagedInvite(body.id);
    if (!revoked) return Response.json({ error: "Invitation is unavailable or already claimed" }, { status: 409 });
    return Response.json({ id: body.id, revoked: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Invitation could not be revoked" }, { status: 503 });
  }
}
