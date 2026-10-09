import { verify } from "node:crypto";
import { z } from "zod";
import { digest } from "./transport.ts";
import { FederationStore } from "./store.ts";

const bundleSchema = z
  .object({
    schemaVersion: z.literal("relay.audit-export.v1"),
    accountId: z.string(),
    exportedAt: z.string(),
    finalSequence: z.number().int().nonnegative(),
    finalHash: z.string().nullable(),
    exportSigningKeyId: z.string(),
    exportSignature: z.string(),
    signingKeys: z.array(z.unknown()),
    records: z.array(z.record(z.string(), z.unknown())).max(10000),
  })
  .strict();
const optionalFields = [
  "actorPrincipalId",
  "agentId",
  "runtimeClientId",
  "taskId",
  "actionIntentId",
  "policyDecisionId",
  "approvalDecisionId",
  "leaseId",
  "provider",
];
export function verifyReceiptBundle(
  value: unknown,
  expected: { ownerId: string; keyId: string; publicKey: string },
) {
  const bundle = bundleSchema.parse(value);
  if (
    bundle.accountId !== expected.ownerId ||
    bundle.exportSigningKeyId !== expected.keyId
  )
    throw new Error("Wrong receipt owner or signing key.");
  const signature = (hash: string, sig: unknown) =>
    typeof sig === "string" &&
    verify(
      null,
      Buffer.from(hash),
      expected.publicKey,
      Buffer.from(sig, "base64url"),
    );
  const manifest = {
    schemaVersion: bundle.schemaVersion,
    accountId: bundle.accountId,
    exportedAt: bundle.exportedAt,
    finalSequence: bundle.finalSequence,
    finalHash: bundle.finalHash,
  };
  if (!signature(`sha256:${digest(manifest)}`, bundle.exportSignature))
    throw new Error("Invalid signed receipt manifest.");
  let previous: string | null = null;
  for (const [index, record] of bundle.records.entries()) {
    if (
      record.accountId !== expected.ownerId ||
      record.signingKeyId !== expected.keyId ||
      record.sequence !== index + 1 ||
      record.previousHash !== previous
    )
      throw new Error("Receipt chain mismatch.");
    const material: Record<string, unknown> = {
      id: record.id,
      accountId: record.accountId,
      sequence: record.sequence,
      eventType: record.eventType,
      outcome: record.outcome,
      occurredAt: new Date(String(record.occurredAt)).toISOString(),
      details: record.details,
      previousHash: record.previousHash,
    };
    for (const field of optionalFields)
      if (record[field] != null) material[field] = record[field];
    const hash = `sha256:${digest(material)}`;
    if (hash !== record.recordHash || !signature(hash, record.signature))
      throw new Error("Receipt signature is invalid.");
    previous = hash;
  }
  if (
    bundle.finalHash !== previous ||
    bundle.finalSequence !== bundle.records.length
  )
    throw new Error("Incomplete receipt chain.");
  return bundle;
}
export async function importReceipts(store: FederationStore, value: unknown) {
  const connection = await store.connection();
  const bundle = verifyReceiptBundle(value, connection);
  let imported = 0;
  for (const record of bundle.records) {
    if (
      record.eventType !== "federation.disclosure" &&
      record.eventType !== "federation.request.denied"
    )
      continue;
    const rows = await store.database.query(
      "INSERT INTO myeve_relay_receipts(id,owner_id,relay_account_id,sequence,record) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(id) DO NOTHING RETURNING id",
      [
        record.id,
        store.ownerId,
        bundle.accountId,
        record.sequence,
        JSON.stringify(record),
      ],
    );
    imported += rows.length;
  }
  return { imported, verifiedChainLength: bundle.records.length };
}
