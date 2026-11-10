import { createPublicKey } from "node:crypto";
import { z } from "zod";
import { HOSTED_PROFILE, hostedMarkerPresent, hostedOwnerScope, mailboxFetch, type MailboxBinding, type MailboxDb } from "../engineering/factory-mailbox.ts";
import { factoryTransportFetch } from "../engineering/factory-transport.ts";
import type { FactoryConnection } from "../engineering/factory-live-adapter.ts";
import { externalAlphaFamilyAllowed } from "../external-alpha/features.ts";
import { externalAlphaProjectSlot } from "../external-alpha/policy.ts";
import { QDEV_LIMITS, type QualificationPolicy } from "../external-alpha/qualification-accounting.ts";

/**
 * HOSTED private-beta profile (owner, then testers), separate from the owner-local `myeve.private-beta.owner/v1`.
 *
 * Hosted MyEve (Vercel) never runs code: MyFactory on the owner's Mac is the only execution engine, reached through the outbound-only
 * mailbox. This profile pins what a hosted installation may use, and nothing here can be widened at runtime:
 *  - Relay and MissionControl are https origins (never loopback, never a `.invalid` local issuer);
 *  - the Factory and the local verifier are the Mac's exact loopback origins, reached ONLY through the `mailbox` transport;
 *  - spend is metered: the Factory connection must be the metered LIVE route with enforced spend and a reviewed Work ledger contract.
 *    OWNER_SUBSCRIPTION_LOCAL / SUBSCRIPTION_UNMETERED is refused (it stays owner-local only);
 *  - verifier assurance is PRIVATE_BETA_LOCAL, always shown with its fixed label: automated checks on the owner's machine, not independent custody;
 *  - limits: $1.30 per Work and 4 Works per person, with no automatic increase (equal to the frozen QDEV_LIMITS; any larger policy is refused).
 * It is read from one non-secret JSON env value (MYEVE_HOSTED_PROFILE). Secrets (poller credential hash, Blob token) are not part of it.
 */
export { HOSTED_PROFILE };
export const HOSTED_ASSURANCE = "PRIVATE_BETA_LOCAL" as const;
export const HOSTED_ASSURANCE_LABEL = "automated checks on the owner's machine, not independent custody" as const;
export { HOSTED_VERIFIER_LABEL } from "./journey-profile.ts";
export const HOSTED_LIMITS = { perWorkMicrousd: 1_300_000, maxWorksPerPerson: 4, journeyMicrousd: 5_200_000, automaticIncrease: false } as const;

const id = z.string().regex(/^[A-Za-z0-9._:@|-]{1,160}$/);
const scopeId = z.string().regex(/^[A-Za-z0-9._-]{1,100}$/);
const timestamp = z.string().datetime();
const httpsOrigin = z.string().url().refine(value => {
  try { const u = new URL(value); return u.protocol === "https:" && u.origin === value && !u.port && !u.hostname.endsWith(".invalid")
    && !/^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(u.hostname); } catch { return false; }
}, "an https origin is required");
const macLoopbackOrigin = z.string().refine(value => {
  try { const u = new URL(value); return u.protocol === "http:" && u.hostname === "127.0.0.1" && !!u.port && u.origin === value; } catch { return false; }
}, "the exact Mac loopback origin is required");
const hex = (n: number) => z.string().regex(new RegExp(`^[a-f0-9]{${n}}$`));
const buildIssuer = z.object({
  keyId: id, purpose: z.literal("STATIC_BUILD_PROVENANCE_V1"), ownerId: id, factoryId: id, factoryVersion: hex(64), buildProfileDigest: hex(64),
  publicKeyPem: z.string().min(1).max(4096), spkiSha256: hex(64), notBefore: timestamp, notAfter: timestamp, revoked: z.literal(false),
}).strict();
const verifierKey = z.object({ keyId: id, publicKeyPem: z.string().min(1).max(4096), activeFrom: timestamp, notAfter: timestamp, revokedAt: timestamp.optional() }).strict();

export const hostedProfileSchema = z.object({
  profile: z.literal(HOSTED_PROFILE),
  role: z.enum(["OWNER", "TESTER"]),
  ownerId: scopeId, installationId: scopeId,
  relayOrigin: httpsOrigin, missionControlOrigin: httpsOrigin,
  /** This hosted MyEve origin: the private preview is observed (re-verified, server-side) under it; nothing is public. */
  servedOrigin: httpsOrigin,
  /** Mac-side static build: the hosted side only pins the app id, the build pins it derives the expected binding from, and the PUBLIC issuer key. */
  build: z.object({ appId: z.string().regex(/^[A-Za-z0-9._:-]{1,160}$/), lockSha256: hex(64), buildProfileDigest: hex(64), issuer: buildIssuer }).strict(),
  factory: z.object({
    transport: z.literal("MAILBOX"), factoryOrigin: macLoopbackOrigin, verifierOrigin: macLoopbackOrigin,
    /** The Mac-local qualification Relay (remote capability leases), reached only through the mailbox `relay` target. */
    relayOrigin: macLoopbackOrigin,
    /** MyFactory counts the 4-Work limit per (client, ownerScope): one distinct, stable scope per person = per hosted installation. */
    ownerScope: z.string().regex(/^[A-Za-z0-9._:-]{1,255}$/),
    spend: z.literal("METERED"), qualificationMode: z.literal("LIVE"),
  }).strict(),
  verifier: z.object({
    assurance: z.literal(HOSTED_ASSURANCE), label: z.literal(HOSTED_ASSURANCE_LABEL),
    keys: z.array(verifierKey).min(1).max(4), producerKeyIds: z.array(id).max(8), producerPublicKeysPem: z.array(z.string().min(1).max(4096)).max(8),
  }).strict(),
  limits: z.object({
    perWorkMicrousd: z.literal(HOSTED_LIMITS.perWorkMicrousd), maxWorksPerPerson: z.literal(HOSTED_LIMITS.maxWorksPerPerson),
    automaticIncrease: z.literal(false),
  }).strict(),
}).strict().refine(p => new Set([p.factory.factoryOrigin, p.factory.verifierOrigin, p.factory.relayOrigin]).size === 3, "Factory, verifier and Relay are separate hosts")
  .refine(p => p.factory.ownerScope === hostedOwnerScope(p), "ownerScope must be the installation's stable per-person scope")
  .refine(p => p.build.issuer.ownerId === p.ownerId && p.build.issuer.buildProfileDigest === p.build.buildProfileDigest, "build issuer must be the owner's, for the pinned build profile");
export type HostedProfile = z.infer<typeof hostedProfileSchema>;
export { hostedOwnerScope, hostedMarkerPresent };

type TrustKey = { keyId: string; publicKeyPem: string; activeFrom: string; notAfter: string; revokedAt?: string };
/**
 * One verifier trust set, normalized for comparison: key id, the public key's SPKI DER (so PEM formatting cannot differ), and the validity
 * window and revocation as instants. Two sets are the same trust only if every normalized record is identical (ids alone are not enough).
 * Throws on an unparsable key or instant (callers treat that as a refusal).
 */
export function normalizedVerifierTrust(keys: readonly TrustKey[]): string {
  const instant = (value: string | undefined) => {
    if (value === undefined) return null;
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) throw new HostedProfileRefused("HOSTED_VERIFIER_TRUST_INSTANT");
    return new Date(ms).toISOString();
  };
  const records = keys.map(k => ({ keyId: k.keyId, spki: createPublicKey(k.publicKeyPem).export({ type: "spki", format: "der" }).toString("base64"),
    activeFrom: instant(k.activeFrom), notAfter: instant(k.notAfter), revokedAt: instant(k.revokedAt) }));
  if (new Set(records.map(r => r.keyId)).size !== records.length) throw new HostedProfileRefused("HOSTED_VERIFIER_TRUST_DUPLICATE");
  return JSON.stringify(records.sort((a, b) => a.keyId < b.keyId ? -1 : a.keyId > b.keyId ? 1 : 0));
}
export function sameVerifierTrust(a: readonly TrustKey[], b: readonly TrustKey[]): boolean {
  try { return normalizedVerifierTrust(a) === normalizedVerifierTrust(b); } catch { return false; }
}

export class HostedProfileRefused extends Error { constructor(readonly code: string) { super(code); } }
const refuse = (code: string): never => { throw new HostedProfileRefused(code); };

/** The configured hosted profile, or null when this deployment is not a hosted private-beta installation (every hosted route then 404s). */
export function hostedProfileFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): HostedProfile | null {
  const raw = env.MYEVE_HOSTED_PROFILE;
  if (!raw) return null;
  try {
    const profile = hostedProfileSchema.parse(JSON.parse(raw));
    // The deployment owner is the profile owner; a profile for another owner keeps the installation disabled.
    if (env.MYEVE_OWNER_ID && env.MYEVE_OWNER_ID !== profile.ownerId) return null;
    return profile;
  } catch { return null; }
}
/** Only the explicitly enrolled tester installation can run the hosted journey. */
export function hostedTesterProfile(env: NodeJS.ProcessEnv = process.env): HostedProfile | null {
  if (env.MYEVE_QDEV_ENABLED !== "true" || !externalAlphaFamilyAllowed("HOSTED_PRIVATE_BETA", env)) return null;
  const slot = externalAlphaProjectSlot(env), profile = hostedProfileFromEnv(env);
  return slot && profile?.role === "TESTER" && profile.installationId === `tester-${slot}` ? profile : null;
}

export const hostedBinding = (profile: HostedProfile): MailboxBinding => ({ installationId: profile.installationId, ownerId: profile.ownerId });

/** A hosted Factory connection must be the metered LIVE loopback route at the profile's Factory origin, with enforced spend and a Work ledger contract. */
export function requireHostedFactoryConnection(profile: HostedProfile, connection: FactoryConnection): FactoryConnection {
  if ("transport" in connection || !("repositoryPath" in connection)) return refuse("HOSTED_FACTORY_LOOPBACK_CONNECTION");
  if (new URL(connection.origin).origin !== profile.factory.factoryOrigin) return refuse("HOSTED_FACTORY_ORIGIN");
  if (connection.qualification.scopeId !== profile.factory.ownerScope || (connection.evidence && connection.evidence.ownerScope !== profile.factory.ownerScope))
    return refuse("HOSTED_FACTORY_OWNER_SCOPE");
  if (connection.qualification.mode !== profile.factory.qualificationMode || connection.qualification.spendEnforced !== true) return refuse("HOSTED_FACTORY_METERED_ONLY");
  if (!connection.spendContract || connection.spendContract.sourceDigest !== connection.sourceDigest) return refuse("HOSTED_FACTORY_SPEND_CONTRACT");
  return connection;
}

/** Hosted accounting policy: never above $1.30 per Work, 4 Works per person or $5.20 in total; no automatic increase is representable. */
export function requireHostedPolicy(profile: HostedProfile, policy: QualificationPolicy): QualificationPolicy {
  const limits = (policy as { limits?: { perWorkMicrousd?: number; maxWorks?: number; journeyMicrousd?: number } }).limits;
  if (!limits || policy.ownerId !== profile.ownerId) return refuse("HOSTED_POLICY_OWNER");
  if (QDEV_LIMITS.perWorkMicrousd !== HOSTED_LIMITS.perWorkMicrousd || QDEV_LIMITS.maxWorks !== HOSTED_LIMITS.maxWorksPerPerson) return refuse("HOSTED_POLICY_LIMITS");
  if (!Number.isSafeInteger(limits.perWorkMicrousd) || limits.perWorkMicrousd! > HOSTED_LIMITS.perWorkMicrousd
    || !Number.isSafeInteger(limits.maxWorks) || limits.maxWorks! > HOSTED_LIMITS.maxWorksPerPerson
    || !Number.isSafeInteger(limits.journeyMicrousd) || limits.journeyMicrousd! > HOSTED_LIMITS.journeyMicrousd) return refuse("HOSTED_POLICY_LIMITS");
  return policy;
}

/**
 * The hosted transports: Factory (and its ordered-admission receiver, same supervisor origin) and the local verifier through the mailbox.
 * Owner-local installations never call this; their loopback transport is unchanged.
 */
export function hostedTransports(profile: HostedProfile, db: MailboxDb, connection: FactoryConnection) {
  const factory = requireHostedFactoryConnection(profile, connection), binding = hostedBinding(profile);
  const mailbox = (timeoutMs: number) => ({ kind: "mailbox" as const, profile: HOSTED_PROFILE, db, binding, target: "factory" as const, timeoutMs });
  return {
    factoryFetch: factoryTransportFetch(factory, mailbox(15_000)),
    capabilityFetch: factoryTransportFetch(factory, mailbox(5_000)),
    // The verifier keeps its own per-request credential header; the mailbox only carries it to the pinned verifier loopback origin.
    verifierFetch: mailboxFetch(db, binding, "verifier", profile.factory.verifierOrigin, { timeoutMs: 60_000 }),
    // Relay lease/admission calls go to the Mac-local Relay through the same mailbox (no inbound path to the Mac, no hosted Relay coordination).
    relayFetch: mailboxFetch(db, binding, "relay", profile.factory.relayOrigin, { timeoutMs: 15_000 }),
    assurance: { assurance: HOSTED_ASSURANCE, label: HOSTED_ASSURANCE_LABEL },
  };
}
