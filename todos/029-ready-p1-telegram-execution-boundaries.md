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
- [ ] Durable fail-closed model budget: concurrency, retry, cancellation, approval, restart.
- [ ] Exact authority and private-context denial matrix.
- [ ] Actual installed Eve runtime and interruption qualification.
- [ ] Inspect authorized Telegram/deployment prerequisites without secret disclosure.
- [ ] Deploy only clean, exact qualified revisions if readiness passes.
- [ ] Run authorized actual Telegram matrix or identify exact owner-only blocker.
- [ ] Complete affected regressions, record separate evidence classes, push feature commits; no merge/tag.

## Work Log
2026-09-20: Published Relay 29c8a3c and MyEve 64c40fe; exact remote parity. Local model/Telegram prerequisites inspected by key presence only. Began provider-boundary and context-isolation work.

2026-09-20: Added 0031 durable reservations, guarded model provider, canonical external Context Assembly, bounded tools and exact budget approval binding. Automated MyEve 624 PASS. Actual Eve and hosted/live phases remain unqualified; narrow model-authentication approval is pending after automatic review rejected broad environment export.

2026-09-20: Scoped model-authentication approval received. Canonical Sonnet 5 / Gateway identified; exact approved key ID/reference still needed without bulk environment access. Fixed missing aggregate allowance with migration 0032: durable $5 ledger, conservative backfill, atomic admission and no uncertain-work refund. MyEve 630 PASS, budget PostgreSQL subset 19 PASS, typecheck/build/migrations/governance PASS. Actual-provider/runtime qualification remains pending; no paid calls or broad enablement.
