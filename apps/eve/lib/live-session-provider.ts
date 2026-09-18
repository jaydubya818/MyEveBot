import type { ComputerSessionView } from "./computer-types.ts";

export interface LiveSessionCapabilities {
  liveView: boolean; humanTakeover: boolean; pause: boolean; resume: boolean;
  ownerInput: boolean; screenCapture: boolean;
}

export interface LiveSessionObservation {
  currentUrl: string | null;
  browserStatus: string | null;
  sessionStatus: string;
  observedAt: string;
}

export interface LiveSessionProvider {
  id: string;
  capabilities: LiveSessionCapabilities;
  observe(session: ComputerSessionView): Promise<LiveSessionObservation>;
}

const METADATA_ONLY: LiveSessionCapabilities = {
  liveView: false, humanTakeover: false, pause: true, resume: true,
  ownerInput: false, screenCapture: false,
};

const currentProvider: LiveSessionProvider = {
  id: "eve-computer-metadata",
  capabilities: METADATA_ONLY,
  async observe(session) {
    return {
      currentUrl: session.browser?.currentUrl ?? null,
      browserStatus: session.browser?.status ?? null,
      sessionStatus: session.status,
      observedAt: new Date().toISOString(),
    };
  },
};

export function liveSessionProviderFor(_environmentType: ComputerSessionView["environmentType"]): LiveSessionProvider {
  return currentProvider;
}

export function liveSessionCapabilitiesFor(_environmentType: ComputerSessionView["environmentType"]): LiveSessionCapabilities {
  return METADATA_ONLY;
}
