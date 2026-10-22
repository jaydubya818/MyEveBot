import type { CapabilityId, CapabilityStatus } from "./capabilities.ts";

const CAPABILITY_LABELS: Record<CapabilityId, string> = {
  appearance: "Appearance",
  reminders: "Reminders",
  triggers: "Triggers",
  memory: "Memory",
  connections: "Connected apps",
  skills: "Skills",
  computer: "Computer",
  finance: "Finance",
  goals: "Goals",
  knowledge: "Knowledge",
  phone: "Phone",
};

export function capabilityLabel(id: CapabilityId): string {
  return CAPABILITY_LABELS[id];
}

export function setupRequiredCapabilityLabels(
  capabilities: readonly CapabilityStatus[],
): string[] {
  return capabilities
    .filter((capability) => capability.state === "setup_required")
    .map((capability) => capabilityLabel(capability.id));
}

/**
 * Formats the detail line for a limited-mode capability notice.
 * Truncates at 3 visible labels to prevent run-on sentences (QA-38).
 */
export function formatLimitedModeDetail(labels: readonly string[]): string {
  if (labels.length > 3) {
    return `${labels[0]}, ${labels[1]}, and ${labels.length - 2} more need setup. Everything else remains available.`;
  }
  return `${labels.join(" and ")} ${labels.length === 1 ? "needs" : "need"} setup. Everything else remains available.`;
}
