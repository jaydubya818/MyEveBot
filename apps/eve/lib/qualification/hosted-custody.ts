import { createGateway } from "ai";
import { z } from "zod";
import type { ExecutionDatabase } from "../execution-types.ts";
import type { MailboxDb } from "../engineering/factory-mailbox.ts";
import { FactoryReceiptStore } from "../engineering/factory-receipt-store.ts";
import { FactoryWriterStore } from "../engineering/factory-writer.ts";
import { factoryConfigForWork, FactoryRouteAuthority, type FactoryRuntime } from "../engineering/factory-routing.ts";
import { WorkStore } from "../engineering/store.ts";
import { canonicalWorkDatabase } from "../capability-control/admission.ts";
import { assembleQdevCustody, orderedAdapterFor, ownerFactoryCapabilityConfig, storeBackedStageChain } from "./custody-assembly.ts";
import { qdevJourneyId } from "./custody-profile.ts";
import type { QdevHostBundle } from "./host-source.ts";
import { HostedMacMyAppsPort } from "./hosted-mac-build.ts";
import type { PreviewBlobStore } from "./hosted-preview.ts";
import { hostedBinding, hostedTransports, requireHostedFactoryConnection, requireHostedPolicy, sameVerifierTrust, type HostedProfile } from "./hosted-profile.ts";
import { journeyBinding, journeyProfile } from "./journey-profile.ts";
import { PostgresJournal } from "./journal.ts";
import { validateJourneyPlan } from "./plan.ts";
import type { QdevCustody } from "./runtime-ports.ts";
import { checkStageWorkBudgets } from "./work-budget-preflight.ts";
import { digest } from "../engineering/contract.ts";
import { HOSTED_PROFILE } from "../engineering/factory-mailbox.ts";
import { confirmHostedRequest, type HostedConfirmed } from "./hosted-confirmation.ts";
import { ownerLocalRequestRuntime } from "./owner-local-confirmation.ts";

/**
 * Hosted private-beta custody: hosted Sofie -> mailbox -> the owner's Mac (metered Factory route + local verifier). MyFactory on the Mac is the
 * only execution engine; this process records Work, progress and Results, and serves the private preview.
 *
 * Differences from the owner-local launcher (custody-launcher.ts), all fail-closed:
 *  - Factory, ordered-admission receiver, verifier and the Mac-local Relay are reached ONLY through the mailbox (hostedTransports).
 *  - The Factory connection must be the metered LIVE route (no OWNER_SUBSCRIPTION_LOCAL, no subscription-usage recorder, never $0).
 *  - The accounting policy must fit $1.30/Work and 4 Works/person.
 *  - No owner-local confirmation bridge (that is a local MissionControl script). With `hostedConfirmation`, the person's Sofie confirmation is
 *    signed by MyEve and verified, consumed once and applied by MissionControl itself (hosted-confirmation.ts); without it, stage Works and the
 *    mission come from the pinned assembly profile and are approved in the real MissionControl UI.
 *  - No Docker, git or build signer here: the static build runs on the Mac and is re-verified by HostedMacMyAppsPort; the verifier receives
 *    the bytes from the Mac, not from this process; publication is the private preview (no release controller, no public origin).
 * Returns null (installation stays disabled) when anything is missing, malformed or refused.
 */
export type HostedLauncherDeps = {
  hosted: HostedProfile; mailboxDb: MailboxDb; blob: PreviewBlobStore;
  database(url: string): ExecutionDatabase;
  store?(ownerId: string): WorkStore;
  runtimeConfig?(store: WorkStore, stage1WorkId: string): Promise<FactoryRuntime>;
  languageModel?(id: string, apiKey: string): import("ai").LanguageModel;
  /** MissionControl (https) transport for the confirmation bridge; tests inject it. */
  missionControlFetch?: typeof fetch;
  now?: () => number;
};
type Context = { bundle: QdevHostBundle; credential(name: string): string | undefined };
const propagation = z.object({ signer: z.object({ keyId: z.string().min(1), jwk: z.record(z.string(), z.unknown()) }) }).loose();

export async function assembleHostedCustody(context: Context, deps: HostedLauncherDeps): Promise<QdevCustody | null> {
  const { bundle } = context, profile = bundle.assembly, hosted = deps.hosted;
  if (!profile || bundle.custody || profile.ownerLocalConfirmation || bundle.ownerId !== hosted.ownerId) return null;
  if (profile.publishing.installationId !== hosted.installationId || profile.build.appId !== hosted.build.appId) return null;
  // The verifier trust set is one: the journey and the private preview accept exactly the same verifier keys — the complete normalized records
  // (id, public key bytes, validity window, revocation), not just the ids.
  if (!sameVerifierTrust(profile.verifier.keys, hosted.verifier.keys)) return null;
  const secret = (name: string) => { const value = context.credential(name); return value && value.length <= 16384 ? value : null; };
  const signerJson = secret(profile.capability.signerEnv), relayCredential = secret(profile.capability.relay.credentialEnv),
    workloadToken = secret(profile.capability.relay.workloadTokenEnv), modelKey = profile.model ? secret(profile.model.apiKeyEnv) : null,
    journalUrl = secret(bundle.credentials.journalDatabaseUrl);
  if (!signerJson || !relayCredential || !workloadToken || !journalUrl || (profile.model && !modelKey)) return null;
  try { requireHostedPolicy(hosted, bundle.policy); } catch { return null; }
  const ownerId = bundle.ownerId, signer = propagation.parse(JSON.parse(signerJson)).signer as { keyId: string; jwk: JsonWebKey };
  const store = deps.store?.(ownerId) ?? new WorkStore({ scopeId: ownerId, scopeKind: "personal", actorId: ownerId }, canonicalWorkDatabase());
  let workIds = profile.workIds, missionId = profile.capability.missionId, admission: HostedConfirmed["admission"] | undefined;
  let requestRuntime: ((base: FactoryRuntime) => FactoryRuntime) | undefined;
  if (profile.hostedConfirmation) {
    // Sofie -> Plan -> Confirm: the person's confirmed request (root-verified plan digest) creates its stage Works and obtains MissionControl's
    // owner decisions through the hosted confirmation bridge (one signed confirmation, verified and consumed once by MissionControl).
    const request = bundle.conversation.approvedRequest, planSha256 = digest(bundle.plan);
    if (!request) return null;
    requestRuntime = base => ownerLocalRequestRuntime(base, { request, planSha256 });
    const confirmed = await confirmHostedRequest({ profile: HOSTED_PROFILE, installationId: hosted.installationId, missionControlOrigin: hosted.missionControlOrigin,
      confirmation: profile.hostedConfirmation, store, base: await (deps.runtimeConfig ?? ((s, id) => factoryConfigForWork(s, id)))(store, undefined as never),
      request, planSha256, credential: context.credential, send: deps.missionControlFetch, now: deps.now });
    workIds = confirmed.workIds; missionId = confirmed.missionId; admission = confirmed.admission;
  }
  const readRuntime = () => (deps.runtimeConfig ?? ((s, id) => factoryConfigForWork(s, id)))(store, workIds.stage1);
  const runtimeConfig = requestRuntime ? async () => requestRuntime!(await readRuntime()) : readRuntime;
  const config = await runtimeConfig();
  let transports;
  try { transports = hostedTransports(hosted, deps.mailboxDb, requireHostedFactoryConnection(hosted, config.connection)); } catch { return null; }
  const connection = config.connection;
  let plan; try { plan = validateJourneyPlan(bundle.plan); } catch { return null; }
  await checkStageWorkBudgets(store.database, ownerId, plan, { 1: workIds.stage1, 2: workIds.stage2, 3: workIds.stage3 });
  // Relay is the Mac-local qualification Relay at the profile's loopback origin, reached ONLY through the mailbox `relay` target.
  const capability = await ownerFactoryCapabilityConfig({ store, runtimeConfig, clientId: profile.capability.clientId, backendId: profile.capability.backendId,
    missionId, signer, ownerLocalRelayLoopback: true, send: transports.relayFetch,
    relay: { enrollment: profile.capability.relay.enrollment, enrollmentSha256: profile.capability.relay.enrollmentSha256, revision: profile.capability.relay.revision,
      credential: relayCredential, workloadIdentityToken: workloadToken } });
  const journalId = qdevJourneyId(ownerId, bundle.project, bundle.policy, plan), journalDb = deps.database(journalUrl);
  const [tables] = await journalDb.query("SELECT to_regclass('qjourney_event') AS journal, to_regclass('qdev_admission_claim') AS claim, to_regclass('qdev_retained_admission') AS retained");
  if (!tables?.journal || !tables.claim || !tables.retained) return null;
  const adapterFor = (c: typeof connection) => orderedAdapterFor(c, capability, transports.factoryFetch, transports.capabilityFetch);
  const { chain } = storeBackedStageChain({ db: journalDb as never, journeyId: journalId, journal: new PostgresJournal(journalDb as never, journalId),
    // Routing qualifies the hosted per-person scope (myeve.hosted:<installation>:<owner>) and probes health through the mailbox only.
    sources: { enabled: true, store, authority: new FactoryRouteAuthority(store, runtimeConfig, { binding: hostedBinding(hosted), factoryFetch: transports.factoryFetch }), receipts: new FactoryReceiptStore(store.principal, store.database),
      writers: new FactoryWriterStore(store), adapterFor, workIds: { 1: workIds.stage1, 2: workIds.stage2, 3: workIds.stage3 }, baseline: profile.baseline,
      ...(admission ? { admission, maxRequestSeconds: profile.hostedConfirmation!.stage.requestDeadlineSeconds } : {}) } });
  await chain.warm();
  const binding = journeyBinding(bundle.project), environment = journeyProfile(bundle.project).environment;
  const hostedMyApps = new HostedMacMyAppsPort({ db: deps.mailboxDb, profile: hosted, blob: deps.blob, retained: stage => chain.retained(stage),
    project: { projectSha256: binding.projectSha256, sourceSha256: binding.sourceSha256, protectedSpecificationSha256: bundle.project.protectedSpecificationSha256, environment },
    now: deps.now });
  const noLocalBuild = async (): Promise<never> => { throw new Error("QDEV_HOSTED_NO_LOCAL_BUILD"); };
  const custody = assembleQdevCustody({
    slot: profile.slot, project: bundle.project, approvedRequest: bundle.conversation.approvedRequest, chain, connection, capability,
    sofie: profile.model ? { model: (deps.languageModel ?? ((id, apiKey) => createGateway({ apiKey })(id)))(profile.model.id, modelKey!), price: profile.model.price,
      system: profile.model.system, temperature: profile.model.temperature } : undefined,
    verifier: { origin: hosted.factory.verifierOrigin, credentialName: profile.verifier.credentialEnv, timeoutMs: profile.verifier.timeoutMs, keys: profile.verifier.keys,
      producerKeyIds: profile.verifier.producerKeyIds ?? [], producerPublicKeysPem: profile.verifier.producerPublicKeysPem ?? [] },
    // Present only to satisfy the shape; the hosted port replaces it and this source refuses if ever called.
    myapps: { source: noLocalBuild, now: deps.now, delivery: { enabled: false, environment, servedOrigin: hosted.servedOrigin, projectSha256: binding.projectSha256,
      sourceSha256: binding.sourceSha256, priorRevision: noLocalBuild, restorePointId: noLocalBuild } },
  });
  return { ...custody, factory: { ...custody.factory, factoryFetch: transports.factoryFetch, capabilityFetch: transports.capabilityFetch },
    verifier: { ...custody.verifier, fetch: transports.verifierFetch }, hostedMyApps };
}
