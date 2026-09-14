import { createHash, randomUUID } from "node:crypto";

import { put } from "@vercel/blob";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { getComputerSessionForRuntime, recordComputerArtifact } from "../../lib/computer-sessions.ts";
import { redactEvidenceText } from "../../lib/task-types.ts";
import { computerOwnerId, requireComputerCapability } from "../lib/computer-context.ts";

const TEXT_CONTENT = /^(?:text\/|application\/(?:json|xml))/i;

export default defineTool({
  description: "Persist a meaningful screenshot, download, report, log, or file from the current computer session as private evidence. Do not upload secrets, credentials, cookies, or hidden chain-of-thought.",
  inputSchema: z.object({
    path: z.string().min(1),
    kind: z.enum(["screenshot", "download", "report", "file", "log", "json"]),
    contentType: z.string().min(1).max(160),
    actionId: z.string().startsWith("computer_action_").optional(),
  }),
  async execute(input, ctx) {
    const ownerId = computerOwnerId(ctx);
    const { session } = await requireComputerCapability(ctx, "files.write");
    const current = await getComputerSessionForRuntime(ownerId, ctx.session.id);
    if (!current || current.id !== session.id) throw new Error("Computer session changed before artifact capture.");
    const sandbox = await ctx.getSandbox();
    const source = await sandbox.readBinaryFile({ path: input.path, abortSignal: ctx.abortSignal });
    if (source === null) throw new Error(`No artifact exists at ${sandbox.resolvePath(input.path)}.`);
    if (source.byteLength > session.resourceLimits.maxFileBytes) throw new Error(`Artifact exceeds the ${session.resourceLimits.maxFileBytes}-byte session limit.`);
    const bytes = TEXT_CONTENT.test(input.contentType)
      ? Buffer.from(redactEvidenceText(Buffer.from(source).toString("utf8")), "utf8")
      : Buffer.from(source);
    const filename = input.path.split("/").filter(Boolean).at(-1) ?? "artifact.bin";
    const storageKey = `computer-evidence/${session.ownerId}/${session.id}/${randomUUID()}-${filename}`;
    const stored = await put(storageKey, bytes, { access: "private", addRandomSuffix: false, contentType: input.contentType });
    const artifact = await recordComputerArtifact({
      ownerId, sessionId: session.id, actionId: input.actionId, kind: input.kind, filename,
      contentType: input.contentType, storageKey: stored.pathname, sizeBytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    return { artifact, private: true };
  },
});
