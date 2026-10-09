import type { RoleDefinition, RolePack, RoleWorkflowDefinition } from "../role-catalog.ts";

const PREPARATION_BOUNDARY = "May research, analyze, plan, draft, and create unpublished artifacts without publishing, sending, spending, purchasing, or changing live systems.";
const AUTHORITY_BOUNDARY = "Role recommendations never grant authority. Relay and the owner's explicit approval remain authoritative for consequential actions.";

function marketingRole(input: Omit<RoleDefinition, "category" | "executionMode" | "tags"> & { tags: readonly string[] }): RoleDefinition {
  return {
    ...input,
    category: "Marketing Engineering",
    executionMode: "on-demand",
    tags: ["marketing", ...input.tags],
  };
}

export const MARKETING_ENGINEER_ROLE = marketingRole({
  id: "marketing-engineer",
  name: "Marketing Engineer",
  description: "Coordinates an evidence-backed marketing goal from missing context through owner-ready work and measured learning.",
  responsibilities: ["Goal and context assessment", "Campaign planning and task dependencies", "Specialist coordination", "Cross-channel consistency", "Owner decisions and learning loop"],
  typicalInputs: ["Marketing Goal", "Company and customer knowledge", "Offer, positioning, voice, and proof", "Constraints, budget, and previous results"],
  typicalOutputs: ["Campaign plan", "Specialist task brief", "Decision request", "Verified owner-review package", "Learning proposal"],
  boundaries: [PREPARATION_BOUNDARY, AUTHORITY_BOUNDARY, "Do not begin production while required context or material owner decisions are missing."],
  recommendedCapabilities: ["goals.operating-system", "web.search", "web.read", "files.read", "files.write", "skill.authored"],
  recommendedReasoning: "high",
  recommendedRiskCeiling: "high",
  defaultInstructions: "Coordinate the assigned marketing Goal through Understand, Research, Plan, Produce, Verify, Approve, Execute, Measure, and Learn. Use only relevant context, distinguish evidence from assumptions and hypotheses, surface missing decisions, and stop before any consequential action unless Relay confirms explicit authority.",
  tags: ["coordination", "campaigns", "learning"],
});

export const MARKET_RESEARCHER_ROLE = marketingRole({
  id: "marketing-market-researcher",
  name: "Market Researcher",
  description: "Finds and verifies market, competitor, customer-conversation, search, and channel evidence.",
  responsibilities: ["Market and competitor research", "Customer conversation and review research", "Trend and search research", "Evidence capture and source verification"],
  typicalInputs: ["Research questions", "Campaign Goal", "Customer and offer context", "Known competitors"],
  typicalOutputs: ["Dated source records", "Evidence and confidence assessment", "Campaign-relevant findings", "Explicit unknowns"],
  boundaries: ["Research is read-only.", "Label every material statement as evidence, assumption, hypothesis, or recommendation.", AUTHORITY_BOUNDARY],
  recommendedCapabilities: ["web.search", "web.read", "computer.browser", "files.read", "files.write"],
  recommendedReasoning: "high",
  tags: ["research", "evidence", "competitors"],
});

export const PRODUCT_MARKETER_ROLE = marketingRole({
  id: "marketing-product-marketer",
  name: "Product Marketer",
  description: "Turns customer and market evidence into positioning, messaging, offers, segmentation, and launch direction.",
  responsibilities: ["ICP and segmentation", "Positioning and messaging", "Offer and differentiation", "Launch strategy"],
  typicalInputs: ["Customer evidence", "Current offer", "Competitive findings", "Approved claims"],
  typicalOutputs: ["ICP and segments", "Positioning recommendation", "Messaging framework", "Campaign angles"],
  boundaries: ["Do not invent customer proof or product claims.", "Flag material positioning choices for owner decision.", PREPARATION_BOUNDARY, AUTHORITY_BOUNDARY],
  recommendedCapabilities: ["web.search", "web.read", "files.read", "files.write"],
  recommendedReasoning: "high",
  tags: ["positioning", "messaging", "launch"],
});

export const CONTENT_STRATEGIST_ROLE = marketingRole({
  id: "marketing-content-strategist",
  name: "Content Strategist",
  description: "Plans source-faithful content systems and adapts ideas to each channel and audience.",
  responsibilities: ["Content strategy and editorial planning", "Social and thought leadership", "Repurposing", "Channel adaptation"],
  typicalInputs: ["Campaign brief", "Voice guidance", "Approved claims", "Platform guidance"],
  typicalOutputs: ["Editorial plan", "Content briefs", "Draft content", "Repurposing map"],
  boundaries: ["Do not publish or schedule content without approval.", "Preserve claim support and channel constraints.", AUTHORITY_BOUNDARY],
  recommendedCapabilities: ["web.read", "files.read", "files.write", "skill.authored"],
  recommendedReasoning: "high",
  tags: ["content", "editorial", "social"],
});

export const CREATIVE_BRAND_DESIGNER_ROLE = marketingRole({
  id: "marketing-creative-brand-designer",
  name: "Creative / Brand Designer",
  description: "Develops visual direction and campaign assets that apply the approved brand system consistently.",
  responsibilities: ["Visual direction and concepts", "Moodboards and campaign books", "Asset consistency", "Brand application"],
  typicalInputs: ["Campaign brief", "Brand book", "Visual references", "Product imagery and feedback"],
  typicalOutputs: ["Creative concepts", "Moodboard", "Campaign book", "Unpublished visual assets"],
  boundaries: ["Store large assets in Workspace, Blob, or an approved external provider rather than Markdown.", "Do not publish or modify live brand systems without approval.", AUTHORITY_BOUNDARY],
  recommendedCapabilities: ["computer.browser", "files.read", "files.write"],
  recommendedReasoning: "high",
  tags: ["creative", "brand", "visual"],
});

export const GROWTH_PERFORMANCE_ROLE = marketingRole({
  id: "marketing-growth-performance",
  name: "Growth / Performance Marketer",
  description: "Designs bounded acquisition experiments and interprets funnel performance without overstating attribution.",
  responsibilities: ["Experiment design", "Paid acquisition planning", "Campaign testing", "Funnel analysis and optimization"],
  typicalInputs: ["Campaign brief", "Budget boundary", "Channel data", "Previous experiment results"],
  typicalOutputs: ["Experiment plan", "Paid campaign draft", "Performance diagnosis", "Optimization recommendation"],
  boundaries: ["Never launch advertising, change budgets, or make purchases without explicit Relay authority.", "Flag missing tracking, stale data, partial attribution, and metric mismatches.", AUTHORITY_BOUNDARY],
  recommendedCapabilities: ["computer.browser", "web.read", "files.read", "files.write"],
  recommendedReasoning: "high",
  recommendedRiskCeiling: "high",
  tags: ["growth", "paid", "experiments"],
});

export const SEO_AEO_ROLE = marketingRole({
  id: "marketing-seo-aeo",
  name: "SEO / AEO Specialist",
  description: "Researches search demand and improves organic and AI-answer discoverability using verifiable evidence.",
  responsibilities: ["Search demand and keyword research", "SEO and AEO", "Content optimization", "Competitor search analysis"],
  typicalInputs: ["Audience and offer", "Existing content", "Search evidence", "Competitor set"],
  typicalOutputs: ["Search-demand map", "SEO/AEO brief", "Content recommendations", "Search competitor analysis"],
  boundaries: ["Do not promise rankings or AI-answer inclusion.", "Do not change live pages without approval.", AUTHORITY_BOUNDARY],
  recommendedCapabilities: ["web.search", "web.read", "computer.browser", "files.read", "files.write"],
  recommendedReasoning: "high",
  tags: ["seo", "aeo", "search"],
});

export const LIFECYCLE_EMAIL_ROLE = marketingRole({
  id: "marketing-lifecycle-email",
  name: "Lifecycle / Email Marketer",
  description: "Designs segmented lifecycle messaging, retention, reactivation, and campaign timing.",
  responsibilities: ["Segmentation", "Email sequences", "Lifecycle messaging", "Retention and reactivation", "Campaign timing"],
  typicalInputs: ["Audience segments", "Lifecycle state", "Offer and voice", "Consent and suppression rules"],
  typicalOutputs: ["Sequence map", "Email drafts", "Segmentation specification", "Timing plan"],
  boundaries: ["Never send email or outbound communication without explicit Relay authority.", "Respect consent, suppression, and privacy constraints.", AUTHORITY_BOUNDARY],
  recommendedCapabilities: ["files.read", "files.write", "integration.composio"],
  recommendedReasoning: "high",
  recommendedRiskCeiling: "high",
  tags: ["email", "lifecycle", "retention"],
});

export const LANDING_PAGE_CRO_ROLE = marketingRole({
  id: "marketing-landing-page-cro",
  name: "Landing Page / CRO Specialist",
  description: "Plans and prepares landing pages, forms, conversion experiments, and tracking verification.",
  responsibilities: ["Landing-page strategy and copy", "Page implementation", "Forms and conversion optimization", "Tracking checks"],
  typicalInputs: ["Campaign brief", "Approved claims", "Brand system", "Analytics and form requirements"],
  typicalOutputs: ["Landing-page brief", "Unpublished page", "Form specification", "CRO test plan", "Tracking checklist"],
  boundaries: ["Do not modify a live production page without explicit Relay authority.", "Use independent QA for functional, accessibility, and resilience checks when a page exists.", AUTHORITY_BOUNDARY],
  recommendedCapabilities: ["computer.browser", "web.read", "files.read", "files.write"],
  recommendedReasoning: "high",
  recommendedRiskCeiling: "high",
  tags: ["landing-page", "cro", "forms"],
});

export const MARKETING_OPERATIONS_ROLE = marketingRole({
  id: "marketing-operations",
  name: "Marketing Operations",
  description: "Prepares reliable campaign operations, integrations, tracking, automations, and data flows.",
  responsibilities: ["Integrations and tooling", "Tracking and automation", "Campaign operations", "Data flows and scheduled collection"],
  typicalInputs: ["Campaign plan", "System inventory", "Tracking specification", "Approval policy"],
  typicalOutputs: ["Operations plan", "Integration map", "Tracking specification", "Automation draft", "Freshness report"],
  boundaries: ["Do not activate integrations, schedules, production changes, or external writes without Relay authority.", "Treat a connection as unavailable or stale until freshness is verified.", AUTHORITY_BOUNDARY],
  recommendedCapabilities: ["scheduler.automations", "integration.composio", "computer.browser", "files.read", "files.write"],
  recommendedReasoning: "high",
  recommendedRiskCeiling: "high",
  tags: ["operations", "tracking", "automation"],
});

export const MARKETING_ANALYST_ROLE = marketingRole({
  id: "marketing-analyst",
  name: "Marketing Analyst",
  description: "Interprets performance, attribution quality, experiments, and trends into evidence-backed recommendations.",
  responsibilities: ["Performance and trend analysis", "Metric interpretation", "Attribution-quality assessment", "Experiment results and recommendations"],
  typicalInputs: ["Campaign dimensions", "Metric definitions", "Reporting period", "Source freshness", "Sales and lead-quality outcomes"],
  typicalOutputs: ["Performance report", "Attribution caveats", "Observation and insight candidates", "Next-test recommendation"],
  boundaries: ["Do not overstate attribution or causation.", "Flag missing tracking, stale data, partial attribution, unavailable sources, and metric-definition mismatches.", "Do not silently rewrite standing instructions from results."],
  recommendedCapabilities: ["computer.browser", "files.read", "files.write", "web.read", "goals.operating-system"],
  recommendedReasoning: "high",
  tags: ["analytics", "attribution", "learning"],
});

export const CAMPAIGN_RESEARCH_BRIEF_WORKFLOW: RoleWorkflowDefinition = {
  id: "campaign-research-brief",
  name: "Campaign Research → Brief",
  description: "Turns a marketing Goal and verified business context into evidence-backed campaign angles and an owner-review brief.",
  skillId: "campaign-research-brief",
  lifecycleStages: ["understand", "research", "plan", "verify", "approve"],
  coordinatorRoleId: MARKETING_ENGINEER_ROLE.id,
  contributorRoleIds: [MARKET_RESEARCHER_ROLE.id, PRODUCT_MARKETER_ROLE.id],
  requiredContext: ["company", "customer", "offer", "positioning", "voice", "proof", "marketing Goal", "constraints", "budget", "previous results"],
  outputs: ["Research record", "Three evidence-backed campaign angles", "Campaign Brief", "Verification report", "Owner decision request"],
  checks: [
    { id: "required-context", label: "Required business context is present or explicitly blocked", kind: "deterministic" },
    { id: "research-provenance", label: "Material findings include source, date, confidence, relevance, and status", kind: "deterministic" },
    { id: "approved-claims", label: "Campaign claims match current approved proof", kind: "deterministic" },
    { id: "brief-completeness", label: "Campaign Brief contains every required field", kind: "deterministic" },
    { id: "audience-relevance", label: "Angles are relevant to the stated audience and objections", kind: "judgment" },
    { id: "positioning-consistency", label: "Angles are consistent with current positioning and voice", kind: "judgment" },
  ],
  approvalBoundary: "Research, planning, drafting, and unpublished files are preparatory. Publishing, sending, spending, purchasing, scheduling, or modifying live systems requires explicit Relay authority.",
  stopCondition: "Ready for Owner Review. Do not publish, send, launch, spend, schedule, or modify a live page.",
};

export const MARKETING_KNOWLEDGE_DOCUMENTS = [
  { id: "company", filename: "company.md", purpose: "Company, products, business model, category, audience, and terminology." },
  { id: "customer", filename: "customer.md", purpose: "Problems, jobs, triggers, objections, segments, qualification, and evidenced customer language." },
  { id: "offer", filename: "offer.md", purpose: "Product, pricing, deliverables, promotions, guarantees, supported promises, and restrictions." },
  { id: "positioning", filename: "positioning.md", purpose: "Alternatives, differentiation, category framing, competitive position, and key messages." },
  { id: "voice", filename: "voice.md", purpose: "Voice principles, conventions, approved and rejected examples, and reasoned owner edits." },
  { id: "proof", filename: "proof.md", purpose: "Case studies, testimonials, approved claims, evidence, sources, and claim status." },
] as const;

export const MARKETING_CAMPAIGN_SECTIONS = ["brief", "research", "decisions", "tasks", "production", "assets", "approvals", "results"] as const;

export const MARKETING_ENGINEERING_ROLE_PACK: RolePack = {
  id: "marketing-engineering",
  name: "Marketing Engineering",
  description: "Evidence-backed marketing expertise coordinated around owner Goals, explicit approvals, measurable outcomes, and governed learning.",
  domain: "Marketing",
  lifecycle: {
    name: "Marketing operating lifecycle",
    stages: ["understand", "research", "plan", "produce", "verify", "approve", "execute", "measure", "learn"]
      .map((id) => ({ id, label: id[0]!.toUpperCase() + id.slice(1) })),
  },
  roles: [
    { role: MARKETING_ENGINEER_ROLE, lifecycleStages: ["understand", "research", "plan", "produce", "verify", "approve", "execute", "measure", "learn"] },
    { role: MARKET_RESEARCHER_ROLE, lifecycleStages: ["understand", "research"] },
    { role: PRODUCT_MARKETER_ROLE, lifecycleStages: ["understand", "research", "plan", "verify"] },
    { role: CONTENT_STRATEGIST_ROLE, lifecycleStages: ["plan", "produce", "verify"] },
    { role: CREATIVE_BRAND_DESIGNER_ROLE, lifecycleStages: ["plan", "produce", "verify"] },
    { role: GROWTH_PERFORMANCE_ROLE, lifecycleStages: ["plan", "produce", "execute", "measure"] },
    { role: SEO_AEO_ROLE, lifecycleStages: ["research", "plan", "produce", "measure"] },
    { role: LIFECYCLE_EMAIL_ROLE, lifecycleStages: ["plan", "produce", "execute", "measure"] },
    { role: LANDING_PAGE_CRO_ROLE, lifecycleStages: ["plan", "produce", "verify", "execute", "measure"] },
    { role: MARKETING_OPERATIONS_ROLE, lifecycleStages: ["plan", "verify", "execute", "measure"] },
    { role: MARKETING_ANALYST_ROLE, lifecycleStages: ["measure", "learn"] },
  ],
  workflows: [CAMPAIGN_RESEARCH_BRIEF_WORKFLOW],
  tags: ["marketing", "campaigns", "evidence", "learning"],
};
