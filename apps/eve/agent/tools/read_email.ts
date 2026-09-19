import { defineTool } from "eve/tools";
import { z } from "zod";
import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";

import {
clipBody,
getEmailAddress,
getThread,
messageBody,
parseAddress,
} from "../lib/agentmail";
import { agentName } from "../lib/owner";
import { ownerOnly } from "../lib/owner-gate";

export default defineTool({
  approval: ownerOnly,
  description: `Read a full email conversation from ${agentName()}'s inbox: every message in the thread with its sender, recipients, date, and body. Get thread ids from list_emails or search_emails. Reading does not change labels. Mark-read and replies require a qualified write adapter and are currently unavailable.`,
  inputSchema: z.object({
    threadId: z.string().min(1).describe("Thread id from list_emails or search_emails."),
    markRead: z
      .boolean()
      .default(false)
      .describe("Keep false. Label mutations are unavailable until their write adapter is qualified."),
  }),
  async execute({ threadId, markRead },ctx) {
    if(markRead)return denyUnqualifiedExecutor(ctx,"tool.label_email");
    const [thread, ownAddress] = await Promise.all([getThread(threadId), getEmailAddress()]);

    const messages = thread.messages.map((message) => {
      const sender = parseAddress(message.from);
      return {
        messageId: message.message_id,
        direction: sender.address.toLowerCase() === ownAddress.toLowerCase() ? "sent" : "received",
        from: message.from,
        to: message.to ?? [],
        cc: message.cc ?? [],
        date: message.timestamp,
        subject: message.subject ?? null,
        body: clipBody(messageBody(message)),
        attachments: (message.attachments ?? []).map((attachment) => ({
          attachmentId: attachment.attachment_id,
          filename: attachment.filename ?? "attachment",
          contentType: attachment.content_type ?? null,
          size: attachment.size,
        })),
      };
    });

    return {
      threadId: thread.thread_id,
      subject: thread.subject ?? "(no subject)",
      labels: thread.labels,
      messageCount: thread.message_count,
      lastMessageId: thread.last_message_id,
      messages,
    };
  },
});
