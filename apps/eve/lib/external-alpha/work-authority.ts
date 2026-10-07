import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import { z } from "zod";
import { digest, pathSchema } from "../engineering/contract.ts";
import type { Work } from "../engineering/types.ts";
import type { ExecutionDatabase } from "../execution-types.ts";
import { externalAlphaLimits, type ExternalAlphaPolicy } from "./policy.ts";
import {
  alphaTasksCriteria,
  alphaTasksCriteriaSha256,
  alphaTasksProject,
  alphaTasksTupleSha256,
  assertCanonicalAlphaWork,
  deterministicUuid,
  sha256Hex,
} from "./work-tuple.ts";

export const WORK_AUTHORITY_SCHEMA = "MYEVE_EXTERNAL_ALPHA_WORK_AUTHORITY_V1";
export const WORK_AUTHORITY_DOMAIN = WORK_AUTHORITY_SCHEMA;
/** Seconds the authority may be consumed. 290 + 10 s clock tolerance stays
 * inside the 300 s Work allowance deadline enforced by the database. */
export const WORK_AUTHORITY_WINDOW_SECONDS = 290;

const hex64 = z.string().regex(/^[a-f0-9]{64}$/);
const sha40 = z.string().regex(/^[a-f0-9]{40}$/);
const uuid = z.string().uuid();
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
const ops = (o: number, m: number) =>
  z.object({ operations: z.literal(o), microusd: z.literal(m) }).strict();

export const workAuthoritySchema = z
  .object({
    schema: z.literal(WORK_AUTHORITY_SCHEMA),
    authorityId: uuid,
    idempotencyKey: hex64,
    singleUse: z.literal(true),
    cohortId: uuid,
    slot: z.enum(["1", "2"]),
    ownerId: z.string().min(1).max(200),
    policySha256: hex64,
    application: z
      .object({
        clientId: z.string().regex(/^external-alpha-[a-f0-9]{32}$/),
        projectId: z.string().regex(/^prj_[A-Za-z0-9]+$/),
      })
      .strict(),
    source: z
      .object({
        repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
        baseSha: sha40,
        treeSha: sha40,
        sourceDigest: hex64,
        allowedFiles: z.array(pathSchema).min(1).max(30),
        allowedFilesSha256: hex64,
      })
      .strict(),
    work: z
      .object({
        id: uuid,
        version: z.number().int().positive(),
        generation: z.number().int().positive(),
        title: z.string().min(1).max(160),
        objectiveSha256: hex64,
        criteriaSha256: hex64,
        criteriaCount: z.literal(10),
      })
      .strict(),
    project: z
      .object({
        name: z.literal(alphaTasksProject.name),
        task: z.literal(alphaTasksProject.task),
        criteriaSha256: z.literal(alphaTasksCriteriaSha256),
        tupleSha256: z.literal(alphaTasksTupleSha256),
      })
      .strict(),
    environment: z.literal("CLOUD_PRODUCTION"),
    executionProvider: z.literal("MYFACTORY_CLOUD_EXECUTION_V2"),
    harness: z
      .object({
        id: z.literal("myfactory-cloud-harness"),
        version: z.literal("1"),
      })
      .strict(),
    factoryVersion: hex64,
    model: z
      .object({
        provider: z.literal("vercel-ai-gateway/openai"),
        id: z.literal("openai/gpt-5.4-mini"),
      })
      .strict(),
    limits: z
      .object({
        work: ops(externalAlphaLimits.workOperations, externalAlphaLimits.workMicrousd),
        factory: ops(externalAlphaLimits.factoryOperations, externalAlphaLimits.factoryMicrousd),
        productiveSeconds: z.literal(externalAlphaLimits.productiveSeconds),
        candidates: z.literal(1),
        writers: z.literal(1),
      })
      .strict(),
    candidateWriter: z
      .object({
        candidateSlot: z.literal(1),
        writerId: uuid,
        requestId: uuid,
      })
      .strict(),
    verifier: z
      .object({
        id: z.literal("independent-exact-artifact-verifier"),
        verifiesExactArtifact: z.literal(true),
        trustProducer: z.literal(false),
        criteriaSha256: z.literal(alphaTasksCriteriaSha256),
      })
      .strict(),
    allowedEffects: z.tuple([
      z.literal("candidate.create"),
      z.literal("repository.read"),
      z.literal("sandbox.write"),
      z.literal("verification.request"),
    ]),
    forbiddenEffects: z.tuple([
      z.literal("deploy"),
      z.literal("merge"),
      z.literal("production"),
      z.literal("publication"),
      z.literal("repository.admin"),
      z.literal("secrets.mutate"),
      z.literal("workflows.mutate"),
    ]),
    issuedAt: iso,
    notBefore: iso,
    expiresAt: iso,
  })
  .strict();
export type WorkAuthorityDocument = z.infer<typeof workAuthoritySchema>;
export interface WorkAuthorityEnvelope {
  document: WorkAuthorityDocument;
  authoritySha256: string;
  signature: string;
  keyId: string;
}

/** Same ordering and encoding as lib/engineering/contract.ts digest(). */
export function canonicalJson(value: unknown): string {
  const sort = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, v]) => [k, sort(v)]),
      );
    return item;
  };
  return JSON.stringify(sort(value));
}
export const authorityDigest = (document: unknown) => digest(document);

export function uuidFromHex(hex: string) {
  const h = hex.slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export const authorityIdFor = (idempotencyKey: string) =>
  uuidFromHex(idempotencyKey);
export const requestIdFor = (authorityId: string) =>
  deterministicUuid("EXTERNAL_ALPHA_REQUEST_V1:" + authorityId);
export const writerIdFor = (authorityId: string) =>
  deterministicUuid("EXTERNAL_ALPHA_WRITER_V1:" + authorityId);

export const allowedFilesDigest = (files: readonly string[]) =>
  digest({ version: 1, files });
export function normalizeAllowedFiles(files: readonly string[]) {
  const parsed = z.array(pathSchema).min(1).max(30).parse([...files]);
  const sorted = [...new Set(parsed)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (sorted.length !== parsed.length) throw Error("EXTERNAL_ALPHA_FILES_DUPLICATE");
  return sorted;
}

export function toIso(date: Date) {
  const s = date.toISOString();
  if (!iso.safeParse(s).success) throw Error("EXTERNAL_ALPHA_TIME");
  return s;
}

/** Pure construction. The caller has already refreshed the Work row; the
 * database re-validates every bound field under row locks before storing. */
export function buildWorkAuthority(input: {
  policy: ExternalAlphaPolicy;
  work: Work;
  allowedFiles: readonly string[];
  now?: Date;
}): WorkAuthorityDocument {
  const { policy, work } = input;
  assertCanonicalAlphaWork(work, policy);
  const files = normalizeAllowedFiles(input.allowedFiles);
  const policySha256 = digest(policy);
  const idempotencyKey = digest({
    kind: "EXTERNAL_ALPHA_WORK_AUTHORITY_KEY_V1",
    policySha256,
    workId: work.id,
    workVersion: work.version,
    workGeneration: work.generation,
    tupleSha256: alphaTasksTupleSha256,
  });
  const authorityId = authorityIdFor(idempotencyKey);
  const now = input.now ?? new Date();
  const issuedAt = toIso(now);
  return workAuthoritySchema.parse({
    schema: WORK_AUTHORITY_SCHEMA,
    authorityId,
    idempotencyKey,
    singleUse: true,
    cohortId: policy.cohortId,
    slot: policy.slot,
    ownerId: policy.ownerId,
    policySha256,
    application: { clientId: policy.clientId, projectId: policy.projectId },
    source: {
      repository: policy.repository,
      baseSha: policy.baseSha,
      treeSha: policy.treeSha,
      sourceDigest: policy.sourceDigest,
      allowedFiles: files,
      allowedFilesSha256: allowedFilesDigest(files),
    },
    work: {
      id: work.id,
      version: work.version,
      generation: work.generation,
      title: work.title,
      objectiveSha256: sha256Hex(work.objective),
      criteriaSha256: alphaTasksCriteriaSha256,
      criteriaCount: alphaTasksCriteria.length,
    },
    project: {
      name: alphaTasksProject.name,
      task: alphaTasksProject.task,
      criteriaSha256: alphaTasksCriteriaSha256,
      tupleSha256: alphaTasksTupleSha256,
    },
    environment: "CLOUD_PRODUCTION",
    executionProvider: "MYFACTORY_CLOUD_EXECUTION_V2",
    harness: { id: "myfactory-cloud-harness", version: "1" },
    factoryVersion: policy.factoryVersion,
    model: { provider: policy.provider, id: policy.model },
    limits: {
      work: {
        operations: externalAlphaLimits.workOperations,
        microusd: externalAlphaLimits.workMicrousd,
      },
      factory: {
        operations: externalAlphaLimits.factoryOperations,
        microusd: externalAlphaLimits.factoryMicrousd,
      },
      productiveSeconds: externalAlphaLimits.productiveSeconds,
      candidates: 1,
      writers: 1,
    },
    candidateWriter: {
      candidateSlot: 1,
      writerId: writerIdFor(authorityId),
      requestId: requestIdFor(authorityId),
    },
    verifier: {
      id: "independent-exact-artifact-verifier",
      verifiesExactArtifact: true,
      trustProducer: false,
      criteriaSha256: alphaTasksCriteriaSha256,
    },
    allowedEffects: [
      "candidate.create",
      "repository.read",
      "sandbox.write",
      "verification.request",
    ],
    forbiddenEffects: [
      "deploy",
      "merge",
      "production",
      "publication",
      "repository.admin",
      "secrets.mutate",
      "workflows.mutate",
    ],
    issuedAt,
    notBefore: issuedAt,
    expiresAt: toIso(new Date(now.getTime() + WORK_AUTHORITY_WINDOW_SECONDS * 1000)),
  });
}

const signedBytes = (authoritySha256: string) =>
  Buffer.concat([
    Buffer.from(WORK_AUTHORITY_DOMAIN, "utf8"),
    Buffer.from([0]),
    Buffer.from(authoritySha256, "ascii"),
  ]);
export function publicKeyId(publicKey: KeyObject) {
  return createHash("sha256")
    .update(publicKey.export({ type: "spki", format: "der" }) as Buffer)
    .digest("hex");
}

/** Server-only signer. Absent or malformed key means no authority can be issued. */
export class WorkAuthoritySigner {
  readonly keyId: string;
  readonly publicKey: KeyObject;
  private readonly key: KeyObject;
  constructor(privateKeyPem: string) {
    let key: KeyObject;
    try {
      key = createPrivateKey(privateKeyPem);
    } catch {
      throw Error("EXTERNAL_ALPHA_SIGNING_KEY_REQUIRED");
    }
    if (key.asymmetricKeyType !== "ed25519")
      throw Error("EXTERNAL_ALPHA_SIGNING_KEY_REQUIRED");
    this.key = key;
    this.publicKey = createPublicKey(key);
    this.keyId = publicKeyId(this.publicKey);
  }
  static fromEnv(env: NodeJS.ProcessEnv = process.env) {
    const pem = env.MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY;
    if (!pem || typeof window !== "undefined")
      throw Error("EXTERNAL_ALPHA_SIGNING_KEY_REQUIRED");
    return new WorkAuthoritySigner(pem.replaceAll("\\n", "\n"));
  }
  sign(document: WorkAuthorityDocument): WorkAuthorityEnvelope {
    const parsed = workAuthoritySchema.parse(document);
    const authoritySha256 = authorityDigest(parsed);
    return {
      document: parsed,
      authoritySha256,
      signature: sign(null, signedBytes(authoritySha256), this.key).toString("base64url"),
      keyId: this.keyId,
    };
  }
}
/** Independent verification used by tests and by any MyEve-side re-check. The
 * Factory implements the same algorithm against its own pinned keys. */
export function verifyWorkAuthority(
  envelope: unknown,
  pinnedKeys: ReadonlyMap<string, KeyObject>,
  now = Date.now(),
): WorkAuthorityDocument {
  const e = z
    .object({
      document: z.unknown(),
      authoritySha256: hex64,
      signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
      keyId: hex64,
    })
    .strict()
    .safeParse(envelope);
  if (!e.success) throw Error("AUTHORITY_SCHEMA");
  const doc = workAuthoritySchema.safeParse(e.data.document);
  if (!doc.success) throw Error("AUTHORITY_SCHEMA");
  const key = pinnedKeys.get(e.data.keyId);
  if (
    !key ||
    authorityDigest(doc.data) !== e.data.authoritySha256 ||
    !verify(null, signedBytes(e.data.authoritySha256), key, Buffer.from(e.data.signature, "base64url"))
  )
    throw Error("AUTHORITY_SIGNATURE");
  if (now < Date.parse(doc.data.notBefore)) throw Error("AUTHORITY_NOT_YET_VALID");
  if (now >= Date.parse(doc.data.expiresAt)) throw Error("AUTHORITY_EXPIRED");
  if (
    doc.data.authorityId !== authorityIdFor(doc.data.idempotencyKey) ||
    doc.data.candidateWriter.requestId !== requestIdFor(doc.data.authorityId) ||
    doc.data.candidateWriter.writerId !== writerIdFor(doc.data.authorityId)
  )
    throw Error("AUTHORITY_IDENTIFIER");
  return doc.data;
}

export type AuthorityState =
  | "ISSUED"
  | "DISPATCHING"
  | "CONSUMED"
  | "UNKNOWN"
  | "REVOKED"
  | "EXPIRED"
  | "CANCELLED"
  | "COMPLETED";
export interface WorkAuthorityRecord {
  id: string;
  allowanceId: string;
  state: AuthorityState;
  requestId: string;
  writerId: string;
  workId: string;
  workVersion: number;
  workGeneration: number;
  documentSha256: string;
  expiresAt: string;
  envelope: WorkAuthorityEnvelope;
  receipt: unknown;
}
function record(row: Record<string, any>): WorkAuthorityRecord {
  return {
    id: row.id,
    allowanceId: row.allowance_id,
    state: row.state,
    requestId: row.request_id,
    writerId: row.writer_id,
    workId: row.work_id,
    workVersion: Number(row.work_version),
    workGeneration: Number(row.work_generation),
    documentSha256: row.document_sha256,
    expiresAt: new Date(row.expires_at).toISOString(),
    envelope: {
      document: workAuthoritySchema.parse(row.document),
      authoritySha256: row.document_sha256,
      signature: row.signature,
      keyId: row.key_id,
    },
    receipt: row.receipt ?? null,
  };
}

export interface FactoryOperationReport {
  operationId: string;
  phase: "productive" | "completion";
  state: "settled" | "unknown";
  actualMicrousd: number | null;
  reservedMicrousd: number;
  model: string;
  pricingRevision: string;
}

/** Database-only authority lifecycle. Every mutation is one SQL function under
 * the policy row lock, so nothing is minted, claimed or consumed outside a
 * transaction and a duplicate delivery resolves to the same record. */
export class ExternalAlphaWorkAuthority {
  constructor(
    readonly database: ExecutionDatabase,
    readonly policy: ExternalAlphaPolicy,
    readonly signer: WorkAuthoritySigner,
  ) {}
  private async call<T = any>(name: string, payload: Record<string, unknown>) {
    const [row] = await this.database.query(
      `SELECT external_alpha_${name}($1::jsonb) AS receipt`,
      [
        JSON.stringify({
          ...payload,
          ownerId: this.policy.ownerId,
          policySha256: digest(this.policy),
        }),
      ],
    );
    if (!row?.receipt) throw Error("EXTERNAL_ALPHA_RECEIPT_REQUIRED");
    return row.receipt as T;
  }
  /** Idempotent on the deterministic key. A refresh, reconnect or duplicate
   * delivery returns the original record and never a second authority. */
  async issue(
    work: Work,
    allowedFiles: readonly string[],
    options: { now?: Date; effect?: { sessionId: string; callId: string } } = {},
  ): Promise<WorkAuthorityRecord> {
    const document = buildWorkAuthority({
      policy: this.policy,
      work,
      allowedFiles,
      now: options.now,
    });
    const envelope = this.signer.sign(document);
    const row = await this.call<Record<string, any>>("work_admit", {
      document,
      canonical: canonicalJson(document),
      documentSha256: envelope.authoritySha256,
      signature: envelope.signature,
      keyId: envelope.keyId,
      allowanceId: randomUUID(),
      effectSessionId: options.effect?.sessionId,
      effectCallId: options.effect?.callId,
    });
    const stored = record(row);
    // Never trust the round trip: re-verify what the database returned.
    verifyWorkAuthority(stored.envelope, new Map([[this.signer.keyId, this.signer.publicKey]]), Date.parse(stored.envelope.document.issuedAt));
    if (
      stored.id !== document.authorityId ||
      stored.envelope.document.idempotencyKey !== document.idempotencyKey
    )
      throw Error("EXTERNAL_ALPHA_ADMISSION_DENIED");
    return stored;
  }
  /** Exactly one caller receives claimed=true and may send. */
  async claim(authority: WorkAuthorityRecord) {
    const receipt = await this.call<{ claimed: boolean; authority: Record<string, any> }>(
      "work_claim",
      {
        authorityId: authority.id,
        requestId: authority.requestId,
        documentSha256: authority.documentSha256,
      },
    );
    return { claimed: receipt.claimed === true, authority: record(receipt.authority) };
  }
  async finish(
    authorityId: string,
    state: "CONSUMED" | "UNKNOWN" | "COMPLETED" | "CANCELLED" | "EXPIRED" | "REVOKED",
    extra: { receipt?: unknown; reason?: string } = {},
  ) {
    return record(
      await this.call<Record<string, any>>("work_finish", { authorityId, state, ...extra }),
    );
  }
  async forWork(workId: string): Promise<WorkAuthorityRecord | null> {
    const [row] = await this.database.query(
      "SELECT * FROM external_alpha_work_authority WHERE owner_id=$1 AND work_id=$2 AND policy_sha256=$3",
      [this.policy.ownerId, workId, digest(this.policy)],
    );
    return row ? record(row) : null;
  }
  sweep() {
    return this.call<{ expired: number; revoked: number; unknown: number }>("work_sweep", {});
  }
  /** Records one Factory-reported model operation into the shared allowance
   * ledger. Exact-once per (allowance, step); UNKNOWN stays charged. */
  recordFactoryOperation(authority: WorkAuthorityRecord, op: FactoryOperationReport) {
    return this.call<Record<string, any>>("factory_record", {
      id: randomUUID(),
      authorityId: authority.id,
      allowanceId: authority.allowanceId,
      source: op.phase === "completion" ? "FACTORY_COMPLETION" : "FACTORY_PRODUCTIVE",
      stepKey: `factory:${op.operationId}:0`,
      requestSha256: digest({
        authorityId: authority.id,
        operationId: op.operationId,
        phase: op.phase,
        model: op.model,
        pricingRevision: op.pricingRevision,
      }),
      state: op.state === "settled" ? "SETTLED" : "UNKNOWN",
      microusd: op.state === "settled" ? op.actualMicrousd : op.reservedMicrousd,
      result: { phase: op.phase, model: op.model, pricingRevision: op.pricingRevision },
    });
  }
}
