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

/** Registers the host once at server startup of a QDEV installation; later calls are no-ops. Never driven by request content. */
export function ensureQualificationHost(source: QdevHostSource = runtimeHostSource()) {
  if (!qualificationHostRegistered()) registerQualificationHost(assembleQualificationHost(source));
}
