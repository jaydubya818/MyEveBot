import type { QualificationAccounting } from "../external-alpha/qualification-accounting.ts";
import type { JourneyProjectInput } from "./journey-profile.ts";
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
  /** `detail` is an owner-safe refusal code of the underlying cause (see refusal-code.ts); `code` stays the stable root code. */
  constructor(readonly code: string, readonly detail?: string) { super(detail ? `${code}:${detail}` : code); }
}
export type QualificationPrincipal = {
  ownerId: string; kind: "human" | string; guest?: boolean; delegatedRole?: boolean; subagent?: boolean;
};
export type QualificationRootConfig = {
  /** The qualified cohort member this configuration was issued for. */
  ownerId: string;
  project: JourneyProjectInput;
  /** The approved journey plan is host-owned; the model supplies nothing. */
  plan: unknown;
  accounting: QualificationAccounting;
  journal: JourneyJournal;
  relay: RelayDeveloperTools;
  ports: Omit<WiringConfig, "project" | "relay" | "journal">;
};
/**
 * Private-beta owner-local installation: the plan is DERIVED from the owner-confirmed request text (owner-request.ts). `derive` returns the complete
 * per-request configuration (derived project, plan, cohort accounting, journal and ports) and the plan digest it was derived for, or null when any
 * protected input is missing. The root never trusts a model-supplied digest: it re-derives and compares.
 */
export type OwnerRequestRootConfig = {
  ownerId: string;
  /** `expectedPlanSha256` is the confirmed digest: on a mismatch the host returns the actual digest with `config: null` and builds nothing. */
  ownerRequest: { derive(request: string, expectedPlanSha256: string): Promise<{ planSha256: string; config: QualificationRootConfig | null; refusal?: string } | null> };
};
/** The confirmed request presented to the tool: the exact request text and the full plan digest the owner confirmed. */
export type QualificationRequest = { request: string; planSha256: string };
const isOwnerRequestConfig = (c: QualificationRootConfig | OwnerRequestRootConfig): c is OwnerRequestRootConfig => "ownerRequest" in c;
function parseRequest(input: unknown): QualificationRequest | null | undefined {
  if (input === undefined || (input && typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === 0)) return undefined;
  const v = input as Partial<QualificationRequest> | null;
  if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).sort().join(",") !== "planSha256,request") return null;
  if (typeof v.request !== "string" || v.request.length < 1 || v.request.length > 4000 || typeof v.planSha256 !== "string" || !/^[a-f0-9]{64}$/.test(v.planSha256)) return null;
  return { request: v.request, planSha256: v.planSha256 };
}

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
  config(ownerId: string): Promise<QualificationRootConfig | OwnerRequestRootConfig | null>;
};

export class QualificationRoot {
  private running = false;
  constructor(private readonly host: QualificationRootHost) {}

  async run(principal: QualificationPrincipal | null, input?: unknown): Promise<JourneyPresentation> {
    if (!this.host.enabled()) throw new QualificationRootRefused("QDEV_ROOT_DISABLED");
    if (!principal || principal.kind !== "human" || principal.guest || principal.delegatedRole || principal.subagent || !principal.ownerId)
      throw new QualificationRootRefused("QDEV_ROOT_PRINCIPAL");
    const request = parseRequest(input);
    if (request === null) throw new QualificationRootRefused("QDEV_ROOT_REQUEST_INVALID");
    const hostConfig = await this.host.config(principal.ownerId);
    if (!hostConfig) throw new QualificationRootRefused("QDEV_ROOT_UNCONFIGURED");
    if (hostConfig.ownerId !== principal.ownerId) throw new QualificationRootRefused("QDEV_ROOT_OWNER");
    // A frozen installation runs only its host plan; an owner-request installation runs only a confirmed request.
    if (isOwnerRequestConfig(hostConfig) ? !request : !!request) throw new QualificationRootRefused(request ? "QDEV_ROOT_REQUEST_UNEXPECTED" : "QDEV_ROOT_REQUEST_REQUIRED");
    // One Work at a time per process; the ledger enforces the cohort-wide concurrency.
    if (this.running) throw new QualificationRootRefused("QDEV_ROOT_BUSY");
    this.running = true;
    try {
      let config: QualificationRootConfig;
      if (isOwnerRequestConfig(hostConfig)) {
        const derived = await hostConfig.ownerRequest.derive(request!.request, request!.planSha256);
        if (!derived) throw new QualificationRootRefused("QDEV_ROOT_UNCONFIGURED");
        if (derived.planSha256 !== request!.planSha256) throw new QualificationRootRefused("QDEV_ROOT_REQUEST_MISMATCH");
        if (!derived.config) {
          const detail = derived.refusal && /^[A-Z][A-Z0-9_]{2,80}(?::[0-9]{1,2})?$/.test(derived.refusal) ? derived.refusal : undefined;
          console.error(`[qdev] root unconfigured: ${detail ?? "NO_CONFIGURATION"}`);
          throw new QualificationRootRefused("QDEV_ROOT_UNCONFIGURED", detail);
        }
        if (derived.config.ownerId !== principal.ownerId) throw new QualificationRootRefused("QDEV_ROOT_OWNER");
        config = derived.config;
      } else config = hostConfig;
      const env = wireJourneyEnvironment({ ...config.ports, project: config.project, relay: config.relay, journal: config.journal });
      try {
        const done = await new QualificationJourney(config.accounting, config.project, env).run(config.plan);
        // Owner-local: the verified, accepted delivery completes the confirmed stage Works. Best effort: a failure leaves them active (never a false completion).
        if (config.ports.delivered) {
          try { await config.ports.delivered({ verdictSha256: done.verdictSha256, deliverySha256: done.deliverySha256, assurance: done.assurance }); }
          catch (error) { console.error(`[qdev] stage Work completion refused: ${String(error instanceof Error ? error.message : error).replace(/[^\x20-\x7e]/g, " ").slice(0, 300)}`); }
        }
        return presentJourney(done, config.ports.factory.subscriptionUsage?.() ?? null);
      } catch (error) {
        if (error instanceof JourneyHalted) {
          // Durable, owner-safe halt fact for read-only progress. Best effort: a journal failure never changes the halt itself.
          try {
            const code = /^QDEV_[A-Z_]+$/.test(error.code) ? error.code : "QDEV_HALTED", events = await config.journal.read();
            // Operator diagnostics (server log only, never shown to the model): the exact refusal behind a generic QDEV_HALTED.
            if (code === "QDEV_HALTED") console.error(`[qdev] stage ${error.stage} halted: ${String(error.code).replace(/[^\x20-\x7e]/g, " ").slice(0, 400)}`);
            // One fact per halt: a repeat of the same halt with no accepted or settled progress since is not appended again.
            const progress = events.findLastIndex(e => e.kind === "STAGE_ACCEPTED" || e.kind === "OP_SETTLED" || e.kind === "DELIVERY_ACCEPTED");
            if (!events.some((e, index) => index > progress && e.kind === "HALTED" && e.stage === error.stage && e.code === code)) await config.journal.append({ kind: "HALTED", stage: error.stage, code });
          } catch { /* retained evidence is unchanged */ }
          return presentJourney(error, config.ports.factory.subscriptionUsage?.() ?? null);
        }
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
