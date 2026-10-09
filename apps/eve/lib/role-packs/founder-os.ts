import type { RoleDefinition, RolePack } from "../role-catalog.ts";
import type { ApprovalPolicyDefinition, ArtifactDefinition, GoalTemplateDefinition, MetricDefinition, SolutionPack, SolutionPackDomain } from "../solution-packs.ts";
import {
  CONTENT_STRATEGIST_ROLE,
  GROWTH_PERFORMANCE_ROLE,
  LANDING_PAGE_CRO_ROLE,
  LIFECYCLE_EMAIL_ROLE,
  MARKET_RESEARCHER_ROLE,
  MARKETING_ANALYST_ROLE,
  MARKETING_ENGINEER_ROLE,
  MARKETING_ENGINEERING_ROLE_PACK,
  MARKETING_OPERATIONS_ROLE,
  PRODUCT_MARKETER_ROLE,
  SEO_AEO_ROLE,
} from "./marketing-engineering.ts";

const PREPARATION_BOUNDARY = "May research, analyze, plan, forecast, draft, create Tasks, and prepare unpublished artifacts.";
const AUTHORITY_BOUNDARY = "Recommendations never grant authority. Relay and the owner's explicit approval remain authoritative for consequential actions.";

function role(input: {
  id: string;
  name: string;
  domain: string;
  description: string;
  responsibilities: readonly string[];
  inputs: readonly string[];
  outputs: readonly string[];
  boundaries?: readonly string[];
}): RoleDefinition {
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    category: `Founder OS · ${input.domain}`,
    responsibilities: input.responsibilities,
    typicalInputs: input.inputs,
    typicalOutputs: input.outputs,
    boundaries: [PREPARATION_BOUNDARY, ...(input.boundaries ?? []), AUTHORITY_BOUNDARY],
    recommendedCapabilities: ["goals.operating-system", "web.search", "web.read", "files.read", "files.write"],
    recommendedReasoning: "high",
    recommendedRiskCeiling: "medium",
    tags: ["founder-os", input.domain.toLowerCase()],
    executionMode: "on-demand",
  };
}

export const FOUNDER_CHIEF_OF_STAFF_ROLE: RoleDefinition = {
  ...role({
    id: "founder-chief-of-staff",
    name: "Founder / Chief of Staff",
    domain: "Coordination",
    description: "Coordinates business Goals across operating domains, identifies the current constraint, and prepares owner decisions and reviews.",
    responsibilities: ["Understand owner objectives", "Maintain priorities and dependencies", "Identify constraints and risks", "Coordinate specialist Roles", "Review outcomes and prepare business reviews"],
    inputs: ["Active Goals", "Authorized business metrics", "Decisions and commitments", "Risks, constraints, and recent outcomes"],
    outputs: ["Constraint diagnosis", "Domain priorities", "Coordinated work plan", "Decision requests", "Founder Business Review"],
    boundaries: ["Use scoped, authorized context and state missing data explicitly.", "Do not execute consequential recommendations or inherit specialist capabilities automatically."],
  }),
  defaultInstructions: "Coordinate the owner's business Goal through Business State, Constraint, Domain, Role or Workflow, Work, Evidence, Owner Decision, Outcome, Metrics, and Learning. Diagnose the narrowest current constraint before proposing work. Never fabricate missing metrics. Keep external communication, publishing, spending, price changes, contracts, hiring decisions, payments, deployments, and live-system changes behind explicit Relay approval.",
};

const FOUNDER_SPECIALIST_ROLES: readonly RoleDefinition[] = [
  role({ id: "founder-strategy-advisor", name: "Strategy Advisor", domain: "Strategy", description: "Turns business context into explicit strategic choices and priorities.", responsibilities: ["Vision and objective framing", "Prioritization", "Strategic decision support", "Risk analysis"], inputs: ["Owner objectives", "Business state", "Market evidence", "Constraints"], outputs: ["Strategic options", "Priority recommendation", "Decision brief", "Risk register"] }),
  role({ id: "founder-market-analyst", name: "Market Analyst", domain: "Strategy", description: "Analyzes markets, categories, competitors, and customer evidence without inventing certainty.", responsibilities: ["Market analysis", "Competitive analysis", "Evidence synthesis", "Opportunity sizing"], inputs: ["Market question", "Customer evidence", "Competitor set"], outputs: ["Market analysis", "Competitor comparison", "Evidence gaps"] }),
  role({ id: "founder-business-planner", name: "Business Planner", domain: "Strategy", description: "Translates strategy into bounded quarterly priorities, dependencies, and measurable plans.", responsibilities: ["Quarterly planning", "Objective decomposition", "Dependency mapping", "Scenario planning"], inputs: ["Strategy", "Goals", "Capacity", "Constraints"], outputs: ["Business plan", "Quarterly priorities", "Dependency map"] }),
  role({ id: "founder-lead-magnet-strategist", name: "Lead Magnet Strategist", domain: "Leads", description: "Designs useful lead magnets aligned with the audience, offer, and qualification intent.", responsibilities: ["Lead magnet strategy", "CTA alignment", "Qualification design"], inputs: ["ICP", "Offer", "Customer problems", "Channel context"], outputs: ["Lead magnet brief", "CTA recommendation", "Qualification hypothesis"] }),
  role({ id: "founder-funnel-strategist", name: "Funnel Strategist", domain: "Leads", description: "Maps how attention becomes qualified demand and identifies funnel leakage.", responsibilities: ["Funnel design", "Lead capture", "Nurture mapping", "Bottleneck analysis"], inputs: ["Funnel metrics", "Audience", "Offer", "Channels"], outputs: ["Funnel map", "Constraint diagnosis", "Experiment backlog"] }),
  role({ id: "founder-conversion-strategist", name: "Conversion Strategist", domain: "Conversion", description: "Improves conversion journeys using explicit evidence, hypotheses, and measurable tests.", responsibilities: ["Journey analysis", "Conversion diagnosis", "Experiment prioritization"], inputs: ["Journey", "Conversion metrics", "Customer evidence"], outputs: ["Conversion diagnosis", "Prioritized test plan", "Decision request"] }),
  role({ id: "founder-sales-strategist", name: "Sales Strategist", domain: "Sales", description: "Designs a trustworthy sales motion aligned with customer evidence and the offer.", responsibilities: ["Sales motion", "Discovery", "Objection handling", "Follow-up strategy"], inputs: ["ICP", "Offer", "Sales evidence", "Pipeline state"], outputs: ["Sales strategy", "Discovery flow", "Objection plan"] }),
  role({ id: "founder-sales-enablement", name: "Sales Enablement", domain: "Sales", description: "Creates accurate, usable material that helps the owner sell consistently.", responsibilities: ["Sales scripts", "Proposals", "Follow-up", "Social proof organization"], inputs: ["Sales strategy", "Approved claims", "Customer objections"], outputs: ["Sales collateral", "Call script", "Follow-up sequence"], boundaries: ["Do not send proposals or external messages without approval."] }),
  role({ id: "founder-customer-research", name: "Customer Research", domain: "Sales", description: "Synthesizes customer conversations and sales evidence into actionable patterns.", responsibilities: ["Interview planning", "Sales-call review", "Objection analysis", "Customer-language capture"], inputs: ["Calls", "Interviews", "CRM evidence", "Research question"], outputs: ["Customer findings", "Quote bank", "Objection themes"] }),
  role({ id: "founder-offer-strategist", name: "Offer Strategist", domain: "Offer", description: "Shapes a coherent offer around customer value, differentiation, and delivery reality.", responsibilities: ["Offer architecture", "Packaging", "Value ladder", "Offer validation"], inputs: ["ICP", "Customer evidence", "Product", "Delivery constraints"], outputs: ["Offer architecture", "Offer stack", "Validation plan"] }),
  role({ id: "founder-pricing-strategist", name: "Pricing Strategist", domain: "Offer", description: "Analyzes pricing and packaging options without changing live prices.", responsibilities: ["Pricing research", "Packaging analysis", "Scenario comparison", "Pricing consistency"], inputs: ["Current pricing", "Costs", "Customer evidence", "Competitors"], outputs: ["Pricing matrix", "Scenario analysis", "Owner decision brief"], boundaries: ["Changing a live price requires explicit approval."] }),
  role({ id: "founder-customer-success", name: "Customer Success", domain: "Delivery", description: "Designs customer outcomes, communication, retention, and expansion playbooks.", responsibilities: ["Success planning", "Customer communication", "Retention", "Expansion"], inputs: ["Customer goals", "Offer promise", "Delivery evidence"], outputs: ["Success plan", "Communication draft", "Expansion hypothesis"], boundaries: ["Do not contact customers without approval."] }),
  role({ id: "founder-onboarding-specialist", name: "Onboarding Specialist", domain: "Delivery", description: "Creates clear onboarding journeys from signed agreement to first value.", responsibilities: ["Onboarding", "Kickoff", "Milestones", "Client welcome"], inputs: ["Offer", "Customer context", "Implementation constraints"], outputs: ["Onboarding plan", "Kickoff agenda", "Milestone tracker"] }),
  role({ id: "founder-delivery-operations", name: "Delivery Operations", domain: "Delivery", description: "Improves delivery capacity, consistency, dependencies, and quality controls.", responsibilities: ["Capacity analysis", "Process design", "Delivery risk", "Quality checks"], inputs: ["Delivery workflow", "Capacity", "Milestones", "Incidents"], outputs: ["Delivery plan", "Capacity assessment", "Risk controls"] }),
  role({ id: "founder-financial-analyst", name: "Financial Analyst", domain: "Finance", description: "Analyzes business financial data for owner decision support without transactional authority.", responsibilities: ["Revenue and expense analysis", "Cash-flow review", "Margin analysis"], inputs: ["Authorized financial records", "Metric definitions", "Reporting period"], outputs: ["Financial analysis", "Variance explanation", "Decision support"], boundaries: ["Financial analysis is not money movement; do not transfer, purchase, pay, or change billing."] }),
  role({ id: "founder-business-forecaster", name: "Business Forecaster", domain: "Finance", description: "Builds transparent forecasts and scenarios with explicit assumptions.", responsibilities: ["Revenue forecast", "Cash forecast", "Runway", "Scenario analysis"], inputs: ["Historical data", "Known commitments", "Assumptions", "Timeframe"], outputs: ["Forecast", "Scenario plan", "Assumption register"], boundaries: ["Do not represent a forecast as certainty or move money."] }),
  role({ id: "founder-unit-economics-analyst", name: "Unit Economics Analyst", domain: "Finance", description: "Defines and analyzes unit economics consistently across acquisition, sale, and delivery.", responsibilities: ["Contribution margin", "Acquisition economics", "Payback analysis", "Metric definition"], inputs: ["Revenue", "Variable costs", "Acquisition costs", "Retention data"], outputs: ["Unit economics model", "Metric definitions", "Sensitivity analysis"], boundaries: ["Do not move money or change billing."] }),
  role({ id: "founder-operations", name: "Operations", domain: "Systems", description: "Identifies operational constraints and improves the flow of work across the business.", responsibilities: ["Operating cadence", "Bottleneck analysis", "Capacity", "Automation opportunities"], inputs: ["Goals", "Processes", "Capacity", "Commitments"], outputs: ["Operations plan", "Constraint map", "Improvement backlog"] }),
  role({ id: "founder-people-hiring", name: "People / Hiring", domain: "Systems", description: "Prepares hiring plans, role clarity, and evidence-based interview support.", responsibilities: ["Hiring plans", "Role scorecards", "Org design", "Interview synthesis"], inputs: ["Business need", "Capacity gap", "Candidate evidence"], outputs: ["Hiring plan", "Role description", "Scorecard", "Interview analysis"], boundaries: ["Do not send offers, reject candidates, terminate people, or change compensation without explicit approval."] }),
  role({ id: "founder-process-sop", name: "Process / SOP", domain: "Systems", description: "Turns repeated work into clear, maintainable operating procedures.", responsibilities: ["Process mapping", "SOP creation", "Control points", "Continuous improvement"], inputs: ["Observed process", "Owner standards", "Failure evidence"], outputs: ["SOP", "Process map", "Improvement proposal"] }),
];

export const FOUNDER_OS_ROLE_PACK: RolePack = {
  id: "founder-os-core",
  name: "Founder OS Core",
  description: "Native business-operating roles used by the Founder OS Solution Pack.",
  domain: "Business operations",
  catalogVisibility: "internal",
  roles: [FOUNDER_CHIEF_OF_STAFF_ROLE, ...FOUNDER_SPECIALIST_ROLES].map((founderRole) => ({ role: founderRole })),
  tags: ["founder-os", "solution-pack"],
};

const APPROVAL_POLICY: ApprovalPolicyDefinition = {
  id: "founder-preparation",
  name: "Prepare safely, approve consequences",
  description: "Founder OS may prepare decision support and artifacts; Relay remains authoritative for consequential action.",
  rules: [
    ...["research", "analysis", "drafting", "planning", "forecasting", "create_artifact", "create_task", "recommendation"].map((action) => ({ action, requirement: "allowed" as const })),
    ...["send_external_communication", "publish", "spend_money", "change_prices", "launch_ads", "make_payment", "modify_live_system", "commit_contract", "delete_business_data", "hire_or_fire", "change_compensation", "deploy_code"].map((action) => ({ action, requirement: "approval_required" as const })),
  ],
};

const goal = (id: string, name: string, description: string, domainIds: readonly string[], inputs: readonly string[], outputs: readonly string[], maturity: GoalTemplateDefinition["maturity"] = "defined", workflowIds: readonly string[] = []): GoalTemplateDefinition => ({ id, name, description, domainIds, inputs, outputs, maturity, workflowIds, guardrails: ["Do not fabricate missing metrics.", "Identify the current constraint before creating broad activity.", "Consequential actions require owner approval through Relay."] });

export const FOUNDER_GOAL_TEMPLATES: readonly GoalTemplateDefinition[] = [
  goal("grow-revenue", "Grow Revenue", "Diagnose the limiting factor between demand, conversion, sales, offer, capacity, and economics before planning work.", ["strategy", "traffic", "leads", "conversion", "sales", "offer", "delivery", "finance", "systems"], ["Current revenue", "Target revenue", "Timeframe", "Known funnel metrics", "Constraints"], ["Constraint analysis", "Domain priorities", "Tasks", "Recommended experiments", "Decisions required"], "working", ["founder-business-review"]),
  goal("launch-product", "Launch a Product", "Coordinate a launch across offer, marketing, sales, delivery, finance, and systems readiness.", ["strategy", "traffic", "leads", "conversion", "sales", "offer", "delivery", "finance", "systems"], ["Product", "Audience", "Offer", "Timeline", "Channels", "Delivery readiness"], ["Launch plan", "Marketing work", "Sales work", "Delivery work", "Dependencies", "Approvals"], "working"),
  goal("quarterly-business-review", "Quarterly Business Review", "Review outcomes, metrics, risks, and commitments to select the next constraint and priorities.", ["strategy", "traffic", "leads", "conversion", "sales", "offer", "delivery", "finance", "systems"], ["Goals", "Metrics", "Outcomes", "Decisions", "Risks", "Commitments"], ["Business review", "Constraint", "Lessons", "Priorities", "Next-quarter Goals"], "working", ["founder-business-review"]),
  goal("increase-qualified-leads", "Increase Qualified Leads", "Improve qualified demand without optimizing for raw lead volume.", ["traffic", "leads", "conversion"], ["Lead definition", "Current lead metrics", "ICP", "Channels"], ["Constraint diagnosis", "Experiments", "Metric plan"]),
  goal("improve-conversion", "Improve Conversion", "Find and improve the highest-leverage conversion step.", ["leads", "conversion", "offer"], ["Journey", "Baseline", "Target", "Evidence"], ["Conversion diagnosis", "Test plan"]),
  goal("improve-sales-close-rate", "Improve Sales Close Rate", "Improve qualification, discovery, follow-up, or offer fit based on sales evidence.", ["sales", "offer"], ["Pipeline", "Calls", "Objections", "Current close rate"], ["Sales diagnosis", "Enablement plan"]),
  goal("improve-offer", "Create / Improve Offer", "Strengthen offer fit, differentiation, packaging, and price logic.", ["offer", "strategy", "finance", "delivery"], ["Audience", "Current offer", "Customer evidence", "Economics"], ["Offer architecture", "Validation plan"]),
  goal("improve-customer-delivery", "Improve Customer Delivery", "Improve time-to-value, consistency, retention, and delivery capacity.", ["delivery", "systems"], ["Customer outcomes", "Delivery process", "Capacity", "Issues"], ["Delivery diagnosis", "Improvement plan"]),
  goal("improve-profitability", "Improve Profitability", "Identify the economic constraint without assuming cost cutting is the answer.", ["finance", "offer", "delivery", "systems"], ["Revenue", "Costs", "Margins", "Constraints"], ["Margin analysis", "Scenario plan", "Decisions"]),
  goal("hire-team-member", "Hire a Team Member", "Define the capacity gap and prepare an approval-gated hiring process.", ["systems", "finance"], ["Capacity gap", "Budget", "Outcomes", "Timeline"], ["Hiring plan", "Role scorecard", "Approval points"]),
  goal("systematize-operations", "Systematize Operations", "Turn the current operating constraint into an explicit, maintainable process.", ["systems"], ["Process", "Failure evidence", "Owner standards"], ["Process map", "SOP", "Improvement measures"]),
];

const artifact = (id: string, name: string, domainId: string, roleIds: readonly string[], template = false): ArtifactDefinition => ({ id, name, domainId, description: `A reviewable ${name.toLowerCase()} grounded in current business evidence.`, inputs: ["Relevant authorized business context", "Goal", "Evidence", "Known constraints"], outputType: "markdown", recommendedRoleIds: roleIds, requiredKnowledge: ["company", "customers", "offer", "metrics"], checks: ["Inputs and missing data are explicit", "Claims trace to evidence", "Owner decisions are separated from recommendations"], approvalPolicyId: APPROVAL_POLICY.id, ...(template ? { templateRef: `docs/templates/founder-os/${id}.md` } : {}) });

export const FOUNDER_ARTIFACT_DEFINITIONS: readonly ArtifactDefinition[] = [
  artifact("ideal-customer-profile", "Ideal Customer Profile", "traffic", [PRODUCT_MARKETER_ROLE.id, MARKET_RESEARCHER_ROLE.id], true),
  artifact("brand-positioning", "Brand Positioning", "traffic", [PRODUCT_MARKETER_ROLE.id]), artifact("content-strategy", "Content Strategy", "traffic", [CONTENT_STRATEGIST_ROLE.id]), artifact("campaign-brief", "Campaign Brief", "traffic", [PRODUCT_MARKETER_ROLE.id, MARKETING_ENGINEER_ROLE.id], true),
  artifact("lead-magnet", "Lead Magnet", "leads", ["founder-lead-magnet-strategist"]), artifact("funnel-map", "Funnel Map", "leads", ["founder-funnel-strategist"]), artifact("nurture-sequence", "Nurture Sequence", "leads", [LIFECYCLE_EMAIL_ROLE.id]),
  artifact("landing-page", "Landing Page", "conversion", [LANDING_PAGE_CRO_ROLE.id]), artifact("vsl-script", "VSL Script", "conversion", ["founder-conversion-strategist"]), artifact("application-funnel", "Application Funnel", "conversion", ["founder-funnel-strategist", LANDING_PAGE_CRO_ROLE.id]),
  artifact("sales-call-script", "Sales Call Script", "sales", ["founder-sales-enablement", "founder-sales-strategist"], true), artifact("objection-handling", "Objection Handling", "sales", ["founder-sales-enablement", "founder-customer-research"]), artifact("sales-review-scorecard", "Sales Call Review Scorecard", "sales", ["founder-customer-research"]), artifact("proposal-sow", "Proposal / SOW", "sales", ["founder-sales-enablement"]),
  artifact("offer-architecture", "Offer Architecture", "offer", ["founder-offer-strategist", PRODUCT_MARKETER_ROLE.id], true), artifact("pricing-matrix", "Pricing Matrix", "offer", ["founder-pricing-strategist"]), artifact("value-ladder", "Value Ladder", "offer", ["founder-offer-strategist"]), artifact("competitor-analysis", "Competitor Analysis", "offer", ["founder-market-analyst", MARKET_RESEARCHER_ROLE.id]),
  artifact("client-onboarding-plan", "Client Onboarding Plan", "delivery", ["founder-onboarding-specialist", "founder-customer-success"], true), artifact("milestone-tracker", "Milestone Tracker", "delivery", ["founder-delivery-operations"]), artifact("implementation-checklist", "Implementation Checklist", "delivery", ["founder-delivery-operations"]), artifact("case-study-template", "Case Study Template", "delivery", ["founder-customer-success"]),
  artifact("revenue-forecast", "Revenue Forecast", "finance", ["founder-business-forecaster"]), artifact("cash-flow-forecast", "Cash Flow Forecast", "finance", ["founder-business-forecaster", "founder-financial-analyst"]), artifact("runway-model", "Runway Model", "finance", ["founder-business-forecaster"]), artifact("margin-analysis", "Margin Analysis", "finance", ["founder-unit-economics-analyst"]), artifact("scenario-plan", "Scenario Plan", "finance", ["founder-business-forecaster"]),
  artifact("hiring-plan", "Hiring Plan", "systems", ["founder-people-hiring"]), artifact("role-scorecard", "Role Scorecard", "systems", ["founder-people-hiring"]), artifact("sop", "Standard Operating Procedure", "systems", ["founder-process-sop"]), artifact("quarterly-business-review", "Quarterly Business Review", "strategy", [FOUNDER_CHIEF_OF_STAFF_ROLE.id, "founder-business-planner"], true),
];

const metric = (id: string, name: string, domainId: string, definition: string, unit: string): MetricDefinition => ({ id, name, domainId, definition, unit, source: "connected app, system of record, or manual input", freshness: "must be stated", reportingPeriod: "must be stated" });
export const FOUNDER_METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  metric("traffic-volume", "Traffic", "traffic", "Visits or audience reach for a named source and period.", "count"), metric("qualified-leads", "Qualified Leads", "leads", "Leads meeting the owner's explicit qualification definition.", "count"), metric("lead-conversion-rate", "Lead Conversion Rate", "conversion", "Qualified leads divided by relevant traffic for the same cohort and period.", "percent"), metric("sales-close-rate", "Sales Close Rate", "sales", "Closed-won opportunities divided by qualified sales opportunities for the same cohort.", "percent"), metric("average-deal-value", "Average Deal Value", "offer", "Recognized deal value divided by closed-won deals for the stated period.", "currency"), metric("delivery-capacity", "Delivery Capacity", "delivery", "Available delivery units compared with committed demand for the stated period.", "ratio"), metric("revenue", "Revenue", "finance", "Revenue recognized under the owner's stated accounting basis and period.", "currency"), metric("gross-margin", "Gross Margin", "finance", "Revenue less direct costs, divided by revenue, under a stated cost definition.", "percent"), metric("cash-runway", "Cash Runway", "finance", "Available cash divided by forecast net cash burn using stated assumptions.", "months"), metric("operating-capacity", "Operating Capacity", "systems", "Available operating capacity compared with committed work for the stated period.", "ratio"),
];

export interface BusinessMetricSignal { metricId: string; assessment: "strong" | "acceptable" | "weak" | "unknown"; evidence: string; }
export interface ConstraintDiagnosis { primaryDomainIds: readonly string[]; evidence: readonly string[]; assumptions: readonly string[]; missingMetricIds: readonly string[]; }
const REVENUE_FUNNEL_METRICS = ["traffic-volume", "qualified-leads", "lead-conversion-rate", "sales-close-rate", "average-deal-value", "delivery-capacity", "gross-margin", "cash-runway", "operating-capacity"] as const;
const CONSTRAINT_DOMAINS: Readonly<Record<(typeof REVENUE_FUNNEL_METRICS)[number], readonly string[]>> = { "traffic-volume": ["traffic"], "qualified-leads": ["leads"], "lead-conversion-rate": ["leads", "conversion"], "sales-close-rate": ["sales"], "average-deal-value": ["offer", "sales"], "delivery-capacity": ["delivery"], "gross-margin": ["finance", "delivery", "offer"], "cash-runway": ["finance"], "operating-capacity": ["systems"] };
export function diagnoseRevenueConstraint(signals: readonly BusinessMetricSignal[]): ConstraintDiagnosis {
  const byMetric = new Map(signals.map((signal) => [signal.metricId, signal]));
  const weakMetric = REVENUE_FUNNEL_METRICS.find((id) => byMetric.get(id)?.assessment === "weak");
  return { primaryDomainIds: weakMetric ? CONSTRAINT_DOMAINS[weakMetric] : [], evidence: weakMetric ? [byMetric.get(weakMetric)!.evidence] : [], assumptions: [], missingMetricIds: REVENUE_FUNNEL_METRICS.filter((id) => !byMetric.has(id) || byMetric.get(id)?.assessment === "unknown") };
}

const artifactIds = (id: string) => FOUNDER_ARTIFACT_DEFINITIONS.filter((item) => item.domainId === id).map((item) => item.id);
const metricIds = (id: string) => FOUNDER_METRIC_DEFINITIONS.filter((item) => item.domainId === id).map((item) => item.id);
const goalIds = (id: string) => FOUNDER_GOAL_TEMPLATES.filter((item) => item.domainIds.includes(id)).map((item) => item.id);
const domain = (id: string, name: string, purpose: string, roleIds: readonly string[], dependencies: readonly string[] = []): SolutionPackDomain => ({ id, name, purpose, health: "unknown", healthBasis: "unavailable", roleIds, goalTemplateIds: goalIds(id), metricIds: metricIds(id), artifactIds: artifactIds(id), workflowIds: id === "strategy" ? ["founder-business-review"] : [], exampleDecisions: [], risks: [], dependencyDomainIds: dependencies, knowledgeRequirements: ["company", "customers", "offer", "metrics"], recommendedCapabilities: ["goals.operating-system", "files.read", "files.write"] });

export const FOUNDER_OS_DOMAINS: readonly SolutionPackDomain[] = [
  domain("strategy", "Strategy", "Set direction, choose priorities, and make explicit strategic tradeoffs.", ["founder-strategy-advisor", "founder-market-analyst", "founder-business-planner"]),
  domain("traffic", "Traffic", "Build relevant awareness with the right audience.", [PRODUCT_MARKETER_ROLE.id, MARKET_RESEARCHER_ROLE.id, CONTENT_STRATEGIST_ROLE.id, GROWTH_PERFORMANCE_ROLE.id, SEO_AEO_ROLE.id], ["strategy", "offer"]),
  domain("leads", "Leads", "Turn relevant attention into qualified demand.", [PRODUCT_MARKETER_ROLE.id, LIFECYCLE_EMAIL_ROLE.id, MARKETING_ANALYST_ROLE.id, "founder-lead-magnet-strategist", "founder-funnel-strategist"], ["traffic", "offer"]),
  domain("conversion", "Conversion", "Help qualified prospects take the next intended step.", ["founder-conversion-strategist", LANDING_PAGE_CRO_ROLE.id, LIFECYCLE_EMAIL_ROLE.id, MARKETING_OPERATIONS_ROLE.id], ["leads", "offer"]),
  domain("sales", "Sales", "Convert qualified opportunities through a trustworthy, repeatable sales process.", ["founder-sales-strategist", "founder-sales-enablement", "founder-customer-research"], ["conversion", "offer"]),
  domain("offer", "Offer", "Align positioning, packaging, pricing, and value with customer evidence and delivery reality.", ["founder-offer-strategist", PRODUCT_MARKETER_ROLE.id, "founder-pricing-strategist"], ["strategy", "delivery", "finance"]),
  domain("delivery", "Delivery", "Deliver promised outcomes reliably and create retention and expansion capacity.", ["founder-customer-success", "founder-onboarding-specialist", "founder-delivery-operations"], ["offer", "systems"]),
  domain("finance", "Finance", "Provide transparent financial analysis, forecasts, and constraints without money-movement authority.", ["founder-financial-analyst", "founder-business-forecaster", "founder-unit-economics-analyst"]),
  domain("systems", "Systems", "Improve people, process, capacity, and operating reliability across the business.", ["founder-operations", "founder-people-hiring", "founder-process-sop"]),
];

export const FOUNDER_BUSINESS_REVIEW_WORKFLOW = { id: "founder-business-review", name: "Founder Business Review", description: "Reviews current business evidence to identify the primary constraint, risks, owner decisions, and next priorities.", coordinatorRoleId: FOUNDER_CHIEF_OF_STAFF_ROLE.id, contributorRoleIds: ["founder-strategy-advisor", MARKETING_ANALYST_ROLE.id, "founder-sales-strategist", "founder-delivery-operations", "founder-financial-analyst", "founder-operations"], domainIds: FOUNDER_OS_DOMAINS.map((item) => item.id), inputs: ["Goals", "Recent outcomes", "Business metrics", "Decisions", "Commitments", "Risks", "Domain state"], outputs: ["What's working", "What's not", "Current constraint", "Key risks", "Decisions needed", "Top priorities", "Recommended next actions", "Evidence, assumptions, and missing data"], stages: ["Review Goals", "Review metrics and outcomes", "Inspect each applicable domain", "Identify constraint", "Identify risks", "Set priorities", "Request owner approval"], checks: ["No missing metric is fabricated", "Constraint is supported by evidence", "Recommendations focus on the constraint", "Consequential actions remain unexecuted"], approvalPolicyId: APPROVAL_POLICY.id } as const;

const marketingSelections = MARKETING_ENGINEERING_ROLE_PACK.roles.map(({ role: selected }) => selected);
export const FOUNDER_OS_SOLUTION_PACK: SolutionPack = {
  id: "founder-os", name: "Founder OS", description: "A Goal-centric operating system for understanding business state, finding the current constraint, assembling expertise, and preparing owner decisions.", purpose: "Help an owner operate the business as a connected system rather than a collection of unrelated chats or bots.",
  rolePackIds: ["founder-os-core", "marketing-engineering"],
  roles: [
    ...FOUNDER_OS_ROLE_PACK.roles.map(({ role: selected }) => ({ packId: FOUNDER_OS_ROLE_PACK.id, roleId: selected.id, contribution: selected.description })),
    ...marketingSelections.map((selected) => ({ packId: "marketing-engineering", roleId: selected.id, contribution: selected.description })),
  ],
  domains: FOUNDER_OS_DOMAINS, goalTemplates: FOUNDER_GOAL_TEMPLATES, workflowTemplates: [FOUNDER_BUSINESS_REVIEW_WORKFLOW], artifactDefinitions: FOUNDER_ARTIFACT_DEFINITIONS, metricDefinitions: FOUNDER_METRIC_DEFINITIONS,
  knowledgeRequirements: ["company", "customers", "offer", "positioning", "products", "competitors", "pricing", "sales", "marketing", "delivery", "finance", "people", "processes", "metrics"],
  recommendedCapabilities: ["goals.operating-system", "web.search", "web.read", "computer.browser", "files.read", "files.write"], approvalPolicies: [APPROVAL_POLICY], enabledByDefault: true, tags: ["business", "founder", "goal-centric", "constraint-first"],
};
