---
status: ready
priority: p1
issue_id: "029"
tags: [telegram, authority, budget, qualification]
dependencies: []
---
# Telegram execution boundaries and live qualification

## Problem Statement
The published component path lacks hard pre-call budget reservation and actual Eve runtime/private-context qualification. Execution must remain unavailable until qualified.

## Findings
Eve 0.27.13 session quotas are post-call. Dynamic model failures fall back. Normal owner Context Assembly includes private memories and saved skills; an external public-research request must not inherit them.

## Proposed Solutions
Use canonical Run budgets with durable call reservations and a provider-boundary adapter, plus explicit external-context/tool scope. Reusing advisory session quotas is insufficient.

## Recommended Action
Preserve normal owner behavior. Bind external work to the existing Run, enforce conservative reservation before every provider call, deny unknown outcomes and preserve evidence. Qualify installed Eve before any hosted/live enablement.

## Acceptance Criteria
- [x] Publish approved Relay/MyEve checkpoints; verify parity and hygiene.
- [x] Durable fail-closed model budget: concurrency, retry, cancellation, approval, restart.
- [x] Exact authority and private-context denial matrix.
- [x] Actual installed Eve runtime and interruption qualification.
- [x] Inspect authorized Telegram/deployment prerequisites without secret disclosure.
- [ ] Deploy only clean, exact qualified revisions if readiness passes.
- [ ] Run authorized actual Telegram matrix or identify exact owner-only blocker.
- [ ] Complete affected regressions, record separate evidence classes, push feature commits; no merge/tag.

## Work Log
2026-09-20: Published Relay 29c8a3c and MyEve 64c40fe; exact remote parity. Local model/Telegram prerequisites inspected by key presence only. Began provider-boundary and context-isolation work.

2026-09-20: Added 0031 durable reservations, guarded model provider, canonical external Context Assembly, bounded tools and exact budget approval binding. Automated MyEve 624 PASS. Actual Eve and hosted/live phases remain unqualified; narrow model-authentication approval is pending after automatic review rejected broad environment export.

2026-09-20: Scoped model-authentication approval received. Canonical Sonnet 5 / Gateway identified; exact approved key ID/reference still needed without bulk environment access. Fixed missing aggregate allowance with migration 0032: durable $5 ledger, conservative backfill, atomic admission and no uncertain-work refund. MyEve 630 PASS, budget PostgreSQL subset 19 PASS, typecheck/build/migrations/governance PASS. Actual-provider/runtime qualification remains pending; no paid calls or broad enablement.

2026-09-21 UTC: Corrected static-key assumption: installed canonical OIDC refresh works for the exact project. Actual Eve/Sonnet public research and seeded private-canary boundary PASS; real cancellation retains uncertain liability; Eve/PG restart and replay add no call; insufficient local allowance prevents invocation. Fixed explicit session-state reconciliation, dynamic-tool collision, reasoning output handling and an expired-date test. MyEve 643 PASS; Relay 246 PASS/5 skipped; builds/typechecks/performance/lint and closed release probe PASS. Actual paid accounting $0.009480 plus $0.031241 retained uncertainty. Dedicated Telegram/live/hosted qualification remains pending.

2026-09-24: Integrated current main in isolated feature checkouts, preserving canonical migrations and authority. Eve 0.66.3 API/session changes adapted. Fixed completed callback replay and durable approval active-time pause/resume. Local MyEve 1060 PASS/1 skipped and Relay 398 PASS/5 skipped; builds, typechecks, governance and performance PASS. Actual 0.66.3 provider requalification is pending recovery of the preserved campaign database (startup timeout; never reset allowance). Dedicated bot reference and all-branches scope clarification remain pending. No merge into main or deployment.

2026-09-25 UTC: Recovered and preserved the original campaign ledger outside cloud-synced Documents; no allowance reset. Actual Eve 0.66.3/Sonnet 5 research/canary, restart replay, cancellation/replay, insufficient budget and canonical cleanup PASS. Fixed model context metadata and Eve-owned dynamic tool collisions. MyEve 1063 PASS/1 skipped, Relay 398 PASS/5 skipped, build and governance green. Liability $0.078533/$5. Dedicated bot and hosted/live matrix remain pending; execution gates closed, no merge into main.
