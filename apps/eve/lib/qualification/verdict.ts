import { createPublicKey, verify as cryptoVerify, type KeyObject } from "node:crypto";
import { z } from "zod";
import { canonical } from "../engineering/factory-producer-protocol.ts";

/**
 * Independent-verifier handoff. The verifier lives in separately administered
 * custody; this module only CONSUMES its public, signed, artifact-bound verdict.
 * Protected criteria, keys and answers never enter this process. It cannot
 * produce a PASS: a self-authored receipt is rejected structurally because the
 * verifier key set must be disjoint from every producer key set.
 */
const hex = (n: number) => z.string().regex(new RegExp("^[a-f0-9]{" + n + "}$"));
export const verdictSchema = z.object({
  schema: z.literal("myeve.qualification-verdict/v1"),
  verifierKeyId: z.string().min(1).max(120),
  projectSha256: hex(64), sourceSha256: hex(64),
  protectedSpecificationSha256: hex(64),
  candidateCommit: hex(40), candidateTree: hex(40),
  buildArtifactSha256: hex(64),
  outcome: z.enum(["PASS", "FAIL", "NOT_RUN"]),
  issuedAt: z.string().datetime(),
}).strict();
export type Verdict = z.infer<typeof verdictSchema>;
export type SignedVerdict = { verdict: Verdict; signatureBase64: string };
export type VerifierKey = { keyId: string; publicKeyPem: string; activeFrom: string; notAfter: string; revokedAt?: string };

export class VerdictRejected extends Error {
  constructor(readonly code: string) { super(code); }
}

export function verifyVerdict(input: {
  signed: SignedVerdict; verifierKeys: VerifierKey[]; producerKeyIds: string[]; producerPublicKeysPem: string[];
  expected: { projectSha256: string; sourceSha256: string; protectedSpecificationSha256: string;
    candidateCommit: string; candidateTree: string; buildArtifactSha256: string };
  now?: number;
}): Verdict {
  const parsed = verdictSchema.safeParse(input.signed?.verdict);
  if (!parsed.success) throw new VerdictRejected("QDEV_VERDICT_INVALID");
  const verdict = parsed.data;
  const keys = input.verifierKeys.filter(key => key.keyId === verdict.verifierKeyId);
  if (keys.length !== 1) throw new VerdictRejected("QDEV_VERDICT_UNKNOWN_VERIFIER_KEY");
  const key = keys[0];
  // Separation of duties: the signer can be neither a producer key id nor a producer key.
  const normalized = (pem: string) => createPublicKey(pem).export({ type: "spki", format: "der" }).toString("base64");
  if (input.producerKeyIds.includes(key.keyId) || input.producerPublicKeysPem.some(pem => normalized(pem) === normalized(key.publicKeyPem)))
    throw new VerdictRejected("QDEV_VERDICT_SELF_AUTHORED");
  const now = input.now ?? Date.now(), issued = Date.parse(verdict.issuedAt);
  if (issued < Date.parse(key.activeFrom) || issued > Date.parse(key.notAfter) || issued > now
    || (key.revokedAt && issued >= Date.parse(key.revokedAt)) || now > Date.parse(key.notAfter) || (key.revokedAt && now >= Date.parse(key.revokedAt)))
    throw new VerdictRejected("QDEV_VERDICT_KEY_WINDOW");
  let publicKey: KeyObject;
  try { publicKey = createPublicKey(key.publicKeyPem); } catch { throw new VerdictRejected("QDEV_VERDICT_KEY_INVALID"); }
  if (publicKey.asymmetricKeyType !== "ed25519") throw new VerdictRejected("QDEV_VERDICT_KEY_INVALID");
  const signature = Buffer.from(input.signed.signatureBase64, "base64");
  if (!cryptoVerify(null, Buffer.from(canonical(verdict)), publicKey, signature)) throw new VerdictRejected("QDEV_VERDICT_SIGNATURE");
  for (const field of Object.keys(input.expected) as (keyof typeof input.expected)[])
    if (verdict[field] !== input.expected[field]) throw new VerdictRejected("QDEV_VERDICT_BINDING_MISMATCH:" + field);
  if (verdict.outcome !== "PASS") throw new VerdictRejected("QDEV_VERDICT_" + verdict.outcome);
  return verdict;
}
