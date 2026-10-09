import type { RoleDefinition, RolePack } from "../role-catalog.ts";

const qaRole = (
  id: string,
  name: string,
  description: string,
  responsibilities: readonly string[],
  boundaries: readonly string[],
): RoleDefinition => ({
  id,
  name,
  description,
  category: "Verification",
  responsibilities,
  typicalInputs: ["Task contract", "Acceptance checks", "Target environment"],
  typicalOutputs: ["Independent verdict", "Evidence artifacts", "Blocking findings"],
  boundaries,
  recommendedCapabilities: ["computer.browser", "files.write"],
  recommendedReasoning: "high",
  recommendedRiskCeiling: "high",
  verificationRole: true,
  tags: ["qa", "verification"],
  executionMode: "declared-specialist",
});

export const FUNCTIONAL_STATE_ROLE = qaRole(
  "functional-state",
  "Functional & State",
  "Exercises critical product behavior and state transitions with stored evidence.",
  ["Critical paths", "State transitions", "Local and preview parity"],
  ["Read-only QA specialist.", "Cannot deploy or change user data."],
);

export const UX_ACCESSIBILITY_ROLE = qaRole(
  "ux-accessibility",
  "UX & Accessibility",
  "Checks usability, responsive behavior, keyboard access, and interface clarity.",
  ["Navigation and identity", "Responsive behavior", "Keyboard and accessibility checks"],
  ["Read-only QA specialist.", "Validates the implementation rather than redesigning it during a run."],
);

export const TRUST_RESILIENCE_ROLE = qaRole(
  "trust-resilience",
  "Trust & Resilience",
  "Checks authentication boundaries, failure handling, cancellation, retry, and recovery.",
  ["Auth and owner boundaries", "Failure states", "Cancellation and retry behavior"],
  ["Read-only QA specialist.", "Fails closed and never exposes secrets."],
);

export const VERIFICATION_ROLE_PACK: RolePack = {
  id: "verification",
  name: "Verification",
  description: "The fixed independent product-QA panel with isolated tools and evidence requirements.",
  domain: "Product QA",
  roles: [FUNCTIONAL_STATE_ROLE, UX_ACCESSIBILITY_ROLE, TRUST_RESILIENCE_ROLE].map((role) => ({ role })),
  tags: ["qa", "verification"],
};
