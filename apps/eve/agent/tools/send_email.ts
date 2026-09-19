import { defineTool } from "eve/tools";
import { z } from "zod";

import { agentMailSendAdapter } from "../lib/email-send-adapter.ts";
import { RoutinePendingSend } from "../../lib/routine-pending-send.ts";
import { ActionBlocked,ActionGateway } from "../../lib/action-gateway.ts";
import { toolActionRequest } from "../lib/action-context.ts";
import { agentName,ownerName } from "../lib/owner";
import { ownerOnly } from "../lib/owner-gate";

export default defineTool({
  approval: ownerOnly,
  description: `Send an email from ${agentName()}'s own address. This is a real email to a real person, sent as you (not as ${ownerName()}) - say exactly who you're writing to and what you'll say, and get a yes from ${ownerName()} first. Plain text unless HTML actually helps. To answer an existing conversation use reply_to_email instead, so it threads properly.`,
  inputSchema: z.object({
    to: z
      .array(z.string().email())
      .min(1)
      .max(25)
      .describe("Recipient email addresses."),
    subject: z.string().min(1).max(200).describe("Subject line."),
    text: z.string().min(1).describe("Plain-text body. Write it as yourself, and sign off as you."),
    cc: z.array(z.string().email()).max(25).optional().describe("Cc addresses."),
    bcc: z.array(z.string().email()).max(25).optional().describe("Bcc addresses."),
    html: z
      .string()
      .optional()
      .describe("Optional HTML body. Only when formatting matters; always send text too."),
  }),
  async execute({ to, subject, text, cc, bcc, html }, ctx) {
    const action=await toolActionRequest(ctx,{capabilityId:"tool.send_email",actionClass:"send",parameters:{to,subject,text,html,cc,bcc}});
    try {return await new ActionGateway().execute(action,agentMailSendAdapter(),ctx.abortSignal);}
    catch(error) {
      if(error instanceof ActionBlocked) {
        if(error.status==="awaiting_approval" && action.occurrence)await new RoutinePendingSend().save(action,error.actionId);
        return {status:error.status,actionId:error.actionId,message:error.message,canEscalate:false};
      }
      throw error;
    }
  },
});
