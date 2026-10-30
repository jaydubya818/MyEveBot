import { ensureQualificationHost } from "./host-bootstrap.ts";
import { qualificationHost, type QdevConversationModel } from "./root.ts";
import { externalAlphaInstallation } from "../external-alpha/policy.ts";
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
const mixedInstallation = () => externalAlphaInstallation() || !!process.env.MYEVE_ALPHA_OWNER_BINDING || !!cloudQualificationProject();
/** One request boundary for model selection and direct/replayed journey tools. No host lookup, ledger or provider call. */
export function qdevRequestOwner(session: RequestSession): string | null {
  const current = session.auth.current, initiator = session.auth.initiator;
  const human = (p?: Principal | null) => !!p && p.authenticator === "myeve-web-session" && p.principalType === "user" && typeof p.principalId === "string" && p.principalId.length > 0
    && p.attributes?.owner === "true" && p.attributes?.role !== "guest" && !p.attributes?.myeveRoleId
    && p.attributes?.myeveRetainedSummary === undefined && p.attributes?.myeveEngineeringWorkId === undefined;
  if (mixedInstallation() || !human(current) || !human(initiator) || current!.principalId !== initiator!.principalId || session.parent) return null;
  return current!.principalId!;
}
export type QdevIngressInput = {
  session: { id: string; auth: { current?: Principal | null; initiator?: Principal | null }; parent?: unknown };
  stepKey: string;
  /** True when any other installation mode (external alpha, owner binding, cloud qualification) is configured. */
  mixedInstallation: boolean;
};

export async function qdevModelSelection(input: QdevIngressInput): Promise<{ model: QdevConversationModel; modelContextWindowTokens: number }> {
  if (input.mixedInstallation || mixedInstallation()) refuse("QDEV_INGRESS_MIXED_INSTALLATION");
  const { session } = input, ownerId = qdevRequestOwner(session);
  if (!ownerId) return refuse("QDEV_INGRESS_PRINCIPAL");
  ensureQualificationHost();
  const host = qualificationHost();
  if (!host.enabled()) refuse("QDEV_INGRESS_DISABLED");
  const conversation = host.conversation ? await host.conversation(ownerId) : null;
  if (!conversation) return refuse("QDEV_INGRESS_UNCONFIGURED");
  if (conversation.ownerId !== ownerId) refuse("QDEV_INGRESS_OWNER");
  const model = conversation.model({ sessionId: session.id, stepKey: input.stepKey });
  if (!model || model.provider !== "myeve-qdev") refuse("QDEV_INGRESS_MODEL");
  return { model, modelContextWindowTokens: conversation.contextWindowTokens };
}
