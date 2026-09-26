import type { ContextPackage, DigitalWorkContract } from "./contracts.ts";

export type ProviderKind = "DEEP_AGENT" | "EXECUTOR" | "MYFACTORY" | "RELAY";
export type CapabilitySupport = "SUPPORTED" | "UNSUPPORTED";

export interface ProviderRef {
  id: string;
  version: number;
}

/** Declared features only. Health, qualification and authority are separate current facts. */
export interface ProviderCapabilityMetadata<Kind extends ProviderKind, Operation extends string> {
  kind: Kind;
  provider: ProviderRef;
  operations: Readonly<Record<Operation, CapabilitySupport>>;
}

/** Unsupported is a first-class outcome, not a thrown provider failure. */
export type ProviderOutcome<Value, Operation extends string> =
  | { status: "OK"; value: Value }
  | { status: "UNSUPPORTED"; operation: Operation; reason: string };

/** These references are correlation and fencing data, never credentials or action grants. */
export interface ProviderStartInput {
  work: DigitalWorkContract;
  context: ContextPackage;
  generation: number;
  idempotencyKey: string;
}

export interface ProviderRunRef {
  provider: ProviderRef;
  workId: string;
  workVersion: number;
  generation: number;
  runId: string;
}

export interface ProviderObservation {
  state: "QUEUED" | "RUNNING" | "BLOCKED" | "COMPLETED" | "FAILED" | "LOST" | "STOPPED";
  observedAt: string;
  sourceRef: string;
}

export interface ProviderInput {
  content: string;
  sourceRef: string;
  idempotencyKey: string;
}

export interface ProviderCheckpoint {
  run: ProviderRunRef;
  checkpointRef: string;
  contentHash: string;
}

/** Provider claims are observations; MyEve must reconcile and independently verify results. */
export interface ProviderCollectedResult {
  resultRevision: string | null;
  artifactRefs: string[];
  sourceRef: string;
  limitations: string[];
}

export interface ProviderUsage {
  coverage: "METERED" | "ESTIMATED" | "UNKNOWN";
  providerCostUsd: number | null;
  sourceRef: string | null;
}

export interface StopRequestReceipt {
  requestedAt: string;
  sourceRef: string;
}

export type HarnessOperation = "start" | "observe" | "sendInput" | "checkpoint" | "resume" |
  "requestStop" | "collectResult" | "collectUsage";

/** Sofie's replaceable harness. A caller must admit Work and recheck every consequential effect. */
export interface HarnessProvider {
  readonly metadata: ProviderCapabilityMetadata<"DEEP_AGENT", HarnessOperation>;
  start(input: ProviderStartInput): Promise<ProviderOutcome<ProviderRunRef, "start">>;
  observe(run: ProviderRunRef): Promise<ProviderOutcome<ProviderObservation, "observe">>;
  sendInput(run: ProviderRunRef, input: ProviderInput): Promise<ProviderOutcome<void, "sendInput">>;
  checkpoint(run: ProviderRunRef): Promise<ProviderOutcome<ProviderCheckpoint, "checkpoint">>;
  resume(checkpoint: ProviderCheckpoint, idempotencyKey: string): Promise<ProviderOutcome<ProviderRunRef, "resume">>;
  requestStop(run: ProviderRunRef): Promise<ProviderOutcome<StopRequestReceipt, "requestStop">>;
  collectResult(run: ProviderRunRef): Promise<ProviderOutcome<ProviderCollectedResult, "collectResult">>;
  collectUsage(run: ProviderRunRef): Promise<ProviderOutcome<ProviderUsage, "collectUsage">>;
}

export type ExecutorOperation = "start" | "observe" | "followUp" | "requestStop" |
  "collectCandidate" | "collectUsage";

/** Bounded specialist execution; an adapter may wrap the current Golden Work executor. */
export interface ExecutorProvider {
  readonly metadata: ProviderCapabilityMetadata<"EXECUTOR", ExecutorOperation>;
  start(input: ProviderStartInput): Promise<ProviderOutcome<ProviderRunRef, "start">>;
  observe(run: ProviderRunRef): Promise<ProviderOutcome<ProviderObservation, "observe">>;
  followUp(run: ProviderRunRef, input: ProviderInput): Promise<ProviderOutcome<void, "followUp">>;
  requestStop(run: ProviderRunRef): Promise<ProviderOutcome<StopRequestReceipt, "requestStop">>;
  collectCandidate(run: ProviderRunRef): Promise<ProviderOutcome<ProviderCollectedResult, "collectCandidate">>;
  collectUsage(run: ProviderRunRef): Promise<ProviderOutcome<ProviderUsage, "collectUsage">>;
}

export interface FactoryRequestRef {
  provider: ProviderRef;
  workId: string;
  workVersion: number;
  requestId: string;
}

/** Curated handoff references, never a full Agent transcript or private context dump. */
export interface FactoryRequestInput {
  workId: string;
  workVersion: number;
  generation: number;
  idempotencyKey: string;
  specificationRef: string;
  disclosedArtifactRefs: string[];
}

export type FactoryOperation = "submit" | "observe" | "collectResult";

/** Submit is intake only. It does not assert a Factory Run started or finished. */
export interface FactoryProvider {
  readonly metadata: ProviderCapabilityMetadata<"MYFACTORY", FactoryOperation>;
  submit(input: FactoryRequestInput): Promise<ProviderOutcome<FactoryRequestRef, "submit">>;
  observe(request: FactoryRequestRef): Promise<ProviderOutcome<ProviderObservation, "observe">>;
  collectResult(request: FactoryRequestRef): Promise<ProviderOutcome<ProviderCollectedResult, "collectResult">>;
}

export interface PeerRequestRef {
  provider: ProviderRef;
  workId: string;
  workVersion: number;
  requestId: string;
  peerAgentId: string;
}

/** Only explicitly selected content references are shared with the peer. */
export interface PeerRequestInput {
  workId: string;
  workVersion: number;
  idempotencyKey: string;
  peerAgentId: string;
  capability: "knowledge.query" | "message.send" | "work.request";
  payloadRef: string;
  disclosedContextRefs: string[];
}

export type PeerOperation = "request" | "observe" | "collectResult";

/** A bounded Relay request; the peer receives only an explicitly disclosed package. */
export interface PeerProvider {
  readonly metadata: ProviderCapabilityMetadata<"RELAY", PeerOperation>;
  request(input: PeerRequestInput): Promise<ProviderOutcome<PeerRequestRef, "request">>;
  observe(request: PeerRequestRef): Promise<ProviderOutcome<ProviderObservation, "observe">>;
  collectResult(request: PeerRequestRef): Promise<ProviderOutcome<ProviderCollectedResult, "collectResult">>;
}
