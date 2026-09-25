import type { ActionAdapter } from "../../action-gateway.ts";
import type { ExecutionDatabase } from "../../execution-types.ts";

/**
 * Owner-authorized qualification email: one exact draft, one attempt at most.
 * Applied only inside a local-qualification process, around the canonical
 * AgentMail adapter, so the Action Gateway, approval binding, continuation and
 * recovery stay canonical. A draft that differs from the pin is rejected in
 * resolveTarget, before any approval can be requested.
 */
export interface QualificationEmailPin { recipient: string; subject: string; text: string; maxSends: 1 }
export const QUALIFICATION_OWNER_ID = "qualification-owner";
// Every status reached once execution started; any of them consumes the single allowed attempt.
const ATTEMPTED = ["executing", "verifying", "completed", "failed", "result_unknown", "recovering", "needs_you", "retryable"] as const;

export function qualificationEmailPin(env: Record<string, string | undefined>): QualificationEmailPin | null {
  const recipient = env.MYEVE_OWNER_LOCAL_EMAIL_RECIPIENT, subject = env.MYEVE_OWNER_LOCAL_EMAIL_SUBJECT, text = env.MYEVE_OWNER_LOCAL_EMAIL_TEXT;
  if (recipient === undefined && subject === undefined && text === undefined) return null;
  if (!recipient || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(recipient) || recipient.length > 254) throw new Error("Qualification email recipient invalid.");
  if (!subject || subject.length > 200 || /[\r\n]/.test(subject)) throw new Error("Qualification email subject invalid.");
  if (!text || text.length > 2000) throw new Error("Qualification email text invalid.");
  if (env.MYEVE_OWNER_LOCAL_EMAIL_MAX_SENDS !== "1") throw new Error("Qualification email requires MAX_SENDS=1.");
  return { recipient, subject, text, maxSends: 1 };
}

const list = (value: unknown) => value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
export function assertPinnedDraft(parameters: Record<string, unknown>, pin: QualificationEmailPin) {
  const to = list(parameters.to), cc = list(parameters.cc), bcc = list(parameters.bcc);
  const exact = to.length === 1 && to[0] === pin.recipient && cc.length === 0 && bcc.length === 0
    && parameters.subject === pin.subject && parameters.text === pin.text
    && (parameters.html === undefined || parameters.html === null) && (parameters.labels === undefined || parameters.labels === null);
  if (!exact) throw new Error("Qualification email does not match the owner-authorized draft.");
}

export function pinnedQualificationEmail<Result>(adapter: ActionAdapter<Result>, pin: QualificationEmailPin | null, database: () => ExecutionDatabase): ActionAdapter<Result> {
  return {
    ...adapter,
    async resolveTarget(parameters) {
      if (!pin) throw new Error("Email is not authorized in this qualification process.");
      assertPinnedDraft(parameters, pin);
      return adapter.resolveTarget(parameters);
    },
    async execute(parameters, context) {
      if (!pin) throw new Error("Email is not authorized in this qualification process.");
      assertPinnedDraft(parameters, pin);
      // Concurrent attempts see each other as executing and both fail closed.
      const [row] = await database().query(`SELECT count(*)::int AS n FROM action_requests WHERE owner_id=$1 AND capability_id='tool.send_email' AND id<>$2 AND status = ANY($3::text[])`,
        [QUALIFICATION_OWNER_ID, context.idempotencyKey, [...ATTEMPTED]]) as Array<{ n: number }>;
      if (Number(row?.n ?? 1) >= pin.maxSends) throw new Error("Qualification email send limit reached.");
      return adapter.execute(parameters, context);
    },
  };
}
