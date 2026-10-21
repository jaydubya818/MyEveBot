import { externalAlphaInstallation } from "./policy.ts";

/** Relay under an external-alpha installation is a view and a link, nothing
 * else. These are the only owner commands it may run. Everything that publishes,
 * grants, messages, imports peer traffic, shares artifacts, sets reply policy or
 * pins peers is denied before it reaches the command handler. */
export const externalAlphaRelayOperations: ReadonlySet<string> = new Set([
  "connect", // link the local Agent to the owner's Relay identity
  "rotate", // explicit credential rotation (confirmed)
  "revoke-credential", // safety: always permitted
  "retire", // safety: always permitted
]);
export class ExternalAlphaRelayDenied extends Error {
  constructor(readonly operation: string) {
    super("EXTERNAL_ALPHA_RELAY_OPERATION_DENIED:" + operation);
  }
}

/** Linking to an existing Relay Agent issues a new Agent credential and silently
 * invalidates the previous one. The owner must see that and confirm it, bound to
 * the exact Agent being rotated. */
export class ExternalAlphaRelayRotationConfirmation extends Error {
  readonly code = "RELAY_ROTATION_CONFIRMATION_REQUIRED";
  constructor(
    readonly relayAgentId: string,
    readonly confirmation: string,
    readonly disclosure: string,
  ) {
    super("RELAY_ROTATION_CONFIRMATION_REQUIRED");
  }
}
export const relayRotationConfirmation = (relayAgentId: string) => "ROTATE_AGENT_CREDENTIAL:" + relayAgentId;
export const relayRotationDisclosure = (relayAgentId: string) =>
  `Linking to the existing Relay Agent ${relayAgentId} issues a new credential for it and permanently invalidates the old one. ` +
  `Anything else that uses the old credential stops working. Nothing is changed until you confirm with: ${relayRotationConfirmation(relayAgentId)}.`;

export function assertExternalAlphaRelayOperation(operation: string, env: NodeJS.ProcessEnv = process.env): void {
  if (externalAlphaInstallation(env) && !externalAlphaRelayOperations.has(operation))
    throw new ExternalAlphaRelayDenied(operation);
}
/** Called wherever a Relay Agent credential would be rotated. A fresh Agent (no
 * existing identity) creates a credential and rotates nothing. */
export function assertExternalAlphaRotationConfirmed(
  relayAgentId: string | null | undefined,
  supplied: unknown,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!externalAlphaInstallation(env) || !relayAgentId) return;
  if (supplied !== relayRotationConfirmation(relayAgentId))
    throw new ExternalAlphaRelayRotationConfirmation(
      relayAgentId,
      relayRotationConfirmation(relayAgentId),
      relayRotationDisclosure(relayAgentId),
    );
}
