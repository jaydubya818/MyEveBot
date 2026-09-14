# Founder OS Solution Pack

## Product model

Founder OS is a reusable Solution Pack, not a roster of permanent Agents. It keeps MyEve Goal-centric:

```text
Owner → Business Goal → Primary Agent → Founder / Chief of Staff
      → Constraint → Domain → Role / Workflow → Artifact / Decision
      → Evidence → Outcome → Metrics → Learning
```

The Founder / Chief of Staff coordinates bounded work and owner decisions. Creating a persistent Founder Agent is optional. No other persistent Agents are created by enabling or using the pack.

## Architecture

`SolutionPack` is a small data-driven layer above Role Packs. It contains domain, Goal Template, Workflow Template, Artifact Definition, Metric Definition, Knowledge requirement, capability recommendation, and approval-policy records. Founder OS composes the internal Founder OS Core Role Pack with General, Marketing Engineering, and Verification.

Traffic, Leads, and Conversion reference the same Marketing Engineering `RoleDefinition` objects used by that Role Pack. Offer also reuses Product Marketer. Founder OS does not fork those roles or their authority.

The nine domains are Strategy, Traffic, Leads, Conversion, Sales, Offer, Delivery, Finance, and Systems. Initial health is `unknown` with an unavailable evidence basis. The model also supports `healthy`, `watch`, `at_risk`, `blocked`, and `not_applicable`; no model-only scoring is implemented.

## First working slice

Working Goal Templates:

- Grow Revenue
- Launch a Product
- Quarterly Business Review

The remaining Goal Templates are typed catalog definitions, ready for later workflow depth. Founder Business Review is the single implemented cross-domain workflow. It reviews Goals, outcomes, metrics, decisions, commitments, risks, and domain state; identifies the narrowest supported constraint; and stops for owner approval before consequential action.

The artifact catalog is data driven. Six representative Markdown templates ship for Ideal Customer Profile, Offer Architecture, Campaign Brief, Sales Call Script, Client Onboarding Plan, and Quarterly Business Review. Artifacts remain files or canonical MyEve records, not hardcoded routes.

## Authority and safety

Founder OS can safely prepare research, analysis, drafts, plans, forecasts, Tasks, artifacts, and recommendations. Relay approval remains required for external communication, publishing, spending, price changes, ads, payments, live-system mutations, contracts, business-data deletion, hiring or firing, compensation changes, and code deployment.

Finance roles only read, analyze, forecast, and recommend. The pack grants no transfer, purchase, payment, or billing-change authority. People / Hiring can prepare plans, role descriptions, scorecards, and interview analysis, but cannot send offers, reject candidates, terminate people, or change compensation without explicit approval.

## Integration seams and deferrals

- Business Knowledge requirements point to canonical MyEve Knowledge; no second knowledge platform is created.
- Domain health can later consume metrics, Goal risk, blocked Tasks, commitments, and freshness deterministically.
- Business metrics define meaning, unit, source, freshness, and reporting period without creating a warehouse.
- Daily and Weekly review integration can consume Founder OS sections later; no duplicate review infrastructure exists.
- Software-development delegation can route to the Software Development Role Pack later; no deep cross-pack orchestration exists yet.
- Builder enablement, dashboards, CRM, ERP, accounting, autonomous advertising, hiring, payments, and deployment are deferred.
