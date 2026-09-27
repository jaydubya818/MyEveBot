import { createHash } from "node:crypto";
import type { ActionAdapter } from "../../action-gateway.ts";
import type { ExecutionDatabase } from "../../execution-types.ts";

/**
 * Owner-authorized qualification email: one exact draft, one attempt at most.
 * Applied only inside a local-qualification process, around the canonical
 * AgentMail adapter, so the Action Gateway, approval binding, continuation and
 * recovery stay canonical. A draft that differs from the pin is rejected in
 * resolveTarget, before any approval can be requested.
 *
 * Each pin is a separate owner authorization identified by its id and the digest of
 * its exact draft. Its single attempt is consumed atomically in the durable,
 * append-only owner_qualification_email_pins ledger before the provider is called,
 * so restarts, reloads or re-registration cannot restore it, and an exhausted draft
 * cannot be reissued under another id.
 */
export interface QualificationEmailPin { pinId: string; recipient: string; subject: string; text: string; maxSends: 1; draftSha256: string }
export const QUALIFICATION_OWNER_ID = "qualification-owner";

export function qualificationDraftSha256(draft: { recipient: string; subject: string; text: string }) {
  return createHash("sha256").update(JSON.stringify([draft.recipient, draft.subject, draft.text])).digest("hex");
}

export function qualificationEmailPin(env: Record<string, string | undefined>): QualificationEmailPin | null {
  const recipient = env.MYEVE_OWNER_LOCAL_EMAIL_RECIPIENT, subject = env.MYEVE_OWNER_LOCAL_EMAIL_SUBJECT, text = env.MYEVE_OWNER_LOCAL_EMAIL_TEXT;
  if (recipient === undefined && subject === undefined && text === undefined) return null;
  if (!recipient || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(recipient) || recipient.length > 254) throw new Error("Qualification email recipient invalid.");
  if (!subject || subject.length > 200 || /[\r\n]/.test(subject)) throw new Error("Qualification email subject invalid.");
  if (!text || text.length > 2000) throw new Error("Qualification email text invalid.");
  if (env.MYEVE_OWNER_LOCAL_EMAIL_MAX_SENDS !== "1") throw new Error("Qualification email requires MAX_SENDS=1.");
  const pinId = env.MYEVE_OWNER_LOCAL_EMAIL_PIN_ID ?? "";
  if (!/^email-pin-[0-9]{1,3}$/.test(pinId)) throw new Error("Qualification email requires a pin id.");
  return { pinId, recipient, subject, text, maxSends: 1, draftSha256: qualificationDraftSha256({ recipient, subject, text }) };
}

/** Registers a pin idempotently. Never resets attempts; refuses any id/draft rebinding. */
export async function registerQualificationEmailPin(database: ExecutionDatabase, pin: Pick<QualificationEmailPin, "pinId" | "draftSha256" | "maxSends">) {
  await database.query(`INSERT INTO owner_qualification_email_pins(pin_id,draft_sha256,max_sends) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [pin.pinId, pin.draftSha256, pin.maxSends]);
  const rows = await database.query(`SELECT pin_id,draft_sha256,attempts,max_sends FROM owner_qualification_email_pins WHERE pin_id=$1 OR draft_sha256=$2`, [pin.pinId, pin.draftSha256]) as Array<{ pin_id: string; draft_sha256: string; attempts: number; max_sends: number }>;
  if (rows.length !== 1 || rows[0].pin_id !== pin.pinId || rows[0].draft_sha256 !== pin.draftSha256) throw new Error("Qualification email pin conflicts with a registered pin.");
  return { attempts: Number(rows[0].attempts), remaining: Number(rows[0].max_sends) - Number(rows[0].attempts) };
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
      // Consume the pin's single attempt durably and atomically before the provider call.
      // Concurrent attempts serialize on the row; at most one succeeds. A failed send keeps
      // the attempt consumed (containment), and an unregistered pin sends nothing.
      const consumed = await database().query(`UPDATE owner_qualification_email_pins
        SET attempts=attempts+1, first_attempt_action_id=COALESCE(first_attempt_action_id,$3),
            exhausted_at=CASE WHEN attempts+1>=max_sends THEN now() ELSE NULL END
        WHERE pin_id=$1 AND draft_sha256=$2 AND attempts<max_sends RETURNING pin_id`,
        [pin.pinId, pin.draftSha256, context.idempotencyKey]) as Array<{ pin_id: string }>;
      if (consumed.length !== 1) throw new Error("Qualification email send limit reached.");
      return adapter.execute(parameters, context);
    },
  };
}
