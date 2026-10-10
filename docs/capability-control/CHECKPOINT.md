# Owner preferences checkpoint

Approved ownership: MyEve preferences and owner-facing eligibility; Relay organization/agent restrictions; each backend final admission and execution authority.

Implemented in an isolated branch:

- Exact existing signed owner session binding for HTTP and direct authenticated Sofie tool callers; explicit nonproduction installation/origin/database gate.
- PostgreSQL owner/installation scoped preferences, optimistic revisions, duplicate-safe commands, immutable audit and durable pending pause/revoke requests.
- Server-owned, organization-bound identity/evidence records. Platform defaults expire or revoke without granting execution authority; ordinary enterprise defaults remain off.
- Manage / Settings → Capabilities, seven groups, 36 descriptors, toggles, readiness/availability badges, dependencies, permissions, budgets, diagnostics link, unknown Work disclosure, and audit history.
- `show_capabilities` and always-approved `change_capability` use the same store and strict commands as Settings; delegated/guest/role-pack callers cannot change owner preferences.
- Canonical registry/resolver copied byte-for-byte from MissionControl `04770b83844b036080e59c9e6ea8ebb565383534`, checked by SHA-256 manifest.
- Explicit compatibility contracts and branch-specific deployment prevention.

Local qualification: 59 registry/resolver tests, 22 real disposable PostgreSQL/service checks, 10 real API/browser checks, six existing authentication tests, nine existing capability tests, TypeScript, capability-registry coverage, and executor-governance checks. Automated accessibility found zero WCAG 2 A/AA or 2.1 AA violations within the new panel. Repeated MissionControl-card screenshots match after reload; an approved visual baseline and manual assistive-technology qualification remain pending.

The actual platform owner has **not** been bound or activated. The existing local owner label is insufficient evidence of authenticated platform administration. A canonical administration/membership/installation record and isolated environment must be resolved before real-owner qualification. No duplicate account or email privilege rule was added.

No existing routing or backend admission path imports this preference store yet. Disabled preference, budget and control receipts cannot be represented as enforced backend outcomes. All returned admission eligibility is false. Existing Work inventory is unknown; pause/revoke stay PENDING_BACKEND. Relay administration, backend adapters/fencing, runtime subagent inheritance, real golden journeys, and independent security/architecture/product review remain open. This checkpoint is not production-ready.

Scope: new capability package/service/schema/UI/tools/tests/docs, narrow Settings/tool registrations, dependency lock entries, governance fingerprints, dedicated CI, and deployment suppression for this branch. The added `@types/pg` package makes two existing test suppression comments obsolete; only those comments were removed. No unrelated execution implementation was refactored.

Production integration: NOT_RUN. Paid operations: 0. External-alpha impact: NONE. No production credential, grant, migration, merge, or deployment action was performed.
