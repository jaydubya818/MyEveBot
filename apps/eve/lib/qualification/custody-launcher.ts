
import { createGateway, type LanguageModel } from "ai";
import { z } from "zod";
import type { ExecutionDatabase } from "../execution-types.ts";
import { isPrivateBetaProject, journeyBinding, journeyProfile } from "./journey-profile.ts";
import { FactoryReceiptStore } from "../engineering/factory-receipt-store.ts";
import { retainLocalFactoryResult } from '../engineering/local-factory-results.ts';
import { FactoryWriterStore } from "../engineering/factory-writer.ts";
import { factoryConfigForWork, FactoryRouteAuthority, type FactoryRuntime } from "../engineering/factory-routing.ts";
import { WorkStore } from "../engineering/store.ts";
import { assembleQdevCustody, candidateStaticBuildSource, createBoundedDockerRunner, ed25519Signer, orderedAdapterFor, ownerFactoryCapabilityConfig,
  storeBackedStageChain } from "./custody-assembly.ts";
import { qdevJourneyId } from "./custody-profile.ts";
import { validateJourneyPlan } from "./plan.ts";
import { checkStageWorkBudgets } from "./work-budget-preflight.ts";
import { approverFingerprints, fileActivation } from "./static-activation.ts";
import type { QdevHostBundle } from "./host-source.ts";
import { PostgresJournal } from "./journal.ts";
import { subscriptionUsageRecorder } from "./subscription-usage.ts";
import { canonicalWorkDatabase } from "../capability-control/admission.ts";
import { factoryRelayLeaseEnrollmentDigest } from "../engineering/factory-relay-lease-client.ts";
import { digest } from "../engineering/contract.ts";
import { PRIVATE_BETA_PROFILE } from "./journey-profile.ts";
import { confirmOwnerLocalRequest, ownerLocalRequestRuntime } from "./owner-local-confirmation.ts";
import { auditAppender, assertOwnerLocalCompletionStorage, completeDeliveredStageWorks, issueConfirmedCohort, ownerLocalPublishApprover, type ConfirmationContext } from "./owner-local-authorizations.ts";
import type { StageStoreSourcesConfig } from "./factory-stage-store-sources.ts";
type StageAdmission = NonNullable<StageStoreSourcesConfig["admission"]>;
import type { QdevCustody } from "./runtime-ports.ts";
import type { DockerRunner } from "./static-build-export.ts";

/**
 * Production launcher: bundle `assembly` profile (non-secret ids, pins and env-var NAMES) + protected values read by NAME at startup
 * -> `QdevCustody` for composeRuntimePorts, from the existing qualified bodies. It is the startup path used by `productionRuntimePorts`
 * when the bundle carries an `assembly` instead of a pinned custody module (the two are mutually exclusive).
 *
 * It reads a protected value only to hand it to the adapter that needs it (signer, relay credential, model credential, issuer key), never
 * logs or returns one, and returns `null` (installation stays disabled) when anything is missing, malformed, foreign or refused. It reserves
 * nothing, dispatches nothing, deploys nothing and carries NO activation permit: publishing stays refused until the host supplies one.
 */
export type LauncherDeps = {
  /** Opens the journal database from the runtime-supplied URL. Production: `pgExecutionDatabase`. */
  database(url: string): ExecutionDatabase;
  /** The owner-scoped engineering store. Default: the application store (capability-control database when enabled). */
  store?(ownerId: string): WorkStore;
  runtimeConfig?(store: WorkStore, stage1WorkId: string): Promise<FactoryRuntime>;
  languageModel?(id: string, apiKey: string): LanguageModel;
  docker?: DockerRunner;
  now?: () => number;
  factoryFetch?: typeof fetch; capabilityFetch?: typeof fetch;
};
type Context = { bundle: QdevHostBundle; credential(name: string): string | undefined };
const propagation = z.object({ signer: z.object({ keyId: z.string().min(1), jwk: z.record(z.string(), z.unknown()) }) }).loose();

export async function assembleFromProfile(context: Context, deps: LauncherDeps): Promise<QdevCustody | null> {
  const { bundle } = context, profile = bundle.assembly;
  if (!profile || bundle.custody) return null;
  // A private-beta project starts from its own installation baseline; the pinned Factory stage-1 baseline must be exactly that commit/tree.
  if (isPrivateBetaProject(bundle.project) && (profile.baseline.commit !== bundle.project.inputCommit || profile.baseline.tree !== bundle.project.inputTree)) return null;
  const secret = (name: string) => { const value = context.credential(name); return value && value.length <= 16384 ? value : null; };
  const signerJson = secret(profile.capability.signerEnv), relayCredential = secret(profile.capability.relay.credentialEnv),
    workloadToken = secret(profile.capability.relay.workloadTokenEnv), modelKey = profile.model ? secret(profile.model.apiKeyEnv) : null,
    issuerPem = secret(profile.build.signerEnv), journalUrl = secret(bundle.credentials.journalDatabaseUrl);
  if (!signerJson || !relayCredential || !workloadToken || !issuerPem || !journalUrl) return null;
  // A Sofie model credential is required unless this is the owner-local profile, whose planning runs as part of the stage-1 Factory run.
  const ownerLocal = isPrivateBetaProject(bundle.project);
  if (profile.model ? !modelKey : !ownerLocal) return null;
  const ownerId = bundle.ownerId;
  if (profile.build.issuer.ownerId !== ownerId) return null;
  const signer = propagation.parse(JSON.parse(signerJson)).signer as { keyId: string; jwk: JsonWebKey };

  // Owner-local: the transactional Work store (MissionControl bindings require it) without enabling capability control process-wide.
  const store = deps.store?.(ownerId) ?? new WorkStore({ scopeId: ownerId, scopeKind: "personal", actorId: ownerId }, ownerLocal ? canonicalWorkDatabase() : undefined);
  let relay = profile.capability.relay, missionId = profile.capability.missionId, confirmation: ConfirmationContext | undefined;
  let confirmedWorks: Array<{ id: string; version: number; generation: number }> | undefined;
  let workIds = profile.workIds, admission: StageAdmission | undefined, requestRuntime: ((base: FactoryRuntime) => FactoryRuntime) | undefined;
  if (ownerLocal && profile.ownerLocalConfirmation) {
    await assertOwnerLocalCompletionStorage(store.database);
    // The owner's confirmed request (root-verified digest) creates its stage Works and obtains MissionControl's owner decisions via the bridge.
    const request = bundle.conversation.approvedRequest, planSha256 = digest(bundle.plan);
    if (!request) return null;
    requestRuntime = base => ownerLocalRequestRuntime(base, { request, planSha256 });
    const confirmed = await confirmOwnerLocalRequest({ profile: PRIVATE_BETA_PROFILE, confirmation: profile.ownerLocalConfirmation, store,
      base: await (deps.runtimeConfig ?? ((s, id) => factoryConfigForWork(s, id)))(store, undefined as never), request, planSha256, credential: context.credential, now: deps.now });
    workIds = confirmed.workIds; admission = confirmed.admission; missionId = confirmed.missionId; confirmedWorks = confirmed.works;
    // Jay's confirm authorizes the confirmed plan's accounting cohort and the post-PASS preview publication (owner-local-authorizations.ts).
    const auth = profile.ownerLocalConfirmation.authorizations;
    confirmation = { profile: PRIVATE_BETA_PROFILE, confirmationDigest: confirmed.confirmationDigest, ownerId, planSha256,
      repository: bundle.project.repository, workIds: [workIds.stage1, workIds.stage2, workIds.stage3], audit: auditAppender(auth.auditPath) };
    const issuerUrl = context.credential(auth.accountingIssuerEnv), memberCredential = context.credential(bundle.credentials.accounting);
    if (!issuerUrl || !memberCredential) return null;
    const { default: pg } = await import("pg");
    const issuer = new pg.Client({ connectionString: issuerUrl });
    await issuer.connect();
    try { await issueConfirmedCohort({ db: issuer, ctx: confirmation, policy: bundle.policy, project: bundle.project, plan: validateJourneyPlan(bundle.plan), memberCredential }); }
    finally { await issuer.end(); }
    // The Factory Relay lease enrollment binds to the MissionControl connection/revision this confirmation installed (re-pinned, never widened).
    const bound = { ...profile.capability.relay.enrollment, connectionId: confirmed.connectionId, enrollmentRevision: confirmed.enrollmentRevision };
    relay = { ...profile.capability.relay, enrollment: bound, revision: confirmed.enrollmentRevision,
      enrollmentSha256: factoryRelayLeaseEnrollmentDigest(bound, { ownerLocalLoopback: true }) };
  }
  const readRuntime = () => (deps.runtimeConfig ?? ((s, id) => factoryConfigForWork(s, id)))(store, workIds.stage1);
  const runtimeConfig = requestRuntime ? async () => requestRuntime!(await readRuntime()) : readRuntime;
  const config = await runtimeConfig(), connection = config.connection;
  if (!("repositoryPath" in connection) || "transport" in connection) return null;
  // Unpaid preflight before anything can run: each stage Work budget must fit its approved operation reservation (else coding is refused only after Sofie has spent).
  let plan; try { plan = validateJourneyPlan(bundle.plan); } catch { return null; }
  await checkStageWorkBudgets(store.database, ownerId, plan, { 1: workIds.stage1, 2: workIds.stage2, 3: workIds.stage3 });

  const capability = await ownerFactoryCapabilityConfig({ store, runtimeConfig, clientId: profile.capability.clientId, backendId: profile.capability.backendId,
    missionId, signer, send: deps.capabilityFetch, ownerLocalRelayLoopback: isPrivateBetaProject(bundle.project),
    relay: { enrollment: relay.enrollment, enrollmentSha256: relay.enrollmentSha256, revision: relay.revision,
      credential: relayCredential, workloadIdentityToken: workloadToken } });

  const journalId = qdevJourneyId(ownerId, bundle.project, bundle.policy, plan), journalDb = deps.database(journalUrl);
  // The journal and retained-admission tables are applied by the operator (DDL is never run at startup). Absent tables keep the installation disabled.
  const [tables] = await journalDb.query("SELECT to_regclass('qjourney_event') AS journal, to_regclass('qdev_admission_claim') AS claim, to_regclass('qdev_retained_admission') AS retained");
  if (!tables?.journal || !tables.claim || !tables.retained) return null;
  const { chain } = storeBackedStageChain({ db: journalDb as never, journeyId: journalId, journal: new PostgresJournal(journalDb as never, journalId),
    sources: { enabled: true, store, authority: new FactoryRouteAuthority(store, runtimeConfig), receipts: new FactoryReceiptStore(store.principal, store.database),
      writers: new FactoryWriterStore(store), adapterFor: connection_ => orderedAdapterFor(connection_, capability, deps.factoryFetch, deps.capabilityFetch),
      workIds: { 1: workIds.stage1, 2: workIds.stage2, 3: workIds.stage3 }, baseline: profile.baseline,
      ...(admission ? { admission, maxRequestSeconds: profile.ownerLocalConfirmation!.stage.requestDeadlineSeconds } : {}) } });
  await chain.warm();

  const source = candidateStaticBuildSource({ repositoryPath: connection.repositoryPath, ownerId, appId: profile.build.appId,
    profile: { lockSha256: profile.build.lockSha256, packageSha256: profile.build.packageSha256, image: profile.build.image, nodeVersion: profile.build.nodeVersion,
      buildProfileDigest: profile.build.buildProfileDigest },
    docker: deps.docker ?? createBoundedDockerRunner(), retained: chain.retained, issuer: profile.build.issuer, sign: ed25519Signer(issuerPem), now: deps.now });
  // The observer's prior-revision/restore readers are replaced by the release controller's own durable state when `publishing` is configured (always, here).
  const unreachable = async (): Promise<never> => { throw new Error("QDEV_LAUNCHER_DELIVERY_READER"); };
  const binding = journeyBinding(bundle.project), environment = journeyProfile(bundle.project).environment;
  // Owner-signed, scoped, single-use approvals are the ONLY way publishing is authorized. The approver must be independent of every key the pipeline holds.
  let activation;
  if (profile.publishing.activation) {
    const approvers = new Set(approverFingerprints(profile.publishing.activation.approverKeys));
    const pipeline = [...profile.verifier.keys.map(k => k.publicKeyPem), profile.build.issuer.publicKeyPem, ...(connection.keys as Array<{ publicKey: string }>).map(k => k.publicKey),
      ...(profile.verifier.producerPublicKeysPem ?? [])].map(pem => approverFingerprints([{ publicKeyPem: pem } as never])[0]);
    if (pipeline.some(fingerprint => approvers.has(fingerprint))) return null;
    activation = fileActivation({ dir: profile.publishing.activation.dir, keys: profile.publishing.activation.approverKeys, ownerId, appId: profile.build.appId,
      projectSha256: binding.projectSha256, environment, installationId: profile.publishing.installationId, now: deps.now });
  }
  return assembleQdevCustody({
    ...(confirmation ? { retainResult: (binding, result) => retainLocalFactoryResult(store,binding,result,async()=>(await runtimeConfig()).connection.keys) } : {}),
    slot: profile.slot, project: bundle.project, approvedRequest: bundle.conversation.approvedRequest, chain, connection, capability,
    ...(confirmation && confirmedWorks && store.database.atomic ? { delivered: async (delivery: { verdictSha256: string; deliverySha256: string; assurance: string }) => {
      const completed = await completeDeliveredStageWorks({ db: store.database as never, ctx: confirmation!, works: confirmedWorks!, delivery, reconcile: async workId => {
        const writers = new FactoryWriterStore(store), adapter = orderedAdapterFor(connection, capability, deps.factoryFetch, deps.capabilityFetch);
        const runs = await store.database.query(`SELECT id FROM engineering_route_runs WHERE scope_id=$1 AND scope_kind='personal' AND work_id=$2
          AND factory_request_id IS NOT NULL AND status NOT IN ('COMPLETED','FAILED','CANCELLED')`, [ownerId, workId]) as Array<{ id: string }>;
        for (const { id } of runs) {
          const terminal = await writers.reconcile(await writers.inspect(workId, id), adapter) as { status?: string };
          if (terminal.status !== "COMPLETED") throw new Error("OWNER_LOCAL_COMPLETION_WRITER_NOT_COMPLETED");
        }
      } });
      if (completed.auditPending) console.error('[qdev] Work completion committed; secondary audit pending reconciliation');
    } } : {}),
    sofie: profile.model ? { model: (deps.languageModel ?? ((id, apiKey) => createGateway({ apiKey })(id)))(profile.model.id, modelKey!), price: profile.model.price,
      system: profile.model.system, temperature: profile.model.temperature } : undefined,
    // Owner-local only: unmetered OWNER_SUBSCRIPTION_LOCAL runs settle only after their operation units are durably recorded (never $0).
    recordSubscriptionUsage: ownerLocal ? await subscriptionUsageRecorder(journalDb, journalId) : undefined,
    verifier: { origin: profile.verifier.origin, credentialName: profile.verifier.credentialEnv, timeoutMs: profile.verifier.timeoutMs, keys: profile.verifier.keys,
      producerKeyIds: profile.verifier.producerKeyIds ?? [], producerPublicKeysPem: profile.verifier.producerPublicKeysPem ?? [] },
    myapps: { source, now: deps.now, delivery: { enabled: true, environment, servedOrigin: profile.servedOrigin, ownerLocalLoopback: ownerLocal, projectSha256: binding.projectSha256,
      sourceSha256: binding.sourceSha256, priorRevision: unreachable, restorePointId: unreachable },
      publishing: { root: profile.publishing.root, appId: profile.build.appId, installationId: profile.publishing.installationId, ...(activation ? { activation } : {}),
        ...(confirmation && activation && profile.publishing.activation ? { ownerApproval: ownerLocalPublishApprover({ ctx: confirmation,
          approverPem: context.credential(profile.ownerLocalConfirmation!.authorizations.approverEnv) ?? "", keyId: profile.publishing.activation.approverKeys[0].keyId,
          dir: profile.publishing.activation.dir, appId: profile.build.appId, projectSha256: binding.projectSha256,
          installation: { environment, installationId: profile.publishing.installationId }, now: deps.now }) } : {}) } },
  });
}
