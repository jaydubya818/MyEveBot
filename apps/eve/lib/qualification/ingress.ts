import { ensureQualificationHost } from "./host-bootstrap.ts";
import { qualificationHost, type QdevConversationModel } from "./root.ts";
import { externalAlphaInstallation, externalAlphaPolicy } from "../external-alpha/policy.ts";
import { ExternalAlphaAllowance } from "../external-alpha/allowance.ts";
import { db } from "../../agent/lib/receipts-db.ts";
import type { ExecutionDatabase } from "../execution-types.ts";
import { digest } from "../engineering/contract.ts";
import { hostedTesterProfile } from "./hosted-profile.ts";
import { cloudQualificationProject } from "../engineering/cloud-access-qualification.ts";

/**
 * Pre-model ingress policy for a QDEV installation (MYEVE_QDEV_ENABLED=true). It runs at the head of every model
 * selection (the first request, tool selection, post-tool continuations, summaries, compaction): nothing reaches a
 * provider unless the complete authenticated request is admitted by the QDEV host for this exact owner, and the only
 * model ever returned is the host's own `myeve-qdev` conversation model. Any other result is a refusal before a
 * provider call, before any legacy ledger/Work/agent lookup, and with no fallback to the generic Gateway.
 */
export class QdevIngressRefused extends Error {
  constructor(readonly code: string) { super(code); }
}
const refuse = (code: string): never => { throw new QdevIngressRefused(code); };
export const qdevInstallation = () => process.env.MYEVE_QDEV_ENABLED === "true";

type Principal = { principalId?: string; principalType?: string; authenticator?: string; attributes?: Record<string, unknown> };
type RequestSession = { auth: { current?: Principal | null; initiator?: Principal | null }; parent?: unknown };
const mixedInstallation = () => (externalAlphaInstallation() && !hostedTesterProfile()) ||
  !!process.env.MYEVE_ALPHA_OWNER_BINDING || !!cloudQualificationProject();

const turnStep = /^(.+):(\d+)$/;

/** Plan and Confirm retain the existing local and shared chat admission, including expiry and quotas. */
export async function authorizeHostedTesterTurn(ownerId: string, sessionId: string, stepKey: string) {
  if (!externalAlphaInstallation()) return;
  const turn = turnStep.exec(stepKey)?.[1];
  const policy = externalAlphaPolicy();
  if (!turn || !sessionId || hostedTesterProfile()?.ownerId !== ownerId || policy?.ownerId !== ownerId)
    return refuse("QDEV_TESTER_TURN_BINDING");
  const allowance = new ExternalAlphaAllowance(db() as ExecutionDatabase, policy);
  const admitted = await allowance.admit({
    kind: "CHAT",
    bindingId: `${sessionId}:${turn}`,
    requestSha256: digest({ ownerId, sessionId, turn, purpose: "HOSTED_PRIVATE_BETA" }),
  });
  await allowance.assertActive(admitted.id);
}
/** One request boundary for model selection and direct/replayed journey tools. No host lookup, ledger or provider call. */
export function qdevRequestOwner(session: RequestSession): string | null {
  const current = session.auth.current, initiator = session.auth.initiator;
  const human = (p?: Principal | null) => !!p && p.authenticator === "myeve-web-session" && p.principalType === "user" && typeof p.principalId === "string" && p.principalId.length > 0
    && p.attributes?.owner === "true" && p.attributes?.role !== "guest" && !p.attributes?.myeveRoleId
    && p.attributes?.myeveRetainedSummary === undefined && p.attributes?.myeveEngineeringWorkId === undefined;
  if (mixedInstallation() || !human(current) || !human(initiator) || current!.principalId !== initiator!.principalId || session.parent) return null;
  const ownerId = current!.principalId!;
  return externalAlphaInstallation() && hostedTesterProfile()?.ownerId !== ownerId ? null : ownerId;
}
export type QdevIngressInput = {
  session: { id: string; auth: { current?: Principal | null; initiator?: Principal | null }; parent?: unknown };
  stepKey: string;
};

export async function qdevModelSelection(input: QdevIngressInput): Promise<{ model: QdevConversationModel; modelContextWindowTokens: number }> {
  if (mixedInstallation()) refuse("QDEV_INGRESS_MIXED_INSTALLATION");
  const { session } = input, ownerId = qdevRequestOwner(session);
  if (!ownerId) return refuse("QDEV_INGRESS_PRINCIPAL");
  ensureQualificationHost();
  const host = qualificationHost();
  if (!host.enabled()) refuse("QDEV_INGRESS_DISABLED");
  const conversation = host.conversation ? await host.conversation(ownerId) : null;
  if (!conversation) return refuse("QDEV_INGRESS_UNCONFIGURED");
  if (conversation.ownerId !== ownerId) refuse("QDEV_INGRESS_OWNER");
  const model = conversation.model({ sessionId: session.id, stepKey: `${session.id}:${input.stepKey}` });
  if (!model || model.provider !== "myeve-qdev") refuse("QDEV_INGRESS_MODEL");
  if (externalAlphaInstallation()) {
    const step = turnStep.exec(input.stepKey);
    if (!step) return refuse("QDEV_TESTER_TURN_BINDING");
    // A verified tool result may arrive after the chat allowance's short deadline. Its readback spends nothing.
    if (step[2] === "0") await authorizeHostedTesterTurn(ownerId, session.id, input.stepKey);
  }
  return { model, modelContextWindowTokens: conversation.contextWindowTokens };
}
