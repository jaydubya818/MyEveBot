import { qualificationBinding } from "../external-alpha/qualification-accounting.ts";
import { createPublicKey } from "node:crypto";
import { buildOrderedFactoryClients } from "./factory-ordered-clients.ts";
import type { FactoryCapabilityClientConfig } from "../engineering/factory-capability-client.ts";
import type { FactoryConnection } from "../engineering/factory-live-adapter.ts";
import { DeepAgentAdapter, type AgentExecutionPort } from "./agent-port.ts";
import { RetainedExecutorAgentPort, type AgentRuntime } from "./agent-execution-port.ts";
import { FactoryCodingRuntime } from "./factory-coding-runtime.ts";
import { LiveFactoryPort, type RetainedFactoryAdmission } from "./factory-live-port.ts";
import { HttpVerifierPort } from "./verifier-port.ts";
import { StaticBuildMyAppsPort, type StaticBuildPortConfig } from "./static-build.ts";
import type { QdevHostBundle, RuntimeHostDeps, RuntimePorts } from "./host-source.ts";
import type { StageExpected } from "./journey.ts";
import type { ResultKey } from "../engineering/factory-producer-protocol.ts";
import type { VerifierKey } from "./verdict.ts";

/**
 * Concrete composition of the four protected-custody ports for a QDEV installation from their EXISTING adapters:
 * DeepAgentAdapter (owner-scoped execution port), LiveFactoryPort over the actual ordered Factory clients, the independent-verifier
 * transport and the static-build MyApps port. It adds no authority: every adapter keeps its own pre-send refusals, the qdev ledger gate
 * stays the only spend authority, and any missing or mismatched piece yields `null` (the installation stays disabled).
 *
 * The `custody` object is the protected, host-supplied part (execution-port implementation, retained Work store, verifier origin and
 * pinned keys, static-build source, Factory connection and ordered-admission signing material). It is injected by the protected host
 * module at runtime and is never read from the bundle, the environment or a model.
 */
export type QdevCustody = {
  /**
   * A fully host-bound execution port, a Deep Agent runtime whose CODING tuple is read from the retained Factory admission, or the
   * Factory-backed CODING runtime (stages 1-2 run as native Factory work under the charged reservation; `sofie` supplies planning).
   */
  agent: { slot: "Q1" | "Q2" } & (
    | { port: AgentExecutionPort; runtime?: undefined; factoryCoding?: undefined }
    | { runtime: AgentRuntime; port?: undefined; factoryCoding?: undefined }
    | { factoryCoding: { sofie?: AgentRuntime }; port?: undefined; runtime?: undefined });
  factory: {
    connection: FactoryConnection; capability: FactoryCapabilityClientConfig;
    retained(stage: 1 | 2 | 3): RetainedFactoryAdmission | Promise<RetainedFactoryAdmission>;
    factoryFetch?: typeof fetch; capabilityFetch?: typeof fetch; settleTimeoutMs?: number; pollMs?: number;
  };
  verifier: { origin: string; credentialName: string; fetch?: typeof fetch; timeoutMs?: number; keys: VerifierKey[]; producerKeyIds: string[]; producerPublicKeysPem: string[] };
  myapps: StaticBuildPortConfig;
  expectedFor(stage: 1 | 2 | 3): StageExpected; resultKeys: ResultKey[]; sourceDigest: string;
  newAllowanceId(stage: number): string;
};

export class RuntimePortsRefused extends Error { constructor(readonly code: string) { super(code); } }

export function composeRuntimePorts(context: { bundle: QdevHostBundle; credential(name: string): string | undefined }, custody: QdevCustody): RuntimePorts {
  const binding = qualificationBinding(context.bundle.project);
  // The runtime already knows both producer trust sets. Redundant exclusion lists cannot omit those keys or rename their bytes.
  const actualProducerKeys = [...custody.resultKeys, ...custody.factory.connection.keys];
  const producerKeyIds = [...new Set([...custody.verifier.producerKeyIds, ...actualProducerKeys.map(key => key.keyId)])];
  const producerPublicKeysPem = [...new Set([...custody.verifier.producerPublicKeysPem, ...actualProducerKeys.map(key => key.publicKey)])];
  const fingerprint = (pem: string) => createPublicKey(pem).export({ type: "spki", format: "der" }).toString("base64");
  const producerFingerprints = new Set(producerPublicKeysPem.map(fingerprint));
  const credentialName = custody.verifier.credentialName;
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(credentialName)) throw new RuntimePortsRefused("QDEV_PORTS_VERIFIER_CREDENTIAL_NAME");
  const assertIndependent = () => {
    if (new Set([...custody.verifier.keys.map(k => k.keyId)]).size !== custody.verifier.keys.length
      || custody.verifier.keys.some(k => producerKeyIds.includes(k.keyId) || producerFingerprints.has(fingerprint(k.publicKeyPem))))
      throw new RuntimePortsRefused("QDEV_PORTS_VERIFIER_KEYS_NOT_DISJOINT");
  };
  assertIndependent();
  const { adapter } = buildOrderedFactoryClients({ connection: custody.factory.connection, capability: custody.factory.capability,
    factoryFetch: custody.factory.factoryFetch, capabilityFetch: custody.factory.capabilityFetch });
  const factory = new LiveFactoryPort({ enabled: true, retained: custody.factory.retained, settleTimeoutMs: custody.factory.settleTimeoutMs, pollMs: custody.factory.pollMs,
    live: { prepared: r => adapter.prepared(r), dispatch: i => adapter.dispatch(i), read: i => adapter.read(i), result: b => adapter.result(b) } });
  const agent = new DeepAgentAdapter({ enabled: true, ownerId: context.bundle.ownerId, slot: custody.agent.slot,
    projectSha256: binding.projectSha256, sourceSha256: binding.sourceSha256,
    port: custody.agent.port ?? new RetainedExecutorAgentPort({ retained: custody.factory.retained, runtime: custody.agent.factoryCoding
      ? new FactoryCodingRuntime({ project: context.bundle.project, factory, retained: custody.factory.retained, expectedFor: custody.expectedFor,
        sourceDigest: custody.sourceDigest, sofie: custody.agent.factoryCoding.sofie })
      : custody.agent.runtime }) });
  const verifier = new HttpVerifierPort({ enabled: true, origin: custody.verifier.origin, credential: () => context.credential(credentialName), fetch: custody.verifier.fetch, timeoutMs: custody.verifier.timeoutMs });
  const myapps = new StaticBuildMyAppsPort({ ...custody.myapps, source: async candidate => {
    const source = await custody.myapps.source(candidate);
    // Build provenance is producer authority too. Its actual signer becomes known during retention, before independent verification.
    if (!producerKeyIds.includes(source.issuer.keyId)) producerKeyIds.push(source.issuer.keyId);
    if (!producerPublicKeysPem.includes(source.issuer.publicKeyPem)) producerPublicKeysPem.push(source.issuer.publicKeyPem);
    producerFingerprints.add(fingerprint(source.issuer.publicKeyPem));
    assertIndependent();
    return source;
  } });
  return { agent, factory, verifier, myapps, expectedFor: custody.expectedFor, resultKeys: custody.resultKeys, sourceDigest: custody.sourceDigest,
    verifierKeys: custody.verifier.keys, producerKeyIds, producerPublicKeysPem,
    newAllowanceId: custody.newAllowanceId };
}

/** The `ports` provider for `runtimeHostSource`: composes from protected custody, or stays disabled (null) when it is absent or refused. */
export function runtimePortsProvider(custody: () => QdevCustody | null | Promise<QdevCustody | null>): NonNullable<RuntimeHostDeps["ports"]> {
  return async context => {
    try {
      const c = await custody();
      return c ? composeRuntimePorts(context, c) : null;
    } catch { return null; }
  };
}
