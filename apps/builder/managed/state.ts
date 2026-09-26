export const MANAGED_EVE_STATES = [
  "requested", "approved", "provisioning", "deploying", "verifying",
  "ready", "paused", "failed", "retiring", "retired",
] as const;

export type ManagedEveState = (typeof MANAGED_EVE_STATES)[number];

const transitions: Record<ManagedEveState, readonly ManagedEveState[]> = {
  requested: ["approved", "retired"],
  approved: ["provisioning", "retired"],
  provisioning: ["deploying", "failed"],
  deploying: ["verifying", "failed"],
  verifying: ["ready", "failed"],
  ready: ["paused", "deploying", "retiring", "failed"],
  paused: ["ready", "deploying", "retiring"],
  failed: ["approved", "provisioning", "deploying", "verifying", "retiring"],
  retiring: ["retired", "failed"],
  retired: [],
};

export function canTransition(from: ManagedEveState, to: ManagedEveState): boolean {
  return transitions[from].includes(to);
}

export function managedProjectName(environmentId: string): string {
  if (!/^env_[a-f0-9]{24}$/.test(environmentId)) throw new Error("Invalid managed Eve ID");
  return `myeve-beta-${environmentId.slice(4)}`;
}

export function normalizeInviteEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Enter a valid tester email");
  }
  return normalized;
}
