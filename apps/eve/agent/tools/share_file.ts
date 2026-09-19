import { defineTool } from "eve/tools";
import { z } from "zod";
import { ownerName } from "../lib/owner";
import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";

// Bridges the sandbox filesystem to the owner: the sandbox is invisible to them,
// so files the agent creates there (reports, exports, images, archives) get
// uploaded to public Vercel Blob storage and handed over as a download link.

const MAX_BYTES = 50 * 1024 * 1024;

export default defineTool({
  description: `Share a file from your sandbox with ${ownerName()}: upload it to file storage and return a public download URL. Use this whenever you create a file they should receive (a report, CSV export, image, PDF, zip) instead of pasting its contents into chat. Give them the returned URL as a markdown link.`,
  inputSchema: z.object({
    path: z
      .string()
      .min(1)
      .describe('Sandbox path of the file, e.g. "report.csv" or "/workspace/out/summary.pdf".'),
    contentType: z
      .string()
      .optional()
      .describe('MIME type for the download, e.g. "application/pdf". Inferred when omitted.'),
  }),
  async execute({ path, contentType }, ctx) {
    return denyUnqualifiedExecutor(ctx, "tool.share_file");
  },
});
