# Owner capability preferences

The owner approved MyEve as the durable preference and owner-facing eligibility authority on 2026-10-09. Relay retains organization and agent restrictions. Each execution backend independently authorizes its operations.

## Installation and identity

This checkpoint is explicitly gated to development or qualification. It uses a separate configured capability database, exact installation ID, and trusted browser origin (`MYEVE_CAPABILITY_ORIGIN`). Origin checks do not trust forwarded host headers or Next internal URL normalization. Production and hosted deployments are refused. Schema installation is an explicit operator operation, never a build or request side effect.

HTTP calls require a valid existing signed MyEve owner session even on localhost. The legacy development authentication bypass is not used. The principal ID is never accepted in a request body. Ordinary preferences do not require a privileged account. Platform defaults require a current, audited binding to existing authentication, administration, organization membership, and installation records. Application runtime permissions cannot create or alter these bindings.

The local installation metadata names `jay` through SOFIE_OWNER_ID but has no configured authenticated session or platform-administration record. This is not sufficient proof of platform ownership. Real-owner activation remains blocked until the current canonical source and isolated installation can be resolved. Synthetic qualification is labeled separately.

## Commands

Settings and Sofie call the same service with `requestId`, `expectedRevision`, `capabilityId`, and `operation`. Operations are `enable`, `disable`, `pause`, `revoke`, and `set_budget`. Budget amounts are integer USD micros and never create a reservation or spending grant.

Each owner has a monotonically increasing revision. A transaction locks the owner's state, checks the revision, records the command fingerprint, changes preferences, and appends an immutable audit event. Same-key retries return the original receipt. Same-key changed payloads and stale versions fail with conflict. A lost response can be retried with the original key. No failed or ambiguous request automatically generates a new key.

Disable records a disabled preference that qualified admission adapters must enforce. Existing routing and admission paths are not yet integrated, so this checkpoint does not claim that a saved preference fences their new Work. Existing authorized Work is preserved. Pause and revoke additionally create durable backend-control requests. Their status remains pending until a qualified canonical adapter acknowledges the exact operation. Neither the UI nor Sofie may claim that active writers have stopped while acknowledgement is missing. Enable cannot clear pending or revoked controls.

Read APIs return a bounded recent audit history and explicit unknown active-Work status until authoritative Work inventory is connected. Qualification, setup, entitlements, administrator policy, and runtime availability come from a server-owned evidence snapshot. Missing or expired evidence fails closed; owner commands cannot write evidence or Relay policy.

## Compatibility boundary

The registry/resolver is vendored byte-for-byte from MissionControl `04770b83844b036080e59c9e6ea8ebb565383534`, with a file hash manifest. It remains a portable shared package. No dependency branch is merged.

Backend adapters must independently read current owner revision and preference, current Relay restrictions, setup and qualification, and exact Work authority at admission. Policy checks and admission must share a fencing/transaction protocol. A read response is not a grant. The current checkpoint does not enable any production or existing external-alpha execution path.

## Compatibility v1 (not activated)

`GET /api/capability-control` returns the authenticated owner's registry version, preference revision, evidence freshness, capability dimensions, pending controls, budgets, and the latest 50 audit events. `POST` accepts the strict canonical command schema. The endpoint is owner-facing; a backend must not impersonate an owner or treat this response as a service credential. A dedicated authenticated backend read/admission contract is still required before adoption.

| Consumer | Required contract before qualification | Current disposition |
| --- | --- | --- |
| Relay administration | Export authenticated organization/agent restrictions with organization, installation, subject, monotonic policy revision, validity window, and source audit reference. Owner preferences cannot mutate this evidence. | No adapter or admin UI shipped. |
| MyEve routing | Consult current preferences before proposing new backend Work; map dependencies explicitly and preserve Native/MyFactory when MissionControl is disabled. | Existing routes are unchanged. Feature stays an isolated preference preview. |
| MissionControl | Independently check current owner preference, Relay restrictions, exact Mission/WorkOrder generation, approval, and budget reservation atomically at admission. | NOT_QUALIFIED; no active engineering branch merged. |
| MyFactory | Independently fence new Factory admission; bind policy revision to exact authorized Work and budget. Preserve existing authorized Work on disable. | NOT_QUALIFIED. |
| MySkills | Independently validate Skill trust/profile qualification, narrowed agent permissions, owner policy and Work scope. | NOT_QUALIFIED. |
| MyApps | Independently validate installation/runtime qualification and scope before install or execution. | NOT_QUALIFIED. |
| Pause/revoke adapters | Consume exact scoped outbox requests idempotently; record authoritative receipts for suspended execution or fenced writers/resources, preserving UNKNOWN financial exposure. Acknowledge only after canonical backend confirmation. | Requests remain PENDING_BACKEND; no acknowledgement endpoint is exposed. |

The eventual admission protocol must reject stale owner **and** Relay revisions. Owner preference revision alone does not fence a changed binding, revoked session, new administrator denial, or expired qualification. No current API response is suitable as an offline admission lease. The runtime deliberately returns `admissionEligible: false` until that protocol is implemented and qualified.

## Schema and operational boundary

`migration.sql` is an additive, standalone qualification schema, deliberately outside the production migration runner. It is never run on startup. Qualification creates a fresh PostgreSQL cluster and removes only its own temporary cluster at completion. No production database URL is used.

The application role requires only schema USAGE, SELECT, INSERT/UPDATE on owner_state, and INSERT on commands/audit/control_requests. It must have no superuser, role creation, RLS bypass, schema creation, or mutation rights on installations, platform bindings, and policy evidence. Audit and command update/delete are denied by triggers as well as role grants. Administrative schema owners remain a trusted operational boundary; these triggers are not tamper-proof against a database superuser. RLS scopes are set from the trusted authenticated principal, never client command fields.

The platform binding importer remains a gate: record IDs are references, not proof by themselves. An operator must validate the existing authenticated principal, administration role, organization membership, installation/environment, source revision/expiry, and audit record through canonical sources before importing a binding. No user account or real-owner binding is created by this checkpoint. The runtime cannot import bindings.

## Qualification

From the repository root:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm exec --workspace=eve-agent -- tsc --noEmit
npm test --workspace=@mission-control/capability-control
node --import tsx apps/eve/scripts/check-capability-registry.ts
node --import tsx apps/eve/scripts/check-executor-governance.ts
```

From `apps/eve`:

```sh
CAPABILITY_TEST_POSTGRES_BIN="$(pg_config --bindir)" node --import tsx scripts/qualify-capability-control.mjs --browser
```

The browser runner uses synthetic sessions, the actual Next API and Settings UI, a disposable PostgreSQL database, and a child-process environment allowlist that excludes production database/provider credentials. It refuses nonlocal browser requests and any agent-session POST. Tool handler checks invoke deterministic code directly, with no model calls. This is not the real-owner golden journey or a live conversational-model qualification. Screenshots are in `output/playwright/capability-control`; automated accessibility findings and test results are in `evidence`.
