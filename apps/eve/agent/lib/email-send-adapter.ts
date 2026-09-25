import { emailSendAdapter } from "../../lib/action-adapters.ts";
import type { ExecutionDatabase } from "../../lib/execution-types.ts";
import { localOwnerQualification, ownerChannelConfiguration } from "../../lib/relay/owner/config.ts";
import { pinnedQualificationEmail, qualificationEmailPin } from "../../lib/relay/owner/qualification-email.ts";
import { existingEmailAccount,inspectBoundMessage,sendBoundMessage,type SendInput } from "./agentmail.ts";
import { db } from "./receipts-db.ts";

export function agentMailSendAdapter() {
  const adapter=emailSendAdapter("agentmail",{
    resolveAccount:existingEmailAccount,
    async send(parameters,context) {
      const result=await sendBoundMessage(parameters as unknown as SendInput,context);
      return {messageId:result.message_id,threadId:result.thread_id};
    },
    async inspect(account,messageId) {
      const message=await inspectBoundMessage(account,messageId);
      return {messageId:message.message_id,threadId:message.thread_id,account:message.inbox_id};
    },
  });
  // In a local-qualification process every email is limited to the single
  // owner-authorized draft (or refused when none is pinned). Normal processes are unchanged.
  if(!localOwnerQualification(process.env,ownerChannelConfiguration().trust))return adapter;
  return pinnedQualificationEmail(adapter,qualificationEmailPin(process.env),()=>db() as unknown as ExecutionDatabase);
}
