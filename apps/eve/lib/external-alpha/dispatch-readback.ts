import { randomBytes, verify, type KeyObject } from "node:crypto";
import { z } from "zod";
import { digest } from "../engineering/contract.ts";
import type { ExecutionDatabase } from "../execution-types.ts";
import { canonicalJson, type WorkAuthorityRecord } from "./work-authority.ts";

export const READBACK_DOMAIN = "MYFACTORY_EXTERNAL_ALPHA_READBACK_V1";
const hex = z.string().regex(/^[a-f0-9]{64}$/);
export const readbackAttestationSchema = z.object({
  schema: z.literal(READBACK_DOMAIN), requestId: z.string().uuid(), workOrderId: z.string().uuid(),
  runId: z.string().min(1).max(200), attemptNumber: z.literal(1), requestDigest: hex,
  admittedDeadline: z.string().datetime(), authorityId: z.string().uuid(), authoritySha256: hex, receiptDigest: hex,
  state: z.enum(["PREPARING", "PREPARED", "DISPATCHING", "RUNNING", "UNKNOWN", "STOPPING", "COMPLETED", "FAILED", "CANCELLED", "NOT_DISPATCHED"]),
  quiescent: z.boolean(), evidenceRef: z.string().nullable(), blocker: z.string().regex(/^[A-Z_]{3,80}$/).nullable(),
  spend: z.unknown(), spendDigest: hex, verdict: z.enum(["PENDING", "PASS", "FAIL", "PARTIAL", "NONE"]),
  challenge: z.string().regex(/^[a-f0-9]{16,64}$/).nullable(), issuedAt: z.string().datetime(), expiresAt: z.string().datetime(),
}).strict();
export interface DispatchBinding { requestDigest: string; admittedDeadline: string }
export const readbackChallenge = () => randomBytes(24).toString("hex");

export async function bindDispatch(database: ExecutionDatabase, authority: WorkAuthorityRecord, prepare: Record<string, unknown>) {
  const [row] = await database.query("SELECT external_alpha_dispatch_bind($1::jsonb) AS r", [JSON.stringify({
    ownerId: authority.envelope.document.ownerId, policySha256: authority.envelope.document.policySha256,
    authorityId: authority.id, prepare, canonical: canonicalJson(prepare), requestDigest: digest(prepare),
  })]);
  const stored = row.r as { request_digest: string; admitted_deadline: string };
  return { requestDigest: stored.request_digest, admittedDeadline: new Date(stored.admitted_deadline).toISOString() };
}
export async function dispatchBinding(database: ExecutionDatabase, authority: WorkAuthorityRecord): Promise<DispatchBinding> {
  const [row] = await database.query(`SELECT request_digest,admitted_deadline FROM external_alpha_work_dispatch
    WHERE authority_id=$1 AND owner_id=$2 AND policy_sha256=$3`, [authority.id, authority.envelope.document.ownerId, authority.envelope.document.policySha256]);
  if (!row) throw Error("EXTERNAL_ALPHA_DISPATCH_BINDING_REQUIRED");
  return { requestDigest: String(row.request_digest), admittedDeadline: new Date(row.admitted_deadline as string).toISOString() };
}

/** Compatibility fields outside this attestation have no authority to settle
 * spend, declare quiescence or promote a verdict. Every request uses a nonce. */
export function verifyReadbackAttestation(raw: unknown, authority: WorkAuthorityRecord, receipt: unknown,
  keys: ReadonlyMap<string, KeyObject>, binding: DispatchBinding, challenge: string, now = Date.now()) {
  const wrapper = raw as { readbackAttestation?: unknown; readbackSignature?: unknown };
  const parsed = readbackAttestationSchema.safeParse(wrapper?.readbackAttestation);
  if (!parsed.success || typeof wrapper.readbackSignature !== "string" || !/^[A-Za-z0-9_-]{86}$/.test(wrapper.readbackSignature))
    throw Error("EXTERNAL_ALPHA_READBACK_UNVERIFIED");
  const a = parsed.data;
  const issued = Date.parse(a.issuedAt), expiry = Date.parse(a.expiresAt);
  const signed = Buffer.concat([Buffer.from(READBACK_DOMAIN), Buffer.from([0]), Buffer.from(digest(a), "ascii")]);
  if (a.challenge !== challenge || a.authorityId !== authority.id || a.authoritySha256 !== authority.documentSha256
    || a.requestId !== authority.requestId || a.receiptDigest !== digest(receipt) || a.spendDigest !== digest(a.spend)
    || a.requestDigest !== binding.requestDigest || a.admittedDeadline !== binding.admittedDeadline
    || issued > now + 10000 || issued < now - 120000 || expiry <= now || expiry <= issued || expiry > issued + 120000
    || ![...keys.values()].some(k => verify(null, signed, k, Buffer.from(wrapper.readbackSignature as string, "base64url"))))
    throw Error("EXTERNAL_ALPHA_READBACK_UNVERIFIED");
  return a;
}
