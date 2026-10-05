import { createHash, timingSafeEqual } from "node:crypto";

export function isManagedAdmin(request: Request): boolean {
  const expected = process.env.MANAGED_EVE_ADMIN_TOKEN;
  const provided = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || expected.length < 32 || !provided || provided.length > 256) return false;
  const expectedHash = createHash("sha256").update(expected).digest();
  const providedHash = createHash("sha256").update(provided).digest();
  return timingSafeEqual(expectedHash, providedHash);
}

export function adminDenied(): Response {
  return Response.json({ error: "Operator authorization required" }, {
    status: 401,
    headers: { "Cache-Control": "no-store" },
  });
}
