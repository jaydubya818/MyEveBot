import { hostedOwnerScope, hostedProfileFromEnv } from "../qualification/hosted-profile.ts";

/**
 * The owner id the CAPABILITY layer presents to MyFactory, Relay and MissionControl (capability_control rows, signed source permits,
 * Relay lease enrollments, MissionControl capability bindings and policy propagation).
 *
 * Hosted private beta: MyFactory admits an ordered capability only when its enrollment owner equals the client's ownerScope, and the hosted
 * client's ownerScope is the per-person `hostedOwnerScope(profile)`. So a hosted installation keys its capability identity on that scope.
 * Every other installation (owner-local, external alpha, personal) returns the plain owner id unchanged.
 *
 * Only the capability identity changes. Work ownership, agents, chats and all user data stay keyed on the plain owner id.
 */
export function capabilityOwnerId(ownerId: string, env: Readonly<Record<string, string | undefined>> = process.env): string {
  const profile = hostedProfileFromEnv(env);
  return profile && profile.ownerId === ownerId ? hostedOwnerScope(profile) : ownerId;
}

const ownerConfirmationKeyId: string = "bf039c134f2ab76cab2fde4ae0c4959e5e29a25cdd0b393c4811f0737fd005dd";

// The limited owner witness exemption is bound to the installed confirmation signer.
export const WITNESS_EXEMPT_OWNER = Object.freeze({
  installationId: "jay",
  vercelProjectId: "prj_L6faw25wnFGUZtrLKBIccg8gIDLR",
  ownerId: "owner",
  origin: "https://sofie-personal-agent.vercel.app",
  confirmationKeyId: ownerConfirmationKeyId,
});
