import { createHash, randomUUID } from "node:crypto";

import { put } from "@vercel/blob";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { redactEvidenceText, QA_SPECIALISTS } from "../../lib/task-types.ts";
import { recordTaskArtifact } from "../../lib/task-runs.ts";
import { getComputerSandbox } from "../lib/computer-context.ts";

const MAX_BYTES = 20 * 1024 * 1024;
const TEXT_CONTENT = /^(?:text\/|application\/(?:json|xml))/i;

export default defineTool({
  description:
    "Store private, attributable QA evidence in Vercel Blob and attach its metadata to a task acceptance check. Evidence is mandatory before a required check can pass. Never capture secrets, cookies, tokens, passwords, or private form values.",
  inputSchema: z.object({
    taskId: z.string().startsWith("task_"),
    role: z.enum(QA_SPECIALISTS.map((item) => item.role)),
    checkSlug: z.string().min(1).max(100),
    status: z.enum(["passed", "failed", "blocked"]),
    summary: z.string().min(1).max(2000),
    kind: z.enum(["screenshot", "report", "log", "json"]),
    path: z.string().min(1).describe("Sandbox path containing the evidence artifact"),
    contentType: z.string().min(1).max(160),
  }),
  async execute(input, ctx) {
    const sandbox = await getComputerSandbox(ctx);
    const source = await sandbox.readBinaryFile({ path: input.path });
    if (source === null) throw new Error(`No evidence file at ${sandbox.resolvePath(input.path)}.`);
    if (source.byteLength > MAX_BYTES) throw new Error("Evidence artifacts must be 20 MB or smaller.");

    const bytes = TEXT_CONTENT.test(input.contentType)
      ? Buffer.from(redactEvidenceText(Buffer.from(source).toString("utf8")), "utf8")
      : Buffer.from(source);
    const filename = input.path.split("/").filter(Boolean).at(-1) ?? `${input.kind}.bin`;
    const artifactSeed = randomUUID();
    const storageKey = `task-evidence/${input.taskId}/${input.role}/${artifactSeed}-${filename}`;
    const stored = await put(storageKey, bytes, {
      access: "private",
      addRandomSuffix: false,
      contentType: input.contentType,
    });
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const result = await recordTaskArtifact({
      taskId: input.taskId,
      sessionId: ctx.session.id,
      role: input.role,
      checkSlug: input.checkSlug,
      status: input.status,
      summary: input.summary,
      kind: input.kind,
      filename,
      contentType: input.contentType,
      storageKey: stored.pathname,
      sizeBytes: bytes.byteLength,
      sha256,
    });
    return {
      ...result,
      filename,
      sizeBytes: bytes.byteLength,
      sha256,
      private: true,
    };
  },
});
