
import { createGateway, type LanguageModel } from "ai";
import { z } from "zod";
import type { ExecutionDatabase } from "../execution-types.ts";
import { qualificationBinding } from "../external-alpha/qualification-accounting.ts";
import { FactoryReceiptStore } from "../engineering/factory-receipt-store.ts";
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
  const secret = (name: string) => { const value = context.credential(name); return value && value.length <= 16384 ? value : null; };
  const signerJson = secret(profile.capability.signerEnv), relayCredential = secret(profile.capability.relay.credentialEnv),
    workloadToken = secret(profile.capability.relay.workloadTokenEnv), modelKey = secret(profile.model.apiKeyEnv),
    issuerPem = secret(profile.build.signerEnv), journalUrl = secret(bundle.credentials.journalDatabaseUrl);
  if (!signerJson || !relayCredential || !workloadToken || !modelKey || !issuerPem || !journalUrl) return null;
  const ownerId = bundle.ownerId;
  if (profile.build.issuer.ownerId !== ownerId) return null;
  const signer = propagation.parse(JSON.parse(signerJson)).signer as { keyId: string; jwk: JsonWebKey };

  const store = deps.store?.(ownerId) ?? new WorkStore({ scopeId: ownerId, scopeKind: "personal", actorId: ownerId });
  const runtimeConfig = () => (deps.runtimeConfig ?? ((s, id) => factoryConfigForWork(s, id)))(store, profile.workIds.stage1);
  const config = await runtimeConfig(), connection = config.connection;
  if (!("repositoryPath" in connection) || "transport" in connection) return null;
  // Unpaid preflight before anything can run: each stage Work budget must fit its approved operation reservation (else coding is refused only after Sofie has spent).
  let plan; try { plan = validateJourneyPlan(bundle.plan); } catch { return null; }
  await checkStageWorkBudgets(store.database, ownerId, plan, { 1: profile.workIds.stage1, 2: profile.workIds.stage2, 3: profile.workIds.stage3 });

  const capability = await ownerFactoryCapabilityConfig({ store, runtimeConfig, clientId: profile.capability.clientId, backendId: profile.capability.backendId,
    missionId: profile.capability.missionId, signer, send: deps.capabilityFetch,
    relay: { enrollment: profile.capability.relay.enrollment, enrollmentSha256: profile.capability.relay.enrollmentSha256, revision: profile.capability.relay.revision,
      credential: relayCredential, workloadIdentityToken: workloadToken } });

  const journalId = qdevJourneyId(ownerId, bundle.project), journalDb = deps.database(journalUrl);
  // The journal and retained-admission tables are applied by the operator (DDL is never run at startup). Absent tables keep the installation disabled.
  const [tables] = await journalDb.query("SELECT to_regclass('qjourney_event') AS journal, to_regclass('qdev_admission_claim') AS claim, to_regclass('qdev_retained_admission') AS retained");
  if (!tables?.journal || !tables.claim || !tables.retained) return null;
  const { chain } = storeBackedStageChain({ db: journalDb as never, journeyId: journalId, journal: new PostgresJournal(journalDb as never, journalId),
    sources: { enabled: true, store, authority: new FactoryRouteAuthority(store, runtimeConfig), receipts: new FactoryReceiptStore(store.principal, store.database),
      writers: new FactoryWriterStore(store), adapterFor: connection_ => orderedAdapterFor(connection_, capability, deps.factoryFetch, deps.capabilityFetch),
      workIds: { 1: profile.workIds.stage1, 2: profile.workIds.stage2, 3: profile.workIds.stage3 }, baseline: profile.baseline } });
  await chain.warm();

  const source = candidateStaticBuildSource({ repositoryPath: connection.repositoryPath, ownerId, appId: profile.build.appId,
    profile: { lockSha256: profile.build.lockSha256, packageSha256: profile.build.packageSha256, image: profile.build.image, nodeVersion: profile.build.nodeVersion,
      buildProfileDigest: profile.build.buildProfileDigest },
    docker: deps.docker ?? createBoundedDockerRunner(), retained: chain.retained, issuer: profile.build.issuer, sign: ed25519Signer(issuerPem), now: deps.now });
  // The observer's prior-revision/restore readers are replaced by the release controller's own durable state when `publishing` is configured (always, here).
  const unreachable = async (): Promise<never> => { throw new Error("QDEV_LAUNCHER_DELIVERY_READER"); };
  const binding = qualificationBinding(bundle.project);
  // Owner-signed, scoped, single-use approvals are the ONLY way publishing is authorized. The approver must be independent of every key the pipeline holds.
  let activation;
  if (profile.publishing.activation) {
    const approvers = new Set(approverFingerprints(profile.publishing.activation.approverKeys));
    const pipeline = [...profile.verifier.keys.map(k => k.publicKeyPem), profile.build.issuer.publicKeyPem, ...(connection.keys as Array<{ publicKey: string }>).map(k => k.publicKey),
      ...(profile.verifier.producerPublicKeysPem ?? [])].map(pem => approverFingerprints([{ publicKeyPem: pem } as never])[0]);
    if (pipeline.some(fingerprint => approvers.has(fingerprint))) return null;
    activation = fileActivation({ dir: profile.publishing.activation.dir, keys: profile.publishing.activation.approverKeys, ownerId, appId: profile.build.appId,
      projectSha256: binding.projectSha256, now: deps.now });
  }
  return assembleQdevCustody({
    slot: profile.slot, project: bundle.project, approvedRequest: bundle.conversation.approvedRequest, chain, connection, capability,
    sofie: { model: (deps.languageModel ?? ((id, apiKey) => createGateway({ apiKey })(id)))(profile.model.id, modelKey), price: profile.model.price,
      system: profile.model.system, temperature: profile.model.temperature },
    verifier: { origin: profile.verifier.origin, credentialName: profile.verifier.credentialEnv, timeoutMs: profile.verifier.timeoutMs, keys: profile.verifier.keys,
      producerKeyIds: profile.verifier.producerKeyIds ?? [], producerPublicKeysPem: profile.verifier.producerPublicKeysPem ?? [] },
    myapps: { source, now: deps.now, delivery: { enabled: true, environment: "myeve-qdev-20261029", servedOrigin: profile.servedOrigin, projectSha256: binding.projectSha256,
      sourceSha256: binding.sourceSha256, priorRevision: unreachable, restorePointId: unreachable },
      publishing: { root: profile.publishing.root, appId: profile.build.appId, installationId: profile.publishing.installationId, ...(activation ? { activation } : {}) } },
  });
}
