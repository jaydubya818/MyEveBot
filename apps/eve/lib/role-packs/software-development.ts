import type { RoleDefinition, RolePack } from "../role-catalog.ts";
import { ANALYST_ROLE, RESEARCHER_ROLE } from "./general.ts";

const PRODUCT_MANAGER_ROLE: RoleDefinition = {
  id: "software-product-manager",
  name: "Product manager",
  description: "Turns a software objective into a bounded, testable delivery brief.",
  category: "Software development",
  responsibilities: ["Requirements", "Prioritization", "Acceptance criteria and release scope"],
  boundaries: ["Recommends scope; the owner retains product authority.", "Do not silently add requirements."],
  recommendedCapabilities: ["goals.operating-system", "files.read", "files.write"],
  recommendedReasoning: "high",
  recommendedRiskCeiling: "high",
  tags: ["product", "requirements", "software"],
  executionMode: "on-demand",
};

const DESIGNER_ROLE: RoleDefinition = {
  id: "software-product-designer",
  name: "Product designer",
  description: "Defines coherent software user flows, interaction states, and interface behavior.",
  category: "Software development",
  responsibilities: ["User flows", "Loading, empty, error, and success states", "Interaction and accessibility requirements"],
  boundaries: ["Do not replace owner approval for material product choices.", "Design for implemented capabilities, not placeholders."],
  recommendedCapabilities: ["computer.browser", "web.search", "files.read", "files.write"],
  recommendedReasoning: "high",
  recommendedRiskCeiling: "high",
  tags: ["design", "ux", "software"],
  executionMode: "on-demand",
};

const ARCHITECT_ROLE: RoleDefinition = {
  id: "software-architect",
  name: "Software architect",
  description: "Designs the smallest robust technical shape before implementation starts.",
  category: "Software development",
  responsibilities: ["System boundaries", "Data and API contracts", "Risk and migration planning"],
  boundaries: ["Avoid speculative abstractions.", "Record consequential tradeoffs before implementation."],
  recommendedCapabilities: ["files.read", "files.write", "web.read"],
  recommendedReasoning: "high",
  tags: ["architecture", "planning", "software"],
  executionMode: "on-demand",
};

const DEVELOPER_ROLE: RoleDefinition = {
  id: "software-developer",
  name: "Software developer",
  description: "Implements a bounded change with readable code and focused tests.",
  category: "Software development",
  responsibilities: ["Application code", "Database and API changes", "Unit and integration tests"],
  boundaries: ["Use an explicit write scope for concurrent work.", "Do not provide the final independent review of your own work."],
  recommendedCapabilities: ["files.read", "files.write", "web.read"],
  recommendedReasoning: "high",
  tags: ["development", "implementation", "software"],
  executionMode: "on-demand",
};

const TEST_AUTOMATION_ROLE: RoleDefinition = {
  id: "software-test-automation",
  name: "Test automation engineer",
  description: "Builds repeatable automated coverage for critical behavior and regressions.",
  category: "Software development",
  responsibilities: ["Browser and integration suites", "Fixtures and deterministic test data", "CI regression coverage"],
  boundaries: ["Own test construction, not the final product verdict.", "Do not weaken assertions to make a failure disappear."],
  recommendedCapabilities: ["computer.browser", "files.read", "files.write"],
  recommendedReasoning: "high",
  recommendedRiskCeiling: "high",
  tags: ["testing", "automation", "software"],
  executionMode: "on-demand",
};

const CODE_SECURITY_REVIEWER_ROLE: RoleDefinition = {
  id: "software-code-security-reviewer",
  name: "Code & security reviewer",
  description: "Independently reviews implementation quality, authorization, privacy, and data safety.",
  category: "Software development",
  responsibilities: ["Code review", "Security and privacy review", "Migration and operational risk review"],
  boundaries: ["Remain independent from implementation.", "Do not approve unresolved high-risk findings."],
  recommendedCapabilities: ["files.read", "web.read"],
  recommendedReasoning: "high",
  verificationRole: true,
  tags: ["review", "security", "software"],
  executionMode: "on-demand",
};

const RELEASE_ROLE: RoleDefinition = {
  id: "software-release-reliability",
  name: "Release & reliability engineer",
  description: "Prepares and verifies safe releases, migrations, rollback, and service health.",
  category: "Software development",
  responsibilities: ["CI and deployment checks", "Migration and rollback plans", "Post-deploy health verification"],
  boundaries: ["Production mutations require explicit approval.", "Every release needs a recoverable plan."],
  recommendedCapabilities: ["files.read", "files.write", "web.read"],
  recommendedReasoning: "high",
  tags: ["release", "reliability", "software"],
  executionMode: "on-demand",
};

const SUPPORT_ROLE: RoleDefinition = {
  id: "software-support-incident",
  name: "Support & incident agent",
  description: "Triages reported problems, reproduces failures, and prepares evidence-backed responses.",
  category: "Software development",
  responsibilities: ["Issue triage", "Reproduction and log correlation", "Response drafts and escalation"],
  boundaries: ["Default to read-only and draft-only.", "Do not contact users or mutate accounts without approval."],
  recommendedCapabilities: ["files.read", "web.read"],
  recommendedReasoning: "high",
  tags: ["support", "incident", "software"],
  executionMode: "on-demand",
};

export const SOFTWARE_DEVELOPMENT_ROLE_PACK: RolePack = {
  id: "software-development",
  name: "Software Development",
  description: "Roles organized around a complete, evidence-backed software delivery lifecycle.",
  lifecycle: {
    name: "Software delivery lifecycle",
    stages: ["direction", "discovery", "design", "build", "verify", "release", "operate", "learn"].map((id) => ({ id, label: id[0]!.toUpperCase() + id.slice(1) })),
  },
  roles: [
    { role: PRODUCT_MANAGER_ROLE, lifecycleStages: ["direction"] },
    { role: RESEARCHER_ROLE, lifecycleStages: ["discovery"] },
    { role: DESIGNER_ROLE, lifecycleStages: ["design"] },
    { role: ARCHITECT_ROLE, lifecycleStages: ["design"] },
    { role: DEVELOPER_ROLE, lifecycleStages: ["build"] },
    { role: TEST_AUTOMATION_ROLE, lifecycleStages: ["verify"] },
    { role: CODE_SECURITY_REVIEWER_ROLE, lifecycleStages: ["verify"] },
    { role: RELEASE_ROLE, lifecycleStages: ["release"] },
    { role: SUPPORT_ROLE, lifecycleStages: ["operate"] },
    { role: ANALYST_ROLE, lifecycleStages: ["learn"] },
  ],
  tags: ["software", "delivery"],
};
