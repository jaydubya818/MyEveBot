import type { WorkContract } from "./contract.ts";
import type { Candidate, EngineeringRun, Evidence } from "./execution.ts";
import type { RepositorySnapshot } from "./github.ts";

export interface Executor {
  readonly kind: "claude-code";
  readonly capabilities: { resumeSession: false; automaticFailover: false };
  start(contract: WorkContract, run: EngineeringRun, snapshot: RepositorySnapshot): Promise<void>;
  observe(run: EngineeringRun): Promise<"running"|"completed"|"lost"|"failed">;
  followUp(contract: WorkContract, run: EngineeringRun, snapshot: RepositorySnapshot): Promise<void>;
  requestStop(run: EngineeringRun): Promise<void>;
  /** Read only. Unknown daemon state must never be interpreted as an absent resource. */
  inspectCustody(run: EngineeringRun): Promise<{container:"running"|"stopped"|"absent";volume:"present"|"absent"}>;
  collectCandidate(contract: WorkContract, run: EngineeringRun, snapshot: RepositorySnapshot): Promise<Candidate>;
  collectUsage(run: EngineeringRun): Promise<{coverage:string;providerCostUsd:number|null}>;
  cleanup(run: EngineeringRun): Promise<void>;
}
export interface ProtectedVerifier {
  verify(contract: WorkContract, candidate: Candidate): Promise<Evidence[]>;
}
