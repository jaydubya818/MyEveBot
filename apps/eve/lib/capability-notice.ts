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
