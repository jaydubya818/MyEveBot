import { defineTool } from "eve/tools";
import { z } from "zod";
import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";

import { agentName } from "../lib/owner";
import { ownerOnly } from "../lib/owner-gate";

// AgentMail keeps mailbox state in labels: `unread` is the read flag and
// `trash` is the trash folder, so one label tool covers organising, marking
// read, and throwing mail away.

export default defineTool({
  approval: ownerOnly,
  description: `Organise a conversation in ${agentName()}'s inbox by changing its labels. Labels are how this mailbox stores state: add "trash" to throw a thread away (removing it restores it), remove "unread" to mark it read, and add your own tags to group threads for later. Use plain kebab-case names.`,
  inputSchema: z.object({
    threadId: z.string().min(1).describe("Thread id from list_emails or search_emails."),
    add: z
      .array(z.string().min(1).max(60))
      .max(10)
      .optional()
      .describe('Labels to add, e.g. ["trash"] or ["invoices"].'),
    remove: z
      .array(z.string().min(1).max(60))
      .max(10)
      .optional()
      .describe('Labels to remove, e.g. ["unread"] to mark read or ["trash"] to restore.'),
  }),
  async execute({ threadId, add, remove }, gatewayContext) {
    return denyUnqualifiedExecutor(gatewayContext, "tool.label_email");
  },
});
