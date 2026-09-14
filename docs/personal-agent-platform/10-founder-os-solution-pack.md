# Founder OS Solution Pack

## Product model

Founder OS is a reusable Solution Pack, not a fleet of permanent Agents:

```text
Owner → Business Goal → Primary Agent → Founder / Chief of Staff
      → Business state → Constraint → Domain → Role / Workflow
      → Work → Evidence → Owner decision → Outcome → Metrics → Learning
```

The Founder / Chief of Staff coordinates bounded work and owner decisions. Creating a persistent Founder Agent is optional. Using the pack opens a new chat with a constraint-first draft; it does not send the draft, create other Agents, or grant authority.

## Canonical abstraction

`lib/solution-packs.ts` is the single generic model and validation path. `lib/builtin-solution-packs.ts` is the single built-in registry. Eve discovers that same registry through `list_solution_packs`; the Role Catalog UI renders it directly. A Solution Pack contains domains, Role selections, Goal Templates, Workflow Templates, Artifact Definitions, Metric Definitions, knowledge requirements, capability recommendations, and approval policies.

Founder OS composes Founder OS Core with Marketing Engineering. Its domain model references canonical Marketing Engineering Role objects, including the shared General roles exposed through that pack; it does not copy or redefine them.

The nine domains are Strategy, Traffic, Leads, Conversion, Sales, Offer, Delivery, Finance, and Systems. Initial health is `unknown` with an unavailable evidence basis. The model supports explicit health states but does not invent model-only scoring.

## Reconciliation with `64164b7`

The earlier frozen Founder OS commit was compared rather than merged.

Retained from `64164b7`:

- a dedicated built-in Solution Pack catalog;
- generic validation for unique pack IDs, Role Pack membership, Role references, and capability references;
- a read-only Eve discovery tool registered in the Capability Registry.

Superseded:

- the earlier checkpoint-only Solution Pack shape;
- its smaller Founder OS definition and separate registry path;
- its minimal UI treatment.

The richer implementation supplies the canonical nine-domain operating model, 21 native Founder roles, 27 domain-referenced roles, 11 Goal Templates, Founder Business Review, 31 Artifact Definitions, 10 Metric Definitions, six reusable artifact templates, constraint diagnosis, conservative approvals, and progressive-disclosure UI. No duplicate Founder OS definition, Solution Pack registry, or validation function remains.

## Working slice

The ready Goal Templates are Grow Revenue, Launch a Product, and Quarterly Business Review. The other eight are typed definitions for later workflow depth. Founder Business Review is the first cross-domain workflow. It reviews Goals, outcomes, metrics, decisions, commitments, risks, and domain state; identifies the narrowest supported constraint; and stops before consequential action.

The revenue golden path diagnoses Leads and Conversion when lead-conversion evidence is weak. Missing funnel metrics remain explicit instead of being inferred.

Six Markdown templates ship for Ideal Customer Profile, Offer Architecture, Campaign Brief, Sales Call Script, Client Onboarding Plan, and Quarterly Business Review.

## Authority boundary

Founder OS may research, analyze, plan, forecast, create Tasks, and prepare unpublished artifacts and recommendations. Relay and capability policy remain authoritative. The pack does not automatically:

- create fleets of Agents or grant capabilities;
- activate external accounts;
- schedule autonomous work or route tasks autonomously;
- move money;
- hire, fire, or change compensation;
- publish or send external communications;
- modify production systems or deploy code.

Finance roles analyze and forecast; they have no transaction authority. People / Hiring prepares plans and scorecards; it has no employment decision authority.

## Boundaries and deferrals

Business knowledge requirements point to existing authorized context; Founder OS does not add Scoped Memory or a Knowledge subsystem. It does not absorb Agent Computer, Agent Groups, handoffs, autonomous routing, agent-run attribution, or Builder pack enablement. Domain health can later consume canonical metrics and Goal state deterministically without creating a second business database.
