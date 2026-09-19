import { defineTool } from "eve/tools";
import { z } from "zod";
import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";

import { agentName,ownerName } from "../lib/owner";
import { ownerOnly } from "../lib/owner-gate";

export default defineTool({
  approval: ownerOnly,
  description: `Reply to an email in ${agentName()}'s inbox. Keeps the conversation in the same thread and quotes it for the recipient, so use this rather than send_email for any answer. Pass the messageId of the message you're answering (usually lastMessageId from read_email). Real mail going to a real person: state what you'll send and get a yes from ${ownerName()} first.`,
  inputSchema: z.object({
    messageId: z
      .string()
      .min(1)
      .describe("Message id to reply to, from read_email (lastMessageId answers the newest)."),
    text: z.string().min(1).describe("Plain-text reply body. Just your new text; the thread is quoted automatically."),
    replyAll: z
      .boolean()
      .default(false)
      .describe("Reply to everyone on the original, not just its sender."),
    cc: z.array(z.string().email()).max(25).optional().describe("Extra Cc addresses."),
    html: z.string().optional().describe("Optional HTML body. Always send text too."),
  }),
  async execute({ messageId, text, replyAll, cc, html }, ctx) {
    return denyUnqualifiedExecutor(ctx, "tool.reply_to_email");
  },
});
