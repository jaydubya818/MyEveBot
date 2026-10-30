import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { z } from "zod";
import type { ExecutionDatabase } from "../execution-types.ts";
import { dockerRemoveCleanup, processEvaluator } from "./verifier-runner.ts";
import { createVerifierHandler, ed25519Signer, EvaluatorNotQuiescent, type QuiescentEvaluator } from "./verifier-service.ts";
import { PostgresVerifierStore, VERIFIER_SCHEMA } from "./verifier-store-pg.ts";
import { listenVerifierLoopback } from "./verifier-transport.ts";

/**
 * Generic launcher for the independently administered verifier host: the ordinary server glue around the qualified service, runner and durable store.
 *
 *  - DISABLED by default: nothing starts, no database opens and no key is read unless MYEVE_QDEV_VERIFIER_ENABLED=true and a complete profile exists.
 *  - The profile is NON-secret and contains no criteria: the pinned installation digests, SHA-256 digests of the accepted bearer credentials, the NAMES of the
 *    environment variables holding the signer PEM and the verifier-only database URL, and the evaluator command with the SHA-256 of its executable bytes.
 *    The evaluator (criteria, image, anything protected) is the operator's custody; this source only runs it as an owned process group and settles on proven cessation.
 *  - The listener is fixed exact IPv4 loopback (see verifier-transport.ts); TLS, domain, tunnel and tester access remain separate protected owner actions.
 *  - The durable store is the verifier's OWN PostgreSQL database. The schema is applied by the operator; the launcher only verifies it (table and immutability
 *    trigger present) and refuses otherwise, so a start never changes a database.
 * Nothing here reserves, charges or grants: the evaluator budget is the charged reserve passed per request by the qdev gate.
 */
const hex = (n: number) => z.string().regex(new RegExp("^[a-f0-9]{" + n + "}$"));
const envName = z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/);
const absolute = z.string().min(2).max(1024).refine(value => isAbsolute(value) && !value.includes("\0") && !value.split("/").includes(".."), "absolute path without traversal");
export const verifierHostProfileSchema = z.object({
  version: z.literal(1),
  notAfter: z.string().datetime(),
  listenPort: z.number().int().min(1024).max(65535),
  expected: z.object({ projectSha256: hex(64), sourceSha256: hex(64), protectedSpecificationSha256: hex(64) }).strict(),
  credentialSha256: z.array(hex(64)).min(1).max(4),
  signer: z.object({ keyId: z.string().min(1).max(120), pemEnv: envName }).strict(),
  databaseUrlEnv: envName,
  evaluator: z.object({
    command: absolute, sha256: hex(64), args: z.array(z.string().max(512)).max(32), cwd: absolute.optional(), envNames: z.array(envName).max(16),
    /** Declared, never inferred: an unpaid evaluator must report exactly zero usage. */
    paid: z.boolean(), deadlineMs: z.number().int().min(1).max(600_000), graceMs: z.number().int().min(1).max(60_000).optional(),
    /** Named container removed (docker rm -f) before cessation is claimed. */
    containerName: z.string().regex(/^[a-z0-9][a-z0-9_.-]{5,63}$/).optional(),
  }).strict(),
}).strict();
export type VerifierHostProfile = z.infer<typeof verifierHostProfileSchema>;

export class VerifierHostRefused extends Error { constructor(readonly code: string) { super(code); } }
export type VerifierHostDeps = {
  env?: NodeJS.ProcessEnv; now?: () => number;
  /** Opens the verifier-only database from the runtime-supplied URL. */
  database(url: string): ExecutionDatabase;
  /** Test seam only; production uses the profile's process evaluator. */
  evaluator?: QuiescentEvaluator;
};
/** `clean` is true only when every evaluation that was running has been observed to cease (or none ran). Otherwise cessation is UNPROVEN and the durable record stays RUNNING/non-quiescent. */
export type VerifierHostHandle = { origin: string; profileSha256: string; close(): Promise<{ clean: boolean }> };
const GUARD_BODY = /AS \$\$([\s\S]*?)\$\$;/.exec(VERIFIER_SCHEMA)![1].trim();
const DRAIN_BOUND_MS = 60_000;

const MAX_BODY = 8_192;

/** Returns null (nothing started, nothing opened) unless explicitly enabled. Enabled-but-incomplete or unverifiable inputs throw VerifierHostRefused. */
export async function startVerifierHost(deps: VerifierHostDeps): Promise<VerifierHostHandle | null> {
  const env = deps.env ?? process.env, now = deps.now ?? Date.now;
  if (env.MYEVE_QDEV_VERIFIER_ENABLED !== "true") return null;
  const raw = env.MYEVE_QDEV_VERIFIER_PROFILE;
  if (!raw || raw.length > 20_000) throw new VerifierHostRefused("QDEV_VERIFIER_HOST_PROFILE");
  let profile: VerifierHostProfile;
  try { profile = verifierHostProfileSchema.parse(JSON.parse(raw)); } catch { throw new VerifierHostRefused("QDEV_VERIFIER_HOST_PROFILE"); }
  const notAfter = Date.parse(profile.notAfter);
  if (notAfter <= now()) throw new VerifierHostRefused("QDEV_VERIFIER_HOST_EXPIRED");

  if (!deps.evaluator) {
    // Source/digest binding: the exact executable bytes are pinned by the profile. Protected criteria stay inside that executable's custody.
    let bytes: Buffer;
    try { if (!lstatSync(profile.evaluator.command).isFile()) throw new Error("not a regular file"); bytes = readFileSync(profile.evaluator.command); }
    catch { throw new VerifierHostRefused("QDEV_VERIFIER_HOST_EVALUATOR"); }
    if (createHash("sha256").update(bytes).digest("hex") !== profile.evaluator.sha256) throw new VerifierHostRefused("QDEV_VERIFIER_HOST_EVALUATOR_DIGEST");
  }
  const pem = env[profile.signer.pemEnv], databaseUrl = env[profile.databaseUrlEnv];
  if (!pem) throw new VerifierHostRefused("QDEV_VERIFIER_HOST_SIGNER");
  let signer: ReturnType<typeof ed25519Signer>;
  try { signer = ed25519Signer(profile.signer.keyId, pem); } catch { throw new VerifierHostRefused("QDEV_VERIFIER_HOST_SIGNER"); }
  let url: URL;
  try { url = new URL(databaseUrl ?? ""); if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error("scheme"); } catch { throw new VerifierHostRefused("QDEV_VERIFIER_HOST_DATABASE"); }

  const database = deps.database(url.href);
  try {
    // Exact public target relation, the one intended guard function (by schema and body), enabled on origin writes, BEFORE ROW UPDATE|DELETE, and nothing else.
    const triggers = await database.query(
      `SELECT t.tgname, t.tgenabled, t.tgtype, pn.nspname AS function_schema, p.proname AS function_name, p.prosrc AS function_body
         FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_namespace pn ON pn.oid = p.pronamespace
        WHERE n.nspname = 'public' AND c.relname = 'qdev_verifier_candidate' AND c.relkind = 'r' AND NOT t.tgisinternal`, []) as Array<Record<string, unknown>>;
    const guard = triggers[0];
    if (triggers.length !== 1 || !guard || guard.tgname !== "qdev_verifier_guard" || !["O", "A"].includes(String(guard.tgenabled)) || Number(guard.tgtype) !== 27
      || guard.function_schema !== "public" || guard.function_name !== "qdev_verifier_guard" || String(guard.function_body).trim() !== GUARD_BODY) throw new Error("schema");
  } catch { throw new VerifierHostRefused("QDEV_VERIFIER_HOST_SCHEMA"); }

  const base = deps.evaluator ?? processEvaluator({
    command: profile.evaluator.command, args: profile.evaluator.args, cwd: profile.evaluator.cwd,
    env: Object.fromEntries(profile.evaluator.envNames.flatMap(name => env[name] === undefined ? [] : [[name, env[name]!]])),
    ...(profile.evaluator.containerName ? { cleanup: dockerRemoveCleanup(profile.evaluator.containerName) } : {}),
  });
  // Track every started evaluation so shutdown can prove it ceased (or report that it could not be proven).
  const runs = new Set<Promise<void>>();
  let unproven = false;
  const evaluator: QuiescentEvaluator = { run(input, context) {
    const started = base.run(input, context);
    const watch: Promise<void> = started.then(() => undefined, error => { if (error instanceof EvaluatorNotQuiescent) unproven = true; }).finally(() => runs.delete(watch));
    runs.add(watch);
    return started;
  } };
  const shutdown = new AbortController();
  const handler = createVerifierHandler({
    credentialSha256: profile.credentialSha256, expected: profile.expected, evaluator, paid: profile.evaluator.paid, signer,
    store: new PostgresVerifierStore(database), evaluationDeadlineMs: profile.evaluator.deadlineMs, quiescenceGraceMs: profile.evaluator.graceMs, now, shutdown: shutdown.signal,
  });
  // The profile's expiry applies to every request, not only the start.
  const guarded = async (request: Request) => now() >= notAfter ? Response.json({ error: "QDEV_VERIFIER_EXPIRED" }, { status: 503, headers: { "cache-control": "no-store" } }) : handler(request);
  const listening = await listenVerifierLoopback(guarded, { port: profile.listenPort, maxBodyBytes: MAX_BODY });
  let closing: Promise<{ clean: boolean }> | undefined;
  /** Stop accepting, abort every running evaluation like an expired deadline, wait for each handler call (even for disconnected clients) and each owned evaluator to cease. */
  const close = () => closing ??= (async () => {
    shutdown.abort();
    await listening.close();
    if (runs.size) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([Promise.allSettled([...runs]), new Promise<void>(resolve => { timer = setTimeout(resolve, DRAIN_BOUND_MS); })]);
      clearTimeout(timer);
    }
    return { clean: !unproven && runs.size === 0 };
  })();
  return { origin: listening.origin, profileSha256: createHash("sha256").update(raw).digest("hex"), close };
}
