import { emailSendAdapter } from "../../lib/action-adapters.ts";
import { existingEmailAccount,inspectBoundMessage,sendBoundMessage,type SendInput } from "./agentmail.ts";

export function agentMailSendAdapter() {
  return emailSendAdapter("agentmail",{
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
}
