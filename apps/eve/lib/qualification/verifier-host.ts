import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { z } from "zod";
import type { ExecutionDatabase } from "../execution-types.ts";
import { dockerRemoveCleanup, processEvaluator } from "./verifier-runner.ts";
import { createVerifierHandler, ed25519Signer, type QuiescentEvaluator } from "./verifier-service.ts";
import { PostgresVerifierStore } from "./verifier-store-pg.ts";
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
export type VerifierHostHandle = { origin: string; profileSha256: string; close(): Promise<void> };

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
    const table = await database.query("SELECT to_regclass('public.qdev_verifier_candidate') AS t", []) as Array<{ t: string | null }>;
    const trigger = await database.query("SELECT 1 AS ok FROM pg_trigger WHERE tgname = 'qdev_verifier_guard' AND NOT tgisinternal", []) as unknown[];
    if (!table[0]?.t || trigger.length !== 1) throw new Error("schema");
  } catch { throw new VerifierHostRefused("QDEV_VERIFIER_HOST_SCHEMA"); }

  const evaluator = deps.evaluator ?? processEvaluator({
    command: profile.evaluator.command, args: profile.evaluator.args, cwd: profile.evaluator.cwd,
    env: Object.fromEntries(profile.evaluator.envNames.flatMap(name => env[name] === undefined ? [] : [[name, env[name]!]])),
    ...(profile.evaluator.containerName ? { cleanup: dockerRemoveCleanup(profile.evaluator.containerName) } : {}),
  });
  const handler = createVerifierHandler({
    credentialSha256: profile.credentialSha256, expected: profile.expected, evaluator, paid: profile.evaluator.paid, signer,
    store: new PostgresVerifierStore(database), evaluationDeadlineMs: profile.evaluator.deadlineMs, quiescenceGraceMs: profile.evaluator.graceMs, now,
  });
  // The profile's expiry applies to every request, not only the start.
  const guarded = async (request: Request) => now() >= notAfter ? Response.json({ error: "QDEV_VERIFIER_EXPIRED" }, { status: 503, headers: { "cache-control": "no-store" } }) : handler(request);
  const listening = await listenVerifierLoopback(guarded, { port: profile.listenPort, maxBodyBytes: MAX_BODY });
  return { origin: listening.origin, profileSha256: createHash("sha256").update(raw).digest("hex"), close: listening.close };
}
