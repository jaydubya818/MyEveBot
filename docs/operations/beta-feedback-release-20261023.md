# Beta feedback release — 2026-10-23

Status: qualified source change; **not deployed**. Branch: `codex/beta-feedback-20261023`, based on actual serving source `5895b129b61c22b1bd276c8ddcdedfd0048228da` (PR #99 lineage). Do not substitute `main` or another QA branch for this release: preserve the deployed password-management and chat-only accounting contracts.

## Changes

- Mandatory per-turn alpha instructions explicitly refuse bookings, purchases, card charges, sending email, live browsing and disabled tools before offering planning/drafting help. Existing backend denials remain authoritative. Simple answers default to one short paragraph or three short bullets; latest relevant style preferences remain in provider context. No new memory service or claim of cross-conversation preference storage.
- Today uses its existing canonical WorkInbox and no longer makes the unused legacy Work-list request that produced the misleading warning. Genuine WorkInbox failures stay visible and retryable.
- The chat usage panel shows owner-wide remaining daily turns, daily and trial permanently reserved budgets, separately recorded settled model usage, UTC reset, original effective expiry and paused/ended state. All threads share the same owner meter. Expanded details scroll within a bounded panel on mobile.
- The unexplained primary Agent chip is hidden inside external-alpha installations. Conversation records and agent bindings are unchanged.

## Accounting and owner isolation

A turn permanently reserves $0.10, even after failure or lower actual model cost. Never compute remaining allowance by subtracting measured cost. The owner's caps are 10 turns/$1 per UTC day and $5 over the original 120-hour trial; cohort caps remain $2/day and $10/trial. Paid Work/Factory remain disabled.

`status` in `external_alpha_cohort_call` authenticates the existing exact cohort/owner/slot/policy/credential membership. It runs before row locks or mutation branches and returns only owner totals, static limits, remaining quota and coarse availability. It includes central reservations absent from the local database after a lost acknowledgment. It exposes no other tester's usage, identifiers, credentials or policy contents. Measured local usage is separately owner/policy/CHAT/SOFIE scoped and includes only SETTLED operations; incomplete/unsettled usage is labeled. Local revocation, inactivity and earlier expiry narrow the displayed cohort state.

The authenticated GET `/api/chat-usage` accepts no caller-selected owner or mutation mode, sends private/no-store with Vary: Cookie, and never reserves, binds, dispatches, settles or reconciles. An unavailable/old central function produces an explicit unavailable meter, never fabricated zero usage. Quota is observational; the existing backend checks current authority on every send.

## Qualification

Reproduction uses the old Today React source from the exact serving commit: a failed unused `/api/beta/work` read produces the reported connection warning while `/api/work-inbox` succeeds. The same injected failure on the candidate produces no false warning; a genuine inbox failure remains visible/retryable. Missing prompt limits, missing owner budget display, and the primary chip condition are recorded from that serving source; the supplied tester transcript is the behavioral reproduction evidence for verbosity and booking claims.

Commands (from `apps/eve` unless noted):

```sh
MYEVE_EXTERNAL_ALPHA_TEST_DATABASE=postgres://auth_test@127.0.0.1:55482/postgres npx vitest run lib/external-alpha/chat-only-postgres.test.ts lib/external-alpha/context.test.ts lib/external-alpha/usage-route.test.ts components/owner/beta-chat-usage.test.tsx lib/external-alpha/features.test.ts lib/external-alpha/model.test.ts lib/external-alpha/tool-authority.test.ts lib/external-alpha/paid-paths.test.ts agent/instructions/persistent-agent.test.ts
node test/browser/beta-chat-reproduction.mjs /absolute/evidence/reproduction
node --import tsx test/browser/beta-chat-feedback.mjs /absolute/evidence/browser
npm run typecheck
```

The integration fixtures create and drop only randomly named localhost databases, with a guard rejecting remote URLs. Browser tests run the actual production Next build with real signed fixture owners and synthetic resource responses, including same-browser owner switching, failure/retry, preserved unsent draft, exhaustion, mobile expanded details and accessibility. No live provider or tester turns are consumed. Provider-boundary regressions prove current system instructions and latest preference history reach the provider with disabled tool schemas removed. They **do not prove generated live-model compliance**; refusal wording and concise follow-ups require a bounded post-release smoke within existing tester quota. No automatic retries or extra budget are authorized.

## Future rollout prerequisite — not performed by this change

1. Obtain the owner's production-release instruction. Read current serving deployments and original owner/session/activation facts; preserve the exact existing environment, domains, project settings and identities.
2. Independently verify the central function still matches the deployed PR #99 chat-only function. Retain its definition privately for rollback. Apply **only** the reviewed CREATE OR REPLACE FUNCTION from `lib/external-alpha/shared-accounting-chat-only.sql` to the existing accounting database, transactionally. Existing role/EXECUTE privileges remain; no new table, grant, enrollment, activation, refund or data update is needed. All mutation branches are unchanged.
3. With each existing restricted tester identity, read `status` in a read-only transaction and verify owner totals/expiry, no new admissions/dispatches, and no foreign details. Do not call reserve/assert/dispatch as a health check.
4. Deploy this exact qualified source through the existing Vercel CLI workflow, from the matching monorepo root, first one tester then the other after checks. Never use a stale prebuilt output. The branch's Git deployment flag is false; a push must not deploy.
5. Verify health, existing owner authentication and retained conversation/history, meter versus central reservations/local settled usage, and Today/Work parity. Use at most a bounded real-model refusal/conciseness smoke if the owner has quota remaining; otherwise wait for UTC reset. Do not reset, extend, re-enroll or replenish the trial.

Rollback anchors currently serving this source:

- Tester 1: `dpl_2wdFaM1iW2aA3h5TTFkQ86UZrXTy`.
- Tester 2: `dpl_5tHNcxjB7Y9Ny6i3pQ6ffJhbWeQf`.

Rollback to the retained application deployment without changing passwords, identities, conversations, policy digests, activation/expiry or ledger rows. The added observational status path is backward compatible and can remain. If reverting that function separately, restore only the retained function body; never undo accounting history. The new UI handles a missing status path as unavailable.
