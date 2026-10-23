export class AuthInputError extends Error {}

/** Enforce the actual streamed byte count, including requests without Content-Length. */
export async function readAuthBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new AuthInputError("Invalid request.");
  const reader = request.body?.getReader();
  if (!reader) throw new AuthInputError("Invalid request.");
  let raw = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 4096) { await reader.cancel(); throw new AuthInputError("Request is too large."); }
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AuthInputError) throw error;
    throw new AuthInputError("Invalid request.");
  } finally { reader.releaseLock(); }
}

export const authJson = (body: object, status = 200): Response => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": "900" } : {}) },
});
