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
