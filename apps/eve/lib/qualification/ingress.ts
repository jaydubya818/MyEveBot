import { ensureQualificationHost } from "./host-bootstrap.ts";
import { qualificationHost, type QdevConversationModel } from "./root.ts";
import { externalAlphaInstallation, externalAlphaPolicy } from "../external-alpha/policy.ts";
import { ExternalAlphaAllowance } from "../external-alpha/allowance.ts";
import { db } from "../../agent/lib/receipts-db.ts";
import type { ExecutionDatabase } from "../execution-types.ts";
import { digest } from "../engineering/contract.ts";
import { hostedTesterProfile } from "./hosted-profile.ts";
import { cloudQualificationProject } from "../engineering/cloud-access-qualification.ts";
import { dispatchRoute, ownerMessageFingerprint, type QdevTurnRecord } from "./turn-route.ts";

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

async function admittedConversation(input: QdevIngressInput) {
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
  return { ownerId, conversation, model };
}
async function admitJourneyTurn(ownerId: string, input: QdevIngressInput) {
  if (!externalAlphaInstallation()) return;
  const step = turnStep.exec(input.stepKey);
  if (!step) return refuse("QDEV_TESTER_TURN_BINDING");
  // A verified tool result may arrive after the chat allowance's short deadline. Its readback spends nothing.
  if (step[2] === "0") await authorizeHostedTesterTurn(ownerId, input.session.id, input.stepKey);
}

export async function qdevModelSelection(input: QdevIngressInput): Promise<{ model: QdevConversationModel; modelContextWindowTokens: number }> {
  const { ownerId, conversation, model } = await admittedConversation(input);
  await admitJourneyTurn(ownerId, input);
  return { model, modelContextWindowTokens: conversation.contextWindowTokens };
}

export type QdevTurnSelection = { route: "JOURNEY"; model: QdevConversationModel; modelContextWindowTokens: number } | { route: "CHAT" };
/**
 * Per-dispatch selection for a QDEV installation. Every refusal of `qdevModelSelection` applies first, to every turn: the installation
 * must be unmixed, the request must come from the authenticated human owner, and the QDEV host must be enabled and configured for that
 * exact owner. A CHAT turn exists only in an installation whose host conversation serves chat (owner-request installations), and only
 * when the message hook recorded CHAT for an owner message that is in this prompt and no journey call is awaiting readback
 * (`dispatchRoute`). It is handed back to the installation's ordinary chat selection, which keeps its own admission and budget; nothing
 * about the journey is consumed. Everything else, including a conversation without `route`, a missing record or a route that throws,
 * is a JOURNEY turn on the host's free deterministic model.
 */
export async function qdevTurnSelection(input: QdevIngressInput & { prompt: unknown; recorded: QdevTurnRecord | null }): Promise<QdevTurnSelection> {
  const { ownerId, conversation, model } = await admittedConversation(input);
  let route: "JOURNEY" | "CHAT" = "JOURNEY";
  try { if (typeof conversation.route === "function" && dispatchRoute(input.prompt, input.recorded) === "CHAT") route = "CHAT"; } catch { route = "JOURNEY"; }
  if (route === "CHAT") return { route };
  await admitJourneyTurn(ownerId, input);
  return { route, model, modelContextWindowTokens: conversation.contextWindowTokens };
}

/**
 * The route to record for an owner message as it is received. CHAT only for an admitted owner of an installation whose host conversation
 * serves chat and classifies this text as chat. Any refusal or error is JOURNEY: the ordinary run ledger stays untouched and model
 * selection (which repeats the admission) answers or refuses on its own.
 */
export async function qdevMessageRoute(session: QdevIngressInput["session"], text: string | undefined): Promise<QdevTurnRecord> {
  const fingerprint = ownerMessageFingerprint(text);
  try {
    const { conversation } = await admittedConversation({ session, stepKey: "message" });
    return { route: typeof conversation.route === "function" && conversation.route(text) === "CHAT" ? "CHAT" : "JOURNEY", fingerprint };
  } catch { return { route: "JOURNEY", fingerprint }; }
}
