
import { spawn } from "node:child_process";
import { createPrivateKey, randomUUID, sign as edSign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LanguageModel } from "ai";
import type { StaticBuildBinding, StaticBuildIssuer } from "../../../../packages/myapps/src/static-build-claim.ts";
import type { PolicyKey, SignedPolicyMessage } from "../../../../packages/capability-enforcement/src/ordering-wire.ts";
import { prepareAuthenticatedLocalFactoryInputV4 } from "../engineering/factory-authenticated-result.ts";
import type { FactoryCapabilityClientConfig } from "../engineering/factory-capability-client.ts";
import { issueFactorySourcePermit } from "../engineering/factory-capability-source.ts";
import { factoryRelayLeaseConfig, FactoryRelayLeaseClient } from "../engineering/factory-relay-lease-client.ts";
import { factoryRequestHeaders } from "../engineering/factory-request-headers.ts";
import type { FactoryConnection } from "../engineering/factory-live-adapter.ts";
import type { FactoryRuntime } from "../engineering/factory-routing.ts";
import type { ResultKey } from "../engineering/factory-producer-protocol.ts";
import type { WorkStore } from "../engineering/store.ts";
import { MissionControlBindings } from "../missioncontrol/permit-store.ts";
import type { QualificationProjectInput } from "../external-alpha/qualification-accounting.ts";
import { buildOrderedFactoryClients } from "./factory-ordered-clients.ts";
import { DurableStageAdmitter } from "./retained-admissions.ts";
import { FactoryStageAdmitter } from "./factory-stage-admission.ts";
import { StoreBackedStageSources, type StageStoreSourcesConfig } from "./factory-stage-store-sources.ts";
import type { StageStart } from "./factory-dispatch.ts";
import type { RetainedFactoryAdmission } from "./factory-live-port.ts";
import type { JournalEvent } from "./journal.ts";
import type { StageExpected } from "./journey.ts";
import { SofiePlanningRuntime, type ModelPrice } from "./sofie-planning-runtime.ts";
import { aiSdkMeteredModel } from "./sofie-ai-sdk-model.ts";
import { createBoundedDockerRunner, exportStaticBuild, staticBuildSourceFor, type DockerRunner } from "./static-build-export.ts";
import type { StaticBuildPortConfig } from "./static-build.ts";
import type { QdevCustody } from "./runtime-ports.ts";

/**
 * Non-secret custody ASSEMBLY for a QDEV installation. It only composes bodies that already exist and are separately qualified:
 *  - stage chain: StoreBackedStageSources -> FactoryStageAdmitter -> DurableStageAdmitter. The stage 2/3 start is the candidate of the journal's
 *    own STAGE_ACCEPTED event for the predecessor (written only after the signed Result was authenticated); the frozen Result expectation is the
 *    retained, re-validated LocalFactoryBindingV4 of the stage. Neither is a model value, an operator value or a Factory-reported value.
 *  - ordered Factory capability: the canonical MissionControl enrollment, `issueFactorySourcePermit` (owner, Work, MC execution permit, tuple,
 *    persisted preparation, challenge and action-digest checks for the ACTUAL local V4 request) and the existing FactoryRelayLeaseClient.
 *  - static build: the accepted candidate commit is materialized from the Factory repository, its tree is re-proved by `exportStaticBuild`
 *    (pinned lock/package/image, bounded docker), and the claim is signed by the injected issuer custody.
 *  - Sofie: SofiePlanningRuntime over the injected language model and the owner-attested price.
 * It reads no secret value itself, opens no transport, reserves nothing and dispatches nothing. Every protected input (model, signing keys,
 * credentials, docker runner) is injected; every adapter keeps its own pre-send refusals and the qdev ledger gate stays the only spend authority.
 */
export class CustodyAssemblyRefused extends Error { constructor(readonly code: string) { super(code); } }
const refuse = (code: string): never => { throw new CustodyAssemblyRefused(code); };
type Stage = 1 | 2 | 3;
type Db = { query(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>> };
const COMMIT = /^[a-f0-9]{40}$/;

/** The accepted predecessor candidate for `stage` (2|3) from the durable journal, or null before acceptance. Conflicting acceptances refuse. */
export function acceptedPredecessor(events: JournalEvent[], stage: 2 | 3): StageStart | null {
  const accepted = events.filter(event => event.kind === "STAGE_ACCEPTED" && event.stage === stage - 1);
  if (!accepted.length) return null;
  const seen = new Set<string>();
  for (const event of accepted) {
    const candidate = event.kind === "STAGE_ACCEPTED" ? event.candidate : undefined;
    if (!candidate || !COMMIT.test(candidate.commit) || !COMMIT.test(candidate.tree)) return refuse("QDEV_CHAIN_PREDECESSOR_CANDIDATE");
    seen.add(`${candidate.commit}:${candidate.tree}`);
  }
  if (seen.size !== 1) return refuse("QDEV_CHAIN_PREDECESSOR_AMBIGUOUS");
  const [commit, tree] = [...seen][0].split(":");
  return { commit, tree };
}

/** The frozen Result expectation implied by a retained admission (authenticated binding parser, never a returned Result). */
export function expectedFromAdmission(admission: RetainedFactoryAdmission): StageExpected {
  const b = prepareAuthenticatedLocalFactoryInputV4(admission.binding);
  return { factoryId: b.factoryId, configurationDigest: b.configurationDigest, configuration: b.configuration, requestId: b.requestId,
    requestDigest: b.requestDigest, workOrderId: b.workOrderId, runId: b.runId, attemptNumber: b.attemptNumber };
}

export type StageChainConfig = {
  db: Db; journeyId: string; journal: { read(): Promise<JournalEvent[]> };
  sources: Omit<StageStoreSourcesConfig, "predecessor">;
};
/** Durable, at-most-once stage admission with retained-binding-derived expectations over any inner stage admitter. */
export class QdevStageChain {
  private readonly expected = new Map<Stage, StageExpected>();
  private readonly durable: DurableStageAdmitter;
  constructor(c: { db: Db; journeyId: string; inner: { retained(stage: Stage): Promise<RetainedFactoryAdmission> } }) {
    this.durable = new DurableStageAdmitter({ db: c.db, journeyId: c.journeyId, inner: c.inner });
  }
  /** Restores expectations of already retained stages after a restart. Read-only: it never claims, prepares or dispatches. */
  async warm(): Promise<void> {
    for (const stage of [1, 2, 3] as const) {
      const stored = await this.durable.peek(stage);
      if (stored) this.expected.set(stage, expectedFromAdmission(stored));
    }
  }
  readonly retained = async (stage: Stage): Promise<RetainedFactoryAdmission> => {
    const admission = await this.durable.retained(stage);
    this.expected.set(stage, expectedFromAdmission(admission));
    return admission;
  };
  readonly expectedFor = (stage: Stage): StageExpected => this.expected.get(stage) ?? refuse("QDEV_CHAIN_EXPECTATION_UNAVAILABLE");
}

/** The production chain: StoreBackedStageSources (predecessor = the journal's accepted candidate) -> FactoryStageAdmitter -> durable retention. */
export function storeBackedStageChain(c: StageChainConfig): { chain: QdevStageChain; sources: StoreBackedStageSources } {
  const sources = new StoreBackedStageSources({ ...c.sources, predecessor: async stage => acceptedPredecessor(await c.journal.read(), stage) });
  return { chain: new QdevStageChain({ db: c.db, journeyId: c.journeyId, inner: new FactoryStageAdmitter(sources) }), sources };
}

export type OwnerCapabilityConfig = {
  store: WorkStore; runtimeConfig(): Promise<FactoryRuntime>;
  /** Non-secret ids of the installed capability client. */
  clientId: string; backendId: string; missionId: string;
  /** Source issuer signer (the same protected signer the canonical MissionControl source issuer uses). Injected, never printed. */
  signer: PolicyKey;
  relay: { enrollment: unknown; enrollmentSha256: string; revision: number; credential: string; workloadIdentityToken: string };
  send?: typeof fetch;
};
/**
 * FactoryCapabilityClientConfig from canonical authorities: the verification key, incarnation and enrollment version are read from the installed
 * capability_control destination row; the owner/installation/connection come from the MissionControl enrollment; the permits are issued by
 * `issueFactorySourcePermit` and the existing Factory Relay lease client. No signing callback is operator-written.
 */
export async function ownerFactoryCapabilityConfig(c: OwnerCapabilityConfig): Promise<FactoryCapabilityClientConfig> {
  const ownerId = c.store.principal.scopeId;
  if (c.store.principal.scopeKind !== "personal" || c.store.principal.actorId !== ownerId || !c.store.database.atomic) return refuse("QDEV_ASSEMBLY_OWNER_STORE");
  const enrollment = await new MissionControlBindings(c.store.database, ownerId).enrollment();
  const config = await c.runtimeConfig(), connection = config.connection;
  if (!("repositoryPath" in connection) || "transport" in connection) return refuse("QDEV_ASSEMBLY_LOCAL_CONNECTION");
  const row = await c.store.database.atomic(async database => {
    await database.query("SELECT set_config('myeve.capability_owner',$1,true),set_config('myeve.capability_installation',$2,true)", [ownerId, enrollment.installationId]);
    const [installation] = await database.query("SELECT organization_id FROM capability_control.installations WHERE id=$1 AND active", [enrollment.installationId]);
    const [destination] = await database.query("SELECT key_id,public_jwk,incarnation,enrollment_version FROM capability_control.policy_destinations WHERE installation_id=$1 AND owner_id=$2 AND backend_id=$3",
      [enrollment.installationId, ownerId, c.backendId]);
    return { installation, destination };
  });
  if (!row.installation || !row.destination) return refuse("QDEV_ASSEMBLY_CAPABILITY_DESTINATION");
  const relay = factoryRelayLeaseConfig(c.relay.enrollment, { ownerId, installationId: enrollment.installationId, connectionId: enrollment.connectionId,
    revision: c.relay.revision, digest: c.relay.enrollmentSha256 }, { credential: c.relay.credential, workloadIdentityToken: c.relay.workloadIdentityToken });
  const relayClient = new FactoryRelayLeaseClient(relay, c.send ?? fetch);
  return {
    origin: connection.origin,
    binding: { ownerId, organizationId: String(row.installation.organization_id), installationId: enrollment.installationId, agentId: config.engineering.agentId,
      clientId: c.clientId, backendId: c.backendId, incarnation: String(row.destination.incarnation), enrollmentVersion: Number(row.destination.enrollment_version),
      missionId: c.missionId, factoryId: connection.factoryId, factoryVersion: connection.factoryVersion, sourceDigest: connection.sourceDigest,
      configurationDigest: connection.configurationDigest } as FactoryCapabilityClientConfig["binding"],
    key: { keyId: String(row.destination.key_id), jwk: row.destination.public_jwk as JsonWebKey },
    headers: () => factoryRequestHeaders(connection),
    sourcePermit: async (challenge: SignedPolicyMessage, request: Record<string, any>, proof) =>
      issueFactorySourcePermit(c.store, await c.runtimeConfig(), enrollment, c.backendId, c.signer, challenge, request, proof),
    relayPermit: source => relayClient.issue(source),
  };
}

async function runCapture(command: string, args: string[], input?: Uint8Array): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "ignore"], env: { PATH: process.env.PATH ?? "/usr/bin:/bin", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", LC_ALL: "C" } as unknown as NodeJS.ProcessEnv });
    const out: Buffer[] = []; let size = 0;
    child.stdout.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 256 * 1024 * 1024) { child.kill("SIGKILL"); reject(new CustodyAssemblyRefused("QDEV_ASSEMBLY_ARCHIVE_TOO_LARGE")); } else out.push(chunk); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(Buffer.concat(out)) : reject(new CustodyAssemblyRefused("QDEV_ASSEMBLY_GIT")));
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });
}

export type CandidateBuildConfig = {
  /** The Factory repository the accepted candidate objects live in (the qualified local V4 `repositoryPath`). */
  repositoryPath: string;
  ownerId: string; appId: string;
  profile: { lockSha256: string; packageSha256: string; image: string; nodeVersion: string; buildProfileDigest: string };
  docker: DockerRunner;
  /** The retained stage-3 admission (Work revision, request, run and Factory pins). */
  retained(stage: 3): Promise<RetainedFactoryAdmission>;
  issuer: StaticBuildIssuer;
  /** Ed25519 issuer custody signer (injected). */
  sign(message: Uint8Array): Promise<Uint8Array> | Uint8Array;
  now?: () => number; leaseRoot?: string; workRoot?: string;
};
/**
 * `StaticBuildPortConfig.source` for the accepted stage-3 candidate: the candidate commit is archived from the Factory repository into a private
 * directory, `exportStaticBuild` re-proves its tree against the accepted pin and builds once in the pinned bounded container, then the claim is
 * signed by the issuer custody. The binding is derived from the retained admission and the accepted candidate, never from the built bytes.
 */
export function candidateStaticBuildSource(c: CandidateBuildConfig): StaticBuildPortConfig["source"] {
  return staticBuildSourceFor({
    issuer: c.issuer, sign: c.sign, now: c.now,
    async export(candidate) {
      if (!COMMIT.test(candidate.commit) || !COMMIT.test(candidate.tree)) return refuse("QDEV_ASSEMBLY_CANDIDATE");
      const tree = (await runCapture("git", ["-C", c.repositoryPath, "rev-parse", "--verify", `${candidate.commit}^{tree}`])).toString("utf8").trim();
      if (tree !== candidate.tree) return refuse("QDEV_ASSEMBLY_CANDIDATE_TREE");
      const dir = await mkdtemp(join(c.workRoot ?? tmpdir(), "qdev-candidate-"));
      try {
        const archive = await runCapture("git", ["-C", c.repositoryPath, "archive", "--format=tar", candidate.commit]);
        await runCapture("tar", ["-x", "-f", "-", "-C", dir], archive);
        return await exportStaticBuild({ sourceDir: dir, pins: candidate, profileLockSha256: c.profile.lockSha256, profilePackageSha256: c.profile.packageSha256,
          image: c.profile.image, nodeVersion: c.profile.nodeVersion, docker: c.docker, leaseRoot: c.leaseRoot });
      } finally { await rm(dir, { recursive: true, force: true }); }
    },
    async binding(candidate): Promise<StaticBuildBinding> {
      const admission = await c.retained(3), b = prepareAuthenticatedLocalFactoryInputV4(admission.binding);
      if (admission.request.requestId !== b.requestId || !Number.isFinite(Date.parse(admission.request.deadline))) return refuse("QDEV_ASSEMBLY_BINDING");
      return { ownerId: c.ownerId, agentId: b.agentId, appId: c.appId, workId: b.workId, workVersion: b.workVersion, workGeneration: b.workGeneration,
        requestId: b.requestId, runId: b.runId, factoryId: b.factoryId, factoryVersion: b.factoryVersion, sourceDigest: b.sourceDigest,
        configurationDigest: b.configurationDigest, inputCommit: b.inputCommit, inputTree: b.inputTree, candidateCommit: candidate.commit,
        candidateTree: candidate.tree, lockSha256: c.profile.lockSha256, buildProfileDigest: c.profile.buildProfileDigest, deadline: new Date(admission.request.deadline).toISOString() };
    },
  });
}

/** Ed25519 PEM -> claim signer. The key material stays inside this closure. */
export function ed25519Signer(privateKeyPem: string): (message: Uint8Array) => Uint8Array {
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== "ed25519") throw new CustodyAssemblyRefused("QDEV_ASSEMBLY_SIGNER_ALGORITHM");
  return message => edSign(null, Buffer.from(message), key);
}

export type AssemblyInputs = {
  slot: "Q1" | "Q2"; project: QualificationProjectInput; approvedRequest: string;
  chain: QdevStageChain;
  connection: FactoryConnection; capability: FactoryCapabilityClientConfig;
  sofie: { model: LanguageModel; price: ModelPrice; system: string; temperature?: number };
  verifier: QdevCustody["verifier"];
  myapps: QdevCustody["myapps"];
  newAllowanceId?: (stage: number) => string;
};
/** Builds the `QdevCustody` consumed by composeRuntimePorts. Local V4 only: a cloud/production connection is refused here. */
export function assembleQdevCustody(i: AssemblyInputs): QdevCustody {
  const connection = i.connection;
  if (!("repositoryPath" in connection) || "transport" in connection) return refuse("QDEV_ASSEMBLY_LOCAL_CONNECTION");
  const sofie = new SofiePlanningRuntime({ model: aiSdkMeteredModel(i.sofie.model, { temperature: i.sofie.temperature }), price: i.sofie.price,
    request: i.approvedRequest, system: i.sofie.system });
  return {
    agent: { slot: i.slot, factoryCoding: { sofie } },
    factory: { connection, capability: i.capability, retained: i.chain.retained },
    verifier: i.verifier, myapps: i.myapps,
    expectedFor: i.chain.expectedFor, resultKeys: connection.keys as ResultKey[], sourceDigest: connection.sourceDigest,
    newAllowanceId: i.newAllowanceId ?? (() => randomUUID()),
  };
}

/** Ordered clients shared by the stage chain's `adapterFor` and the custody `factory` (same connection and capability config). */
export function orderedAdapterFor(connection: FactoryConnection, capability: FactoryCapabilityClientConfig, factoryFetch?: typeof fetch, capabilityFetch?: typeof fetch) {
  return buildOrderedFactoryClients({ connection, capability, factoryFetch, capabilityFetch }).adapter;
}
export { createBoundedDockerRunner };
