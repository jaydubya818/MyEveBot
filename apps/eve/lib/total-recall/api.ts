import { z } from "zod";
import { engineeringPrincipal } from "../engineering/api.ts";
import { WorkStore } from "../engineering/store.ts";
import { WorkError } from "../engineering/types.ts";
import { boundedJson } from "../relay/client.ts";
import { LearningStore } from "./store.ts";
import { feedbackInput } from "./learning.ts";

const command = z.object({ eventId: z.string().uuid(), version: z.number().int().positive(), hash: z.string().regex(/^[a-f0-9]{64}$/),
  action: z.enum(["evaluate", "promote", "reject", "rollback"]), reason: z.string().trim().min(1).max(1000) }).strict();
const requestInput = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("feedback"), feedback: feedbackInput }).strict(),
  z.object({ operation: z.literal("decision"), id: z.string().regex(/^[a-f0-9]{64}$/), revision: z.number().int().positive(), command }).strict(),
]);
const headers = { "cache-control": "no-store" };
export async function learningRequest(request: Request): Promise<Response> {
  try {
    const principal = engineeringPrincipal(request);
    // Schema ownership is unresolved. This opt-in is for isolated qualification
    // only; it is never an implicit migration or a production enablement.
    if (process.env.MYEVE_TOTAL_RECALL_MODE !== "qualification" || process.env.VERCEL_ENV === "production")
      return Response.json({ error: "Learning is awaiting database integration and qualification.", code: "learning_not_enabled" }, { status: 503, headers });
    const store = new LearningStore(new WorkStore(principal));
    if (request.method === "GET") return Response.json({ families: await store.list(), works: await store.work.list() }, { headers });
    const input = requestInput.parse(await boundedJson(new Response(request.body), 12000));
    const family = input.operation === "feedback" ? await store.feedback(input.feedback) : await store.command(input.id,input.revision,input.command);
    return Response.json({ family }, { headers });
  } catch (error) {
    if (error instanceof WorkError) return Response.json({ error: error.message }, { status: error.status, headers });
    if (error instanceof z.ZodError) return Response.json({ error: "Check the feedback, Work version and decision fields." }, { status: 400, headers });
    // Never expose SQL errors, credentials, raw evidence or connection details.
    return Response.json({ error: "Learning could not be updated. Reload to check the saved state before trying again." }, { status: 409, headers });
  }
}
