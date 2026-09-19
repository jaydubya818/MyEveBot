import { z } from "zod";
import {
  entrySchema,
  knowledgeResponseSchema,
  recordSchema,
} from "./contracts.ts";
import type { Envelope } from "./transport.ts";

export type PublishedRecord = z.infer<typeof recordSchema>;
export interface PublishedReader {
  read(input: {
    viewId: string;
    version: number;
    reference: string;
    revision: string;
    callerOwnerId: string;
    callerAgentId: string;
  }): Promise<PublishedRecord | null>;
}

// Intentionally no database, canonical knowledge, memory, workspace, tool,
// conversation, or general Sofie runtime dependency is reachable from this module.
export async function answerPublished(
  envelope: Envelope,
  reader: PublishedReader,
) {
  if (envelope.capability !== "knowledge.query")
    throw new Error("Not a knowledge query.");
  const payload = z
    .object({
      mode: z.literal("RECORD_RETRIEVAL"),
      query: z.string().max(4000),
      requestedTypes: z.array(z.string()),
      topics: z.array(z.string()),
      maxRecords: z.number().int().min(1).max(50),
    })
    .strict()
    .parse(envelope.payload);
  const publication = z
    .object({
      viewId: z.string(),
      version: z.number().int().positive(),
      visibility: z.enum(["SHARED", "UNLISTED", "PUBLIC"]),
      provenancePolicy: z.literal("SOURCE_REFERENCES_REQUIRED"),
      entries: z.array(entrySchema).max(50),
    })
    .strict()
    .parse(envelope.publication);
  if (
    publication.viewId !== envelope.resource ||
    publication.entries.length > payload.maxRecords
  )
    throw new Error("Invalid published projection.");
  const records: PublishedRecord[] = [];
  for (const entry of publication.entries) {
    if (!payload.requestedTypes.includes(entry.recordType))
      throw new Error("Record type is not requested.");
    const record = await reader.read({
      viewId: publication.viewId,
      version: publication.version,
      reference: entry.reference,
      revision: entry.revision,
      callerOwnerId: envelope.caller.ownerId,
      callerAgentId: envelope.caller.agentId,
    });
    if (!record) continue;
    const parsed = recordSchema.parse(record);
    if (
      parsed.reference !== entry.reference ||
      parsed.revision !== entry.revision ||
      parsed.recordType !== entry.recordType
    )
      throw new Error("Publication record mismatch.");
    records.push(parsed);
  }
  return knowledgeResponseSchema.parse({
    kind: "OWNER_PUBLISHED_KNOWLEDGE",
    publicationVersion: publication.version,
    records,
  });
}
