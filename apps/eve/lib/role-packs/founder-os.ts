import type { RoleDefinition, RolePack } from "../role-catalog.ts";
import type {
  ApprovalPolicyDefinition,
  ArtifactDefinition,
  GoalTemplateDefinition,
  MetricDefinition,
  SolutionPack,
  SolutionPackDomain,
} from "../solution-pack.ts";
import {
  CONTENT_STRATEGIST_ROLE,
  GROWTH_PERFORMANCE_ROLE,
  LANDING_PAGE_CRO_ROLE,
  LIFECYCLE_EMAIL_ROLE,
  MARKET_RESEARCHER_ROLE,
  MARKETING_ANALYST_ROLE,
  MARKETING_ENGINEER_ROLE,
  PRODUCT_MARKETER_ROLE,
  SEO_AEO_ROLE,
} from "./marketing-engineering.ts";

const PREPARATION_BOUNDARY = "May research, analyze, plan, forecast, draft, create Tasks, and prepare unpublished artifacts.";
const AUTHORITY_BOUNDARY = "Recommendations never grant authority. Relay and the owner's explicit approval remain authoritative for consequential actions.";

function founderRole(input: Omit<RoleDefinition, "category" | "executionMode" | "tags"> & { domain: string; tags?: readonly string[] }): RoleDefinition {
  const { domain, tags = [], ...role } = input;
  return {
    ...role,
    category: `Founder OS · ${domain}`,
    executionMode: "on-demand",
    tags: ["founder-os", domain.toLowerCase(), ...tags],
  };
}

function standardRole(id: string, name: string, domain: string, description: string, responsibilities: readonly string[], inputs: readonly string[], outputs: readonly string[], boundaries: readonly string[] = []): RoleDefinition {
  return founderRole({
    id,
    name,
    domain,
    description,
    responsibilities,
    typicalInputs: inputs,
    typicalOutputs: outputs,
    boundaries: [PREPARATION_BOUNDARY, ...boundaries, AUTHORITY_BOUNDARY],
    recommendedCapabilities: ["goals.operating-system", "web.search", "web.read", "files.read", "files.write"],
    recommendedReasoning: "high",
  });
}

export const FOUNDER_CHIEF_OF_STAFF_ROLE = founderRole({
  id: "founder-chief-of-staff",
  name: "Founder / Chief of Staff",
  domain: "Coordination",
  description: "Coordinates business Goals across operating domains, identifies the current constraint, and prepares owner decisions and reviews.",
  responsibilities: ["Understand owner objectives", "Maintain priorities and dependencies", "Identify constraints and risks", "Coordinate specialist Roles", "Review outcomes and prepare business reviews"],
  typicalInputs: ["Active Goals", "Authorized business metrics", "Decisions and commitments", "Risks, constraints, and recent outcomes"],
  typicalOutputs: ["Constraint diagnosis", "Domain priorities", "Coordinated work plan", "Decision requests", "Founder Business Review"],
  boundaries: [PREPARATION_BOUNDARY, "Use scoped, authorized context and state missing data explicitly.", "Do not execute consequential recommendations or inherit specialist capabilities automatically.", AUTHORITY_BOUNDARY],
  recommendedCapabilities: ["goals.operating-system", "web.search", "web.read", "files.read", "files.write"],
  recommendedReasoning: "high",
  recommendedRiskCeiling: "medium",
  defaultInstructions: "Coordinate the owner's business Goal through Business State, Constraint, Domain, Role or Workflow, Work, Evidence, Owner Decision, Outcome, Metrics, and Learning. Diagnose the narrowest current constraint before proposing work. Never fabricate missing metrics. Keep external communication, publishing, spending, price changes, contracts, hiring decisions, payments, deployments, and live-system changes behind explicit Relay approval.",
});

export const STRATEGY_ADVISOR_ROLE = standardRole("founder-strategy-advisor", "Strategy Advisor", "Strategy", "Turns business context into explicit strategic choices and priorities.", ["Vision and objective framing", "Prioritization", "Strategic decision support", "Risk analysis"], ["Owner objectives", "Business state", "Market evidence", "Constraints"], ["Strategic options", "Priority recommendation", "Decision brief", "Risk register"]);
export const MARKET_ANALYST_ROLE = standardRole("founder-market-analyst", "Market Analyst", "Strategy", "Analyzes markets, categories, competitors, and customer evidence without inventing certainty.", ["Market analysis", "Competitive analysis", "Evidence synthesis", "Opportunity sizing"], ["Market question", "Customer evidence", "Competitor set"], ["Market analysis", "Competitor comparison", "Evidence gaps"]);
export const BUSINESS_PLANNER_ROLE = standardRole("founder-business-planner", "Business Planner", "Strategy", "Translates strategy into bounded quarterly priorities, dependencies, and measurable plans.", ["Quarterly planning", "Objective decomposition", "Dependency mapping", "Scenario planning"], ["Strategy", "Goals", "Capacity", "Constraints"], ["Business plan", "Quarterly priorities", "Dependency map"]);

export const LEAD_MAGNET_STRATEGIST_ROLE = standardRole("founder-lead-magnet-strategist", "Lead Magnet Strategist", "Leads", "Designs useful lead magnets aligned with the audience, offer, and qualification intent.", ["Lead magnet strategy", "CTA alignment", "Qualification design"], ["ICP", "Offer", "Customer problems", "Channel context"], ["Lead magnet brief", "CTA recommendation", "Qualification hypothesis"]);
export const FUNNEL_STRATEGIST_ROLE = standardRole("founder-funnel-strategist", "Funnel Strategist", "Leads", "Maps how attention becomes qualified demand and identifies funnel leakage.", ["Funnel design", "Lead capture", "Nurture mapping", "Bottleneck analysis"], ["Funnel metrics", "Audience", "Offer", "Channels"], ["Funnel map", "Constraint diagnosis", "Experiment backlog"]);
export const CONVERSION_STRATEGIST_ROLE = standardRole("founder-conversion-strategist", "Conversion Strategist", "Conversion", "Improves conversion journeys using explicit evidence, hypotheses, and measurable tests.", ["Journey analysis", "Conversion diagnosis", "Experiment prioritization"], ["Journey", "Conversion metrics", "Customer evidence"], ["Conversion diagnosis", "Prioritized test plan", "Decision request"]);

export const SALES_STRATEGIST_ROLE = standardRole("founder-sales-strategist", "Sales Strategist", "Sales", "Designs a trustworthy sales motion aligned with customer evidence and the offer.", ["Sales motion", "Discovery", "Objection handling", "Follow-up strategy"], ["ICP", "Offer", "Sales evidence", "Pipeline state"], ["Sales strategy", "Discovery flow", "Objection plan"]);
export const SALES_ENABLEMENT_ROLE = standardRole("founder-sales-enablement", "Sales Enablement", "Sales", "Creates accurate, usable material that helps the owner sell consistently.", ["Sales scripts", "Proposals", "Follow-up", "Social proof organization"], ["Sales strategy", "Approved claims", "Customer objections"], ["Sales collateral", "Call script", "Follow-up sequence"], ["Do not send proposals or external messages without approval."]);
export const CUSTOMER_RESEARCH_ROLE = standardRole("founder-customer-research", "Customer Research", "Sales", "Synthesizes customer conversations and sales evidence into actionable patterns.", ["Interview planning", "Sales-call review", "Objection analysis", "Customer-language capture"], ["Calls", "Interviews", "CRM evidence", "Research question"], ["Customer findings", "Quote bank", "Objection themes"]);

export const OFFER_STRATEGIST_ROLE = standardRole("founder-offer-strategist", "Offer Strategist", "Offer", "Shapes a coherent offer around customer value, differentiation, and delivery reality.", ["Offer architecture", "Packaging", "Value ladder", "Offer validation"], ["ICP", "Customer evidence", "Product", "Delivery constraints"], ["Offer architecture", "Offer stack", "Validation plan"]);
export const PRICING_STRATEGIST_ROLE = standardRole("founder-pricing-strategist", "Pricing Strategist", "Offer", "Analyzes pricing and packaging options without changing live prices.", ["Pricing research", "Packaging analysis", "Scenario comparison", "Pricing consistency"], ["Current pricing", "Costs", "Customer evidence", "Competitors"], ["Pricing matrix", "Scenario analysis", "Owner decision brief"], ["Changing a live price requires explicit approval."]);

export const CUSTOMER_SUCCESS_ROLE = standardRole("founder-customer-success", "Customer Success", "Delivery", "Designs customer outcomes, communication, retention, and expansion playbooks.", ["Success planning", "Customer communication", "Retention", "Expansion"], ["Customer goals", "Offer promise", "Delivery evidence"], ["Success plan", "Communication draft", "Expansion hypothesis"], ["Do not contact customers without approval."]);
export const ONBOARDING_SPECIALIST_ROLE = standardRole("founder-onboarding-specialist", "Onboarding Specialist", "Delivery", "Creates clear onboarding journeys from signed agreement to first value.", ["Onboarding", "Kickoff", "Milestones", "Client welcome"], ["Offer", "Customer context", "Implementation constraints"], ["Onboarding plan", "Kickoff agenda", "Milestone tracker"]);
export const DELIVERY_OPERATIONS_ROLE = standardRole("founder-delivery-operations", "Delivery Operations", "Delivery", "Improves delivery capacity, consistency, dependencies, and quality controls.", ["Capacity analysis", "Process design", "Delivery risk", "Quality checks"], ["Delivery workflow", "Capacity", "Milestones", "Incidents"], ["Delivery plan", "Capacity assessment", "Risk controls"]);

export const FINANCIAL_ANALYST_ROLE = standardRole("founder-financial-analyst", "Financial Analyst", "Finance", "Analyzes business financial data for owner decision support without transactional authority.", ["Revenue and expense analysis", "Cash-flow review", "Margin analysis"], ["Authorized financial records", "Metric definitions", "Reporting period"], ["Financial analysis", "Variance explanation", "Decision support"], ["Financial analysis is not money movement; do not transfer, purchase, pay, or change billing."]);
export const BUSINESS_FORECASTER_ROLE = standardRole("founder-business-forecaster", "Business Forecaster", "Finance", "Builds transparent forecasts and scenarios with explicit assumptions.", ["Revenue forecast", "Cash forecast", "Runway", "Scenario analysis"], ["Historical data", "Known commitments", "Assumptions", "Timeframe"], ["Forecast", "Scenario plan", "Assumption register"], ["Do not represent a forecast as certainty or move money."]);
export const UNIT_ECONOMICS_ANALYST_ROLE = standardRole("founder-unit-economics-analyst", "Unit Economics Analyst", "Finance", "Defines and analyzes unit economics consistently across acquisition, sale, and delivery.", ["Contribution margin", "Acquisition economics", "Payback analysis", "Metric definition"], ["Revenue", "Variable costs", "Acquisition costs", "Retention data"], ["Unit economics model", "Metric definitions", "Sensitivity analysis"], ["Do not move money or change billing."]);

export const OPERATIONS_ROLE = standardRole("founder-operations", "Operations", "Systems", "Identifies operational constraints and improves the flow of work across the business.", ["Operating cadence", "Bottleneck analysis", "Capacity", "Automation opportunities"], ["Goals", "Processes", "Capacity", "Commitments"], ["Operations plan", "Constraint map", "Improvement backlog"]);
export const PEOPLE_HIRING_ROLE = standardRole("founder-people-hiring", "People / Hiring", "Systems", "Prepares hiring plans, role clarity, and evidence-based interview support.", ["Hiring plans", "Role scorecards", "Org design", "Interview synthesis"], ["Business need", "Capacity gap", "Candidate evidence"], ["Hiring plan", "Role description", "Scorecard", "Interview analysis"], ["Do not send offers, reject candidates, terminate people, or change compensation without explicit approval."]);
export const PROCESS_SOP_ROLE = standardRole("founder-process-sop", "Process / SOP", "Systems", "Turns repeated work into clear, maintainable operating procedures.", ["Process mapping", "SOP creation", "Control points", "Continuous improvement"], ["Observed process", "Owner standards", "Failure evidence"], ["SOP", "Process map", "Improvement proposal"]);

export const FOUNDER_OS_ROLE_PACK: RolePack = {
  id: "founder-os-core",
  name: "Founder OS Core",
  description: "Native business-operating roles used by the Founder OS Solution Pack.",
  domain: "Business operations",
  catalogVisibility: "internal",
  roles: [
    FOUNDER_CHIEF_OF_STAFF_ROLE, STRATEGY_ADVISOR_ROLE, MARKET_ANALYST_ROLE, BUSINESS_PLANNER_ROLE,
    LEAD_MAGNET_STRATEGIST_ROLE, FUNNEL_STRATEGIST_ROLE, CONVERSION_STRATEGIST_ROLE,
    SALES_STRATEGIST_ROLE, SALES_ENABLEMENT_ROLE, CUSTOMER_RESEARCH_ROLE,
    OFFER_STRATEGIST_ROLE, PRICING_STRATEGIST_ROLE,
    CUSTOMER_SUCCESS_ROLE, ONBOARDING_SPECIALIST_ROLE, DELIVERY_OPERATIONS_ROLE,
    FINANCIAL_ANALYST_ROLE, BUSINESS_FORECASTER_ROLE, UNIT_ECONOMICS_ANALYST_ROLE,
    OPERATIONS_ROLE, PEOPLE_HIRING_ROLE, PROCESS_SOP_ROLE,
  ].map((role) => ({ role })),
  tags: ["founder-os", "solution-pack"],
};

const PREPARATION_POLICY: ApprovalPolicyDefinition = {
  id: "founder-preparation",
  name: "Prepare safely, approve consequences",
  description: "Founder OS may prepare decision support and artifacts; Relay remains authoritative for consequential action.",
  rules: [
    ...["research", "analysis", "drafting", "planning", "forecasting", "create_artifact", "create_task", "recommendation"].map((action) => ({ action, requirement: "allowed" as const })),
    ...["send_external_communication", "publish", "spend_money", "change_prices", "launch_ads", "make_payment", "modify_live_system", "commit_contract", "delete_business_data", "hire_or_fire", "change_compensation", "deploy_code"].map((action) => ({ action, requirement: "approval_required" as const })),
  ],
};

const goal = (id: string, name: string, description: string, domainIds: readonly string[], inputs: readonly string[], outputs: readonly string[], maturity: GoalTemplateDefinition["maturity"] = "defined", workflowIds: readonly string[] = []): GoalTemplateDefinition => ({
  id, name, description, domainIds, inputs, outputs, maturity, workflowIds,
  guardrails: ["Do not fabricate missing metrics.", "Identify the current constraint before creating broad activity.", "Consequential actions require owner approval through Relay."],
});

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

const artifact = (id: string, name: string, domainId: string, roleIds: readonly string[], template = false): ArtifactDefinition => ({
  id, name, domainId,
  description: `A reviewable ${name.toLowerCase()} grounded in current business evidence.`,
  inputs: ["Relevant authorized business context", "Goal", "Evidence", "Known constraints"],
  outputType: "markdown",
  recommendedRoleIds: roleIds,
  requiredKnowledge: ["company", "customers", "offer", "metrics"],
  checks: ["Inputs and missing data are explicit", "Claims trace to evidence", "Owner decisions are separated from recommendations"],
  approvalPolicyId: PREPARATION_POLICY.id,
  ...(template ? { templateRef: `docs/templates/founder-os/${id}.md` } : {}),
});

export const FOUNDER_ARTIFACT_DEFINITIONS: readonly ArtifactDefinition[] = [
  artifact("ideal-customer-profile", "Ideal Customer Profile", "traffic", [PRODUCT_MARKETER_ROLE.id, MARKET_RESEARCHER_ROLE.id], true),
  artifact("brand-positioning", "Brand Positioning", "traffic", [PRODUCT_MARKETER_ROLE.id]),
  artifact("content-strategy", "Content Strategy", "traffic", [CONTENT_STRATEGIST_ROLE.id]),
  artifact("campaign-brief", "Campaign Brief", "traffic", [MARKETING_ENGINEER_ROLE.id, PRODUCT_MARKETER_ROLE.id], true),
  artifact("lead-magnet", "Lead Magnet", "leads", [LEAD_MAGNET_STRATEGIST_ROLE.id]),
  artifact("funnel-map", "Funnel Map", "leads", [FUNNEL_STRATEGIST_ROLE.id]),
  artifact("nurture-sequence", "Nurture Sequence", "leads", [LIFECYCLE_EMAIL_ROLE.id]),
  artifact("landing-page", "Landing Page", "conversion", [LANDING_PAGE_CRO_ROLE.id]),
  artifact("vsl-script", "VSL Script", "conversion", [CONVERSION_STRATEGIST_ROLE.id]),
  artifact("application-funnel", "Application Funnel", "conversion", [FUNNEL_STRATEGIST_ROLE.id, LANDING_PAGE_CRO_ROLE.id]),
  artifact("sales-call-script", "Sales Call Script", "sales", [SALES_ENABLEMENT_ROLE.id, SALES_STRATEGIST_ROLE.id], true),
  artifact("objection-handling", "Objection Handling", "sales", [SALES_ENABLEMENT_ROLE.id, CUSTOMER_RESEARCH_ROLE.id]),
  artifact("sales-review-scorecard", "Sales Call Review Scorecard", "sales", [CUSTOMER_RESEARCH_ROLE.id]),
  artifact("proposal-sow", "Proposal / SOW", "sales", [SALES_ENABLEMENT_ROLE.id]),
  artifact("offer-architecture", "Offer Architecture", "offer", [OFFER_STRATEGIST_ROLE.id, PRODUCT_MARKETER_ROLE.id], true),
  artifact("pricing-matrix", "Pricing Matrix", "offer", [PRICING_STRATEGIST_ROLE.id]),
  artifact("value-ladder", "Value Ladder", "offer", [OFFER_STRATEGIST_ROLE.id]),
  artifact("competitor-analysis", "Competitor Analysis", "offer", [MARKET_ANALYST_ROLE.id, PRODUCT_MARKETER_ROLE.id]),
  artifact("client-onboarding-plan", "Client Onboarding Plan", "delivery", [ONBOARDING_SPECIALIST_ROLE.id, CUSTOMER_SUCCESS_ROLE.id], true),
  artifact("milestone-tracker", "Milestone Tracker", "delivery", [DELIVERY_OPERATIONS_ROLE.id]),
  artifact("implementation-checklist", "Implementation Checklist", "delivery", [DELIVERY_OPERATIONS_ROLE.id]),
  artifact("case-study-template", "Case Study Template", "delivery", [CUSTOMER_SUCCESS_ROLE.id]),
  artifact("revenue-forecast", "Revenue Forecast", "finance", [BUSINESS_FORECASTER_ROLE.id]),
  artifact("cash-flow-forecast", "Cash Flow Forecast", "finance", [BUSINESS_FORECASTER_ROLE.id, FINANCIAL_ANALYST_ROLE.id]),
  artifact("runway-model", "Runway Model", "finance", [BUSINESS_FORECASTER_ROLE.id]),
  artifact("margin-analysis", "Margin Analysis", "finance", [UNIT_ECONOMICS_ANALYST_ROLE.id]),
  artifact("scenario-plan", "Scenario Plan", "finance", [BUSINESS_FORECASTER_ROLE.id]),
  artifact("hiring-plan", "Hiring Plan", "systems", [PEOPLE_HIRING_ROLE.id]),
  artifact("role-scorecard", "Role Scorecard", "systems", [PEOPLE_HIRING_ROLE.id]),
  artifact("sop", "Standard Operating Procedure", "systems", [PROCESS_SOP_ROLE.id]),
  artifact("quarterly-business-review", "Quarterly Business Review", "strategy", [FOUNDER_CHIEF_OF_STAFF_ROLE.id, BUSINESS_PLANNER_ROLE.id], true),
];

const metric = (id: string, name: string, domainId: string, definition: string, unit: string): MetricDefinition => ({
  id, name, domainId, definition, unit, source: "connected app, system of record, or manual input", freshness: "must be stated", reportingPeriod: "must be stated",
});

export const FOUNDER_METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  metric("traffic-volume", "Traffic", "traffic", "Visits or audience reach for a named source and period.", "count"),
  metric("qualified-leads", "Qualified Leads", "leads", "Leads meeting the owner's explicit qualification definition.", "count"),
  metric("lead-conversion-rate", "Lead Conversion Rate", "conversion", "Qualified leads divided by relevant traffic for the same cohort and period.", "percent"),
  metric("sales-close-rate", "Sales Close Rate", "sales", "Closed-won opportunities divided by qualified sales opportunities for the same cohort.", "percent"),
  metric("average-deal-value", "Average Deal Value", "offer", "Recognized deal value divided by closed-won deals for the stated period.", "currency"),
  metric("delivery-capacity", "Delivery Capacity", "delivery", "Available delivery units compared with committed demand for the stated period.", "ratio"),
  metric("revenue", "Revenue", "finance", "Revenue recognized under the owner's stated accounting basis and period.", "currency"),
  metric("gross-margin", "Gross Margin", "finance", "Revenue less direct costs, divided by revenue, under a stated cost definition.", "percent"),
  metric("cash-runway", "Cash Runway", "finance", "Available cash divided by forecast net cash burn using stated assumptions.", "months"),
  metric("operating-capacity", "Operating Capacity", "systems", "Available operating capacity compared with committed work for the stated period.", "ratio"),
];

export interface BusinessMetricSignal {
  metricId: string;
  assessment: "strong" | "acceptable" | "weak" | "unknown";
  evidence: string;
}

export interface ConstraintDiagnosis {
  primaryDomainIds: readonly string[];
  evidence: readonly string[];
  assumptions: readonly string[];
  missingMetricIds: readonly string[];
}

const REVENUE_FUNNEL_METRICS = ["traffic-volume", "qualified-leads", "lead-conversion-rate", "sales-close-rate", "average-deal-value", "delivery-capacity", "gross-margin", "cash-runway", "operating-capacity"] as const;
const CONSTRAINT_DOMAINS: Readonly<Record<(typeof REVENUE_FUNNEL_METRICS)[number], readonly string[]>> = {
  "traffic-volume": ["traffic"],
  "qualified-leads": ["leads"],
  "lead-conversion-rate": ["leads", "conversion"],
  "sales-close-rate": ["sales"],
  "average-deal-value": ["offer", "sales"],
  "delivery-capacity": ["delivery"],
  "gross-margin": ["finance", "delivery", "offer"],
  "cash-runway": ["finance"],
  "operating-capacity": ["systems"],
};

export function diagnoseRevenueConstraint(signals: readonly BusinessMetricSignal[]): ConstraintDiagnosis {
  const byMetric = new Map(signals.map((signal) => [signal.metricId, signal]));
  const weakMetric = REVENUE_FUNNEL_METRICS.find((metricId) => byMetric.get(metricId)?.assessment === "weak");
  return {
    primaryDomainIds: weakMetric ? CONSTRAINT_DOMAINS[weakMetric] : [],
    evidence: weakMetric ? [byMetric.get(weakMetric)!.evidence] : [],
    assumptions: [],
    missingMetricIds: REVENUE_FUNNEL_METRICS.filter((metricId) => !byMetric.has(metricId) || byMetric.get(metricId)?.assessment === "unknown"),
  };
}

const artifactIds = (domainId: string) => FOUNDER_ARTIFACT_DEFINITIONS.filter((item) => item.domainId === domainId).map((item) => item.id);
const metricIds = (domainId: string) => FOUNDER_METRIC_DEFINITIONS.filter((item) => item.domainId === domainId).map((item) => item.id);
const goalIds = (domainId: string) => FOUNDER_GOAL_TEMPLATES.filter((item) => item.domainIds.includes(domainId)).map((item) => item.id);
const domain = (id: string, name: string, purpose: string, roleIds: readonly string[], options: Partial<Pick<SolutionPackDomain, "exampleDecisions" | "risks" | "dependencyDomainIds" | "knowledgeRequirements" | "recommendedCapabilities">> = {}): SolutionPackDomain => ({
  id, name, purpose, health: "unknown", healthBasis: "unavailable", roleIds,
  goalTemplateIds: goalIds(id), metricIds: metricIds(id), artifactIds: artifactIds(id),
  workflowIds: id === "strategy" ? ["founder-business-review"] : [],
  exampleDecisions: options.exampleDecisions ?? [], risks: options.risks ?? [], dependencyDomainIds: options.dependencyDomainIds ?? [],
  knowledgeRequirements: options.knowledgeRequirements ?? ["company", "customers", "offer", "metrics"],
  recommendedCapabilities: options.recommendedCapabilities ?? ["goals.operating-system", "files.read", "files.write"],
});

export const FOUNDER_OS_DOMAINS: readonly SolutionPackDomain[] = [
  domain("strategy", "Strategy", "Set direction, choose priorities, and make explicit strategic tradeoffs.", [STRATEGY_ADVISOR_ROLE.id, MARKET_ANALYST_ROLE.id, BUSINESS_PLANNER_ROLE.id], { exampleDecisions: ["Enter a market", "Delay an initiative"], risks: ["Conflicting priorities", "Unsupported assumptions"] }),
  domain("traffic", "Traffic", "Build relevant awareness with the right audience.", [MARKETING_ENGINEER_ROLE.id, PRODUCT_MARKETER_ROLE.id, CONTENT_STRATEGIST_ROLE.id, GROWTH_PERFORMANCE_ROLE.id, SEO_AEO_ROLE.id], { dependencyDomainIds: ["strategy", "offer"] }),
  domain("leads", "Leads", "Turn relevant attention into qualified demand.", [GROWTH_PERFORMANCE_ROLE.id, LEAD_MAGNET_STRATEGIST_ROLE.id, FUNNEL_STRATEGIST_ROLE.id, LIFECYCLE_EMAIL_ROLE.id], { dependencyDomainIds: ["traffic", "offer"] }),
  domain("conversion", "Conversion", "Help qualified prospects take the next intended step.", [CONVERSION_STRATEGIST_ROLE.id, LANDING_PAGE_CRO_ROLE.id, LIFECYCLE_EMAIL_ROLE.id], { dependencyDomainIds: ["leads", "offer"] }),
  domain("sales", "Sales", "Convert qualified opportunities through a trustworthy, repeatable sales process.", [SALES_STRATEGIST_ROLE.id, SALES_ENABLEMENT_ROLE.id, CUSTOMER_RESEARCH_ROLE.id], { exampleDecisions: ["Change qualification", "Revise follow-up"], dependencyDomainIds: ["conversion", "offer"] }),
  domain("offer", "Offer", "Align positioning, packaging, pricing, and value with customer evidence and delivery reality.", [OFFER_STRATEGIST_ROLE.id, PRODUCT_MARKETER_ROLE.id, PRICING_STRATEGIST_ROLE.id], { exampleDecisions: ["Change pricing", "Change packaging"], dependencyDomainIds: ["strategy", "delivery", "finance"] }),
  domain("delivery", "Delivery", "Deliver promised outcomes reliably and create retention and expansion capacity.", [CUSTOMER_SUCCESS_ROLE.id, ONBOARDING_SPECIALIST_ROLE.id, DELIVERY_OPERATIONS_ROLE.id], { dependencyDomainIds: ["offer", "systems"] }),
  domain("finance", "Finance", "Provide transparent financial analysis, forecasts, and constraints without money-movement authority.", [FINANCIAL_ANALYST_ROLE.id, BUSINESS_FORECASTER_ROLE.id, UNIT_ECONOMICS_ANALYST_ROLE.id], { exampleDecisions: ["Increase budget", "Change price"], risks: ["Stale data", "Ambiguous accounting basis", "False precision"], knowledgeRequirements: ["finance", "pricing", "metrics", "commitments"] }),
  domain("systems", "Systems", "Improve people, process, capacity, and operating reliability across the business.", [OPERATIONS_ROLE.id, PEOPLE_HIRING_ROLE.id, PROCESS_SOP_ROLE.id], { exampleDecisions: ["Hire a team member", "Automate a process"], risks: ["Hidden coupling", "Unowned process", "Capacity constraint"] }),
];

export const FOUNDER_BUSINESS_REVIEW_WORKFLOW = {
  id: "founder-business-review",
  name: "Founder Business Review",
  description: "Reviews current business evidence to identify the primary constraint, risks, owner decisions, and next priorities.",
  coordinatorRoleId: FOUNDER_CHIEF_OF_STAFF_ROLE.id,
  contributorRoleIds: [STRATEGY_ADVISOR_ROLE.id, MARKETING_ANALYST_ROLE.id, SALES_STRATEGIST_ROLE.id, DELIVERY_OPERATIONS_ROLE.id, FINANCIAL_ANALYST_ROLE.id, OPERATIONS_ROLE.id],
  domainIds: FOUNDER_OS_DOMAINS.map((item) => item.id),
  inputs: ["Goals", "Recent outcomes", "Business metrics", "Decisions", "Commitments", "Risks", "Domain state"],
  outputs: ["What's working", "What's not", "Current constraint", "Key risks", "Decisions needed", "Top priorities", "Recommended next actions", "Evidence, assumptions, and missing data"],
  stages: ["Review Goals", "Review metrics and outcomes", "Inspect each applicable domain", "Identify constraint", "Identify risks", "Set priorities", "Request owner approval"],
  checks: ["No missing metric is fabricated", "Constraint is supported by evidence", "Recommendations focus on the constraint", "Consequential actions remain unexecuted"],
  approvalPolicyId: PREPARATION_POLICY.id,
} as const;

export const FOUNDER_OS_SOLUTION_PACK: SolutionPack = {
  id: "founder-os",
  name: "Founder OS",
  description: "A Goal-centric operating system for understanding business state, finding the current constraint, assembling expertise, and preparing owner decisions.",
  purpose: "Help an owner operate the business as a connected system rather than a collection of unrelated chats or bots.",
  rolePackIds: ["founder-os-core", "general", "marketing-engineering", "verification"],
  domains: FOUNDER_OS_DOMAINS,
  goalTemplates: FOUNDER_GOAL_TEMPLATES,
  workflowTemplates: [FOUNDER_BUSINESS_REVIEW_WORKFLOW],
  artifactDefinitions: FOUNDER_ARTIFACT_DEFINITIONS,
  metricDefinitions: FOUNDER_METRIC_DEFINITIONS,
  knowledgeRequirements: ["company", "customers", "offer", "positioning", "products", "competitors", "pricing", "sales", "marketing", "delivery", "finance", "people", "processes", "metrics"],
  recommendedCapabilities: ["goals.operating-system", "web.search", "web.read", "computer.browser", "files.read", "files.write", "skill.authored"],
  approvalPolicies: [PREPARATION_POLICY],
  enabledByDefault: true,
  tags: ["business", "founder", "goal-centric", "constraint-first"],
};
