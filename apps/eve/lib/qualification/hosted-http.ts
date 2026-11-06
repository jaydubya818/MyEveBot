import { db } from "../../agent/lib/receipts-db.ts";
import { authenticatePoller, MailboxRefused, type MailboxBinding, type MailboxDb } from "../engineering/factory-mailbox.ts";
import { hostedBinding, hostedProfileFromEnv, type HostedProfile } from "./hosted-profile.ts";
import { PreviewRefused } from "./hosted-preview.ts";

/** Shared HTTP plumbing for the hosted mailbox and preview routes. Every response is no-store and carries no CORS grant. */
export const NO_STORE = { "cache-control": "no-store", "x-content-type-options": "nosniff" } as const;
export const hostedJson = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });
export const hostedNotFound = () => new Response(null, { status: 404, headers: NO_STORE });

/** Neon/pg query adapter. */
export function hostedDb(): MailboxDb {
  const sql = db();
  return { query: async (text, params) => await sql.query(text, (params ?? []) as never[]) as Array<Record<string, unknown>> };
}

export type HostedContext = { profile: HostedProfile; db: MailboxDb; binding: MailboxBinding };
/** Null (=> 404) unless this deployment is a configured hosted private-beta installation with a database. */
export function hostedContext(env: Readonly<Record<string, string | undefined>> = process.env, database?: MailboxDb): HostedContext | null {
  const profile = hostedProfileFromEnv(env);
  if (!profile || (!database && !env.DATABASE_URL)) return null;
  return { profile, db: database ?? hostedDb(), binding: hostedBinding(profile) };
}

/** Poller (Mac) authentication: the bearer credential's hash must be the enrolled one of exactly this installation and owner. */
export async function pollerContext(request: Request, env?: Readonly<Record<string, string | undefined>>, database?: MailboxDb): Promise<HostedContext | Response> {
  const context = hostedContext(env, database);
  if (!context) return hostedNotFound();
  if (request.headers.get("origin") !== null || request.headers.get("cookie") !== null) return hostedJson({ error: "MAILBOX_BROWSER_REQUEST" }, 403);
  const binding = await authenticatePoller(context.db, request.headers.get("authorization"), context.binding).catch(() => null);
  return binding ? context : hostedJson({ error: "MAILBOX_UNAUTHORIZED" }, 401);
}

export function hostedError(error: unknown): Response {
  if (error instanceof MailboxRefused || error instanceof PreviewRefused) return hostedJson({ error: error.code }, error.status);
  return hostedJson({ error: "HOSTED_UNAVAILABLE" }, 503);
}

/** Reads a bounded body (bytes). Refuses beyond `max`. */
export async function boundedBody(request: Request, max: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
