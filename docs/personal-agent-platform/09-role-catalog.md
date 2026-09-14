# Role Catalog and execution resources

## Product model

The Role Catalog describes expertise available to the primary personal Agent. It does not turn the product into a bot-management system.

```text
Owner
  ↓
Goals
  ↓
Primary Personal Agent
  ↓
Tasks
  ↓
Role / Persistent Agent / Capability
  ↓
Run
  ↓
Evidence
  ↓
Outcome
```

The primary Agent remains accountable for coordination and the final result. It should select the smallest sufficient set of execution resources for the owner's task.

## Role, Role Pack, and Agent

- A **RoleDefinition** is reusable expertise: purpose, responsibilities, boundaries, recommended capabilities, default instructions, and optional model/reasoning guidance.
- A **RolePack** groups roles for a domain. Lifecycle stages are pack-local, so the Software Development lifecycle does not constrain unrelated packs.
- A **persistent Agent** is a durable, owner-scoped execution identity with editable instructions, capabilities, limits, model settings, status, and audit history.

A Role has no mailbox, conversation history, memory identity, credentials, or execution authority. Recommended capabilities are configuration guidance only. Relay and the Agent's actual capability policy determine authority at runtime.

Creating a persistent Agent from a Role copies only safe defaults: role name, description, instructions, boundaries, recommended capabilities, model, and reasoning. The owner can edit all fields before saving. Private state, conversations, credentials, tokens, owner data, and memories are never copied.

## Built-in packs

- **General:** Researcher, Writer, Analyst, Scheduler.
- **Software Development:** Product manager, Researcher, Product designer, Software architect, Software developer, Test automation engineer, Code & security reviewer, Release & reliability engineer, Support & incident agent, Analyst. Its local lifecycle is Direction → Discovery → Design → Build → Verify → Release → Operate → Learn.
- **Marketing Engineering:** Marketing Engineer, Market Researcher, Product Marketer, Content Strategist, Creative / Brand Designer, Growth / Performance Marketer, SEO / AEO Specialist, Lifecycle / Email Marketer, Landing Page / CRO Specialist, Marketing Operations, Marketing Analyst. Its local lifecycle is Understand → Research → Plan → Produce → Verify → Approve → Execute → Measure → Learn.
- **Verification:** Functional & State, UX & Accessibility, Trust & Resilience.

General and Software Development roles are available for bounded on-demand delegation. Verification roles are the existing isolated product-QA specialists and remain invocable only through the existing product-QA workflow. This does not create a second QA execution model.

## Runs and attribution

Both execution paths converge on the canonical Run, Evidence, and Outcome infrastructure:

```text
Goal → Task → on-demand Role → Run → Evidence → Outcome
Goal → Task → persistent Agent → Run → Evidence → Outcome
```

Persistent Agent and on-demand Role runs use the same `agent_runs` infrastructure. `executor_kind` distinguishes `primary-agent`, `persistent-agent`, and `on-demand-role`; `role_id` is present only for on-demand Role runs. A Role run uses the primary Agent runtime and actual capability/approval policy without creating a persistent identity. There is no separate Role Run model.

Migration `0012_role_run_attribution.sql` depends only on the canonical schema available after `0008_persistent_agents.sql`: `web_chat_threads`, `agents` (including `is_primary`), and `agent_runs`. It has no dependency on `0009` Scoped Memory, `0010` Agent Computer, or `0011` Knowledge Core. Phase-local branches may therefore contain a deliberate numeric gap before `0012`; the migration loader sorts versions, rejects duplicates, and does not require contiguous numbering.

Phase 6 attributes `computer_sessions`, `computer_actions`, and `computer_artifacts` to the existing `agents` and `task_runs` schemas. Role attribution extends `agent_runs` and `web_chat_threads` instead. The migrations do not share table alterations, foreign keys, constraints, or index names. A future integration should preserve that distinction: computer execution remains linked through `task_runs`, while conversational Agent and Role execution remains attributed through `agent_runs`.

Phase 9A is independent. Role execution does not require or foreign-key into Knowledge tables, and Knowledge integration remains deferred.

## Delegation policy

The workflow hard ceiling is 16 delegated calls. It is a guardrail, not a target:

- Simple work: 1–2 workers.
- Structured work: 2–5 workers.
- Complex work: dynamically selected within policy, never above 16.

Delegation must respect the selected Agent's or Run's capabilities, runtime and cost limits, approval requirements, and the fixed QA boundaries. Autonomous routing and handoffs are intentionally out of scope.

## Future executor selection

Future routing should evaluate the full decision funnel rather than matching only Role descriptions:

```text
Task requirements
       ↓
Role Catalog
       ↓
Candidate Roles / Agents
       ↓
Capability availability
       ↓
Context authorization
       ↓
Risk
       ↓
Cost / budget
       ↓
Availability
       ↓
Historical outcomes
       ↓
Executor selection
```

This is an integration seam, not an implemented planner in this phase.

## Distribution and serialization

The catalog is owner- and primary-Agent-agnostic. Future deployments can select different packs without assuming a particular person, Agent name, or software use case. Builder pack selection remains follow-up work; the current built-in set is preserved for compatibility.

Future shareable Role Packs may serialize definitions, recommended capabilities, default instructions, safety boundaries, suggested skills, and suggested routines. They must never contain credentials, private memories, conversation history, connected-account tokens, or owner-specific data.

Potential future packs include Personal Productivity, Travel, Job Search, Content Creation, Small Business, Sales, Marketing, Finance, and Research. Marketplace sharing is not implemented here.

## Change classification and parallel boundaries

- **REUSE:** persistent Agent CRUD, lifecycle controls, capability/model/limit configuration, audited execution, product-QA infrastructure, and general delegation.
- **EXTEND:** Manage → Agents with catalog browsing, Role detail, and editable create-from-Role defaults.
- **MIGRATE:** the SDLC roster content into generic RoleDefinition/RolePack primitives and a Software Development pack.
- **REPLACE:** only the SDLC-specific platform abstraction and its software-only UI assumptions.

This work does not modify or absorb Scoped Memory (Phase 5), Agent Computer (Phase 6), or Knowledge (Phase 9A). Their future inputs remain recommendations or routing signals; actual authority, memory ownership, and knowledge access stay with their respective systems.
