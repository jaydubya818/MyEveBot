# Marketing Engineering Role Pack

## Problem

Owners need sophisticated marketing work without manually orchestrating a roster of bots. Marketing must use MyEve's existing Goals, Roles, Agents, Context, Knowledge, capabilities, Runs, approvals, evidence, outcomes, and learning loop.

## Implemented slice

The built-in `Marketing Engineering` Role Pack contains 11 reusable on-demand Roles led by the Marketing Engineer. No persistent Agent is created automatically. Manage → Agents separates persistent identities under **Your Agents** from reusable expertise under **Role Catalog**. `Use Role` starts a role-scoped conversation on the primary Agent runtime and attributes each turn in canonical `agent_runs`; `Create Agent` opens the existing editable Agent creation flow with safe Role defaults.

The pack uses the local lifecycle:

```text
Understand → Research → Plan → Produce → Verify → Approve → Execute → Measure → Learn
```

Roles express purpose, responsibilities, typical inputs, typical outputs, recommended capabilities, and safety boundaries. Recommended capabilities are never permission grants. Relay remains authoritative.

## Golden workflow

`Campaign Research → Brief` is the first executable workflow and ships as the authored `campaign-research-brief` skill. It:

1. Verifies company, customer, offer, positioning, voice, proof, Goal, constraints, budget, and previous-result context.
2. Records market, competitor, customer-conversation, search, creative, channel, and performance evidence with provenance.
3. Produces three evidence-backed campaign angles and a complete Campaign Brief.
4. Separates deterministic checks from judgment-based review.
5. Stops at `Ready for Owner Review`.

The workflow cannot publish, send, launch ads, change budgets, purchase, schedule external communication, or modify a live production page without explicit Relay authority.

## Knowledge and campaign context

The skill includes readable templates for:

- `company.md`, `customer.md`, `offer.md`, `positioning.md`, `voice.md`, and `proof.md`;
- research findings with source, date, confidence, campaign relevance, scope, and status;
- campaign Brief, Research, Decisions, Tasks, Production, Assets, Approvals, and Results;
- workspace authority, storage, conflict, approval, and credential rules.

These files are representations and context surfaces, not a second source of truth. Structured MyEve Knowledge in Neon remains authoritative where available. Campaign artifacts retain a clean seam to future MyEve Project/Workspace integration, while large binaries stay in Workspace, Blob, or an approved external provider.

## Verification and learning

Marketing checks cover claim support, offer accuracy, audience relevance, brand and voice consistency, cross-channel consistency, and brief completeness. Existing Functional & State, UX & Accessibility, and Trust & Resilience specialists remain the independent product-QA path for implemented pages and forms.

Results may propose Facts, Observations, Insights, Hypotheses, Decisions, playbook updates, examples, or customer-knowledge updates. Owner corrections are evidence. Active instructions and shared Knowledge are never silently rewritten.

## Deferred

- Live publishing, outbound sending, ad launch, purchasing, and budget control.
- Full marketing warehouse ingestion and attribution infrastructure.
- Automatic external data refresh and campaign execution.
- Full Project/Workspace and structured Knowledge integration.
- Remaining workflow templates and verticals.
- Goal-template installation and a broader marketplace ecosystem.

## Future Solution Pack

A future Marketing Engineering Solution Pack may bundle this Role Pack with Goal templates, workflow templates, skills, Knowledge templates, recommended capabilities, and approval policies. It must continue to use generic MyEve primitives and remain usable by creators, startups, small businesses, SaaS companies, consultants, ecommerce businesses, and enterprise marketers without embedding MyEve-specific campaign content.
