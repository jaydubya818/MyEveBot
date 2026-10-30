import type { QualificationAccounting, QualificationProjectInput } from "../external-alpha/qualification-accounting.ts";
import { QualificationJourney, JourneyHalted } from "./journey.ts";
import { presentJourney, type JourneyPresentation } from "./presentation.ts";
import { wireJourneyEnvironment, type WiringConfig } from "./wiring.ts";
import type { JourneyJournal } from "./journal.ts";
import type { RelayDeveloperTools } from "./relay-tools.ts";

/**
 * Authenticated root composition for the qdev journey. This is the single place the real adapters
 * (Relay tools, Deep Agent adapter, Factory port, verifier port, MyApps port) are composed into the
 * gated journey. It is the only caller of `wireJourneyEnvironment` outside tests and is reached only through
 * the registered, owner-authenticated `qualification_journey` tool.
 *
 * Fail-closed by construction:
 *  - disabled unless the host switch is on AND the host provider returns a complete configuration;
 *  - the authenticated principal must be the human owner the configuration was issued for, never a
 *    subagent, guest, delegated role or model-supplied owner;
 *  - nothing is constructed (no ledger call, no port call) before those checks pass;
 *  - the journey's own gate (qdev_* ledger) remains the only spend authority: this adds none.
 */
export class QualificationRootRefused extends Error {
  constructor(readonly code: string) { super(code); }
}
export type QualificationPrincipal = {
  ownerId: string; kind: "human" | string; guest?: boolean; delegatedRole?: boolean; subagent?: boolean;
};
export type QualificationRootConfig = {
  /** The qualified cohort member this configuration was issued for. */
  ownerId: string;
  project: QualificationProjectInput;
  /** The approved journey plan is host-owned; the model supplies nothing. */
  plan: unknown;
  accounting: QualificationAccounting;
  journal: JourneyJournal;
  relay: RelayDeveloperTools;
  ports: Omit<WiringConfig, "project" | "relay" | "journal">;
};
/** Host-owned conversation model for the authenticated owner. The returned model must carry provider `myeve-qdev`
 *  and is the ONLY model the QDEV installation may call; the host is responsible for its scoped client/accounting. */
export type QdevConversationModel = { specificationVersion: string; provider: string; modelId: string; supportedUrls?: unknown; doGenerate(options: any): Promise<any>; doStream(options: any): Promise<any> };
export type QdevConversation = {
  ownerId: string; contextWindowTokens: number;
  model(input: { sessionId: string; stepKey: string }): QdevConversationModel;
};
export type QualificationRootHost = {
  enabled(): boolean;
  /** The owner's QDEV conversation model, or null when the owner is unconfigured, expired, revoked or foreign. */
  conversation?(ownerId: string): Promise<QdevConversation | null>;
  /** Complete trusted configuration for this owner, or null when any protected input is missing. */
  config(ownerId: string): Promise<QualificationRootConfig | null>;
};

export class QualificationRoot {
  private running = false;
  constructor(private readonly host: QualificationRootHost) {}

  async run(principal: QualificationPrincipal | null): Promise<JourneyPresentation> {
    if (!this.host.enabled()) throw new QualificationRootRefused("QDEV_ROOT_DISABLED");
    if (!principal || principal.kind !== "human" || principal.guest || principal.delegatedRole || principal.subagent || !principal.ownerId)
      throw new QualificationRootRefused("QDEV_ROOT_PRINCIPAL");
    const config = await this.host.config(principal.ownerId);
    if (!config) throw new QualificationRootRefused("QDEV_ROOT_UNCONFIGURED");
    if (config.ownerId !== principal.ownerId) throw new QualificationRootRefused("QDEV_ROOT_OWNER");
    // One Work at a time per process; the ledger enforces the cohort-wide concurrency.
    if (this.running) throw new QualificationRootRefused("QDEV_ROOT_BUSY");
    this.running = true;
    try {
      const env = wireJourneyEnvironment({ ...config.ports, project: config.project, relay: config.relay, journal: config.journal });
      try {
        return presentJourney(await new QualificationJourney(config.accounting, config.project, env).run(config.plan));
      } catch (error) {
        if (error instanceof JourneyHalted) return presentJourney(error);
        throw error;
      }
    } finally { this.running = false; }
  }
}

/** Default host: nothing is enabled and no protected input exists until real enrollment/custody provides them. */
export const disabledQualificationHost: QualificationRootHost = {
  enabled: () => false,
  config: async () => null,
};
let host: QualificationRootHost = disabledQualificationHost;
/** Host composition registers the real host exactly once at startup (never from a request). */
export function registerQualificationHost(next: QualificationRootHost) {
  if (host !== disabledQualificationHost) throw new QualificationRootRefused("QDEV_ROOT_ALREADY_REGISTERED");
  host = next;
}
export const qualificationRoot = () => new QualificationRoot(host);
export const qualificationHost = (): QualificationRootHost => host;
export const qualificationHostRegistered = () => host !== disabledQualificationHost;
