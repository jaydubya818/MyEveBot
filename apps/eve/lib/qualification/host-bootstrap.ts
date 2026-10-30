import { runtimeHostSource } from "./host-source.ts";
import { registerQualificationHost, qualificationHostRegistered, type QdevConversation, type QualificationRootConfig, type QualificationRootHost } from "./root.ts";

/**
 * Production host bootstrap for the QDEV installation. It assembles the QualificationRootHost from a host SOURCE of
 * protected material (scoped execution, MissionControl, Factory, verifier and MyApps clients, the approved plan,
 * the qdev ledger and journal, and the owner's conversation model). The default source is the runtime-supplied loader (host-source.ts) with no protected ports enrolled, so every
 * transport is disabled: `config` and `conversation` return null (fail closed) until protected enrollment
 * and custody provide a real source. No credential, network or provider is touched here.
 */
export type QdevHostMaterial = QualificationRootConfig & { conversation: QdevConversation };
export type QdevHostSource = {
  enabled(): boolean;
  /** Complete trusted material for exactly this owner, or null (unenrolled, expired, revoked, foreign, incomplete). */
  material(ownerId: string): Promise<QdevHostMaterial | null>;
};

export const disabledHostSource: QdevHostSource = {
  enabled: () => process.env.MYEVE_QDEV_ENABLED === "true",
  material: async () => null,
};

export function assembleQualificationHost(source: QdevHostSource): QualificationRootHost {
  return {
    enabled: () => source.enabled(),
    async config(ownerId) {
      const m = await source.material(ownerId);
      if (!m || m.ownerId !== ownerId) return null;
      const { conversation: _conversation, ...config } = m;
      return config;
    },
    async conversation(ownerId) {
      const m = await source.material(ownerId);
      if (!m || m.ownerId !== ownerId || m.conversation.ownerId !== ownerId) return null;
      return m.conversation;
    },
  };
}

/**
 * Production default: the runtime loader with the pinned-custody ports provider. The provider is imported lazily and only when an installation is
 * enabled and enrolled, so a disabled deployment never loads the Factory/verifier/MyApps adapters. No pinned custody module means no ports, and the
 * installation stays disabled exactly as before.
 */
export const productionHostSource = (): QdevHostSource => runtimeHostSource(async context => (await import("./custody-loader.ts")).productionRuntimePorts(context));

/** Registers the host once at server startup of a QDEV installation; later calls are no-ops. Never driven by request content. */
export function ensureQualificationHost(source: QdevHostSource = productionHostSource()) {
  if (!qualificationHostRegistered()) registerQualificationHost(assembleQualificationHost(source));
}
