import { z, ZodError } from "zod";
import type { AttentionRepository } from "./repository.ts";
import { responseSchema } from "./contracts.ts";
import { UniversalInbox } from "./service.ts";

const markSchema = z.object({ operation: z.enum(["mark_read", "mark_unread", "dismiss"]), itemId: z.string().min(1).max(255), expectedRevision: z.number().int().positive() }).strict();
const listSchema = z.object({ view: z.enum(["inbox", "needs_you", "waiting", "archive"]).optional(), limit: z.coerce.number().int().min(1).max(100).optional(), cursor: z.string().max(1024).optional() }).strict();
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
/** Integration factory, deliberately unmounted until production persistence/Work ownership is agreed. */
export function createInboxApi(input: {
  repository: AttentionRepository;
  authenticate(request: Request): Promise<{ id: string } | null>;
  clock?: () => string;
}) {
  return async (request: Request): Promise<Response> => {
    try {
      const principal = await input.authenticate(request);
      if (!principal) return reply({ error: "unauthorized" }, 401);
      const inbox = new UniversalInbox(principal.id, input.repository, input.clock);
      if (request.method === "GET") {
        const query = listSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
        return reply(await inbox.list(query));
      }
      if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
      // Authenticated cookies alone are insufficient for browser writes.
      if (request.headers.get("origin") !== new URL(request.url).origin) return reply({ error: "cross_origin" }, 403);
      const reader = request.body?.getReader();
      if (!reader) return reply({ error: "invalid_request" }, 400);
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 16_384) { await reader.cancel(); return reply({ error: "request_too_large" }, 413); }
        chunks.push(chunk.value);
      }
      const text = Buffer.concat(chunks).toString("utf8");
      const body: unknown = JSON.parse(text);
      const response = responseSchema.safeParse(body);
      if (response.success) return reply({ response: await inbox.respond(response.data) }, 202);
      const mark = markSchema.parse(body);
      return reply({ item: await inbox.mark(mark.itemId, mark.operation, mark.expectedRevision) });
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) return reply({ error: "invalid_request" }, 400);
      const code = error instanceof Error ? error.message : "";
      if (code === "NOT_FOUND") return reply({ error: "not_found" }, 404);
      if (["STALE_ITEM", "STALE_ACTION", "ACTION_NOT_AVAILABLE", "RESPONSE_ID_CONFLICT", "INVALID_CHOICE"].includes(code)) return reply({ error: code.toLowerCase() }, 409);
      return reply({ error: "inbox_unavailable" }, 503);
    }
  };
}
