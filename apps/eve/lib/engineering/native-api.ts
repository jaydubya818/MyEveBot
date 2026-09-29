import { z } from "zod";
import { boundedJson } from "../relay/client.ts";
import { engineeringPrincipal } from "./api.ts";
import { NativeRouteAuthority, admitNativeWork } from "./native-routing.ts";
import { WorkStore } from "./store.ts";
import { WorkError } from "./types.ts";

const inputSchema = z.object({ expectedWorkVersion: z.number().int().positive(), expectedWorkGeneration: z.number().int().positive() }).strict();
const headers = { "cache-control": "no-store" };
/** Owner input may select a Work revision, never a qualification, policy or authority snapshot. */
export async function handleNativeAdmission(request: Request, id: string) {
  try {
    const store = new WorkStore(engineeringPrincipal(request));
    z.string().uuid().parse(id);
    if (request.method === "GET") {
      const { decision } = await new NativeRouteAuthority(store).assess(id);
      return Response.json({ available: decision.admitted, reasons: decision.reasons }, { headers });
    }
    const input = inputSchema.parse(await boundedJson(new Response(request.body), 2000));
    const receipt = await admitNativeWork(store, id, input.expectedWorkVersion, input.expectedWorkGeneration);
    return Response.json({ receipt, next: "Open this Work in Sofie chat to begin native development." }, { headers });
  } catch (error) {
    if (error instanceof WorkError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
    if (error instanceof z.ZodError) return Response.json({ error: "Select the current Work revision.", code: "invalid_admission" }, { status: 400, headers });
    return Response.json({ error: "Native admission is unavailable. Saved Work has been retained.", code: "native_unavailable" }, { status: 503, headers });
  }
}
