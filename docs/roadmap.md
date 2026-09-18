# MyEve roadmap

This is the canonical product roadmap as of 2026-09-18. Completed work is recorded in `todos/`; the dated files under `docs/plans/` are historical implementation plans and are not the current backlog.

## Shipped foundation

- Production owner authentication, readiness, migrations, CI, and the Manage shell — work orders 001–002.
- Evidence-backed delegated Runs and Goal OS — work orders 003–004.
- Outcomes, Daily Brief, Weekly Review, and proactive review delivery — work orders 005–006.
- Persistent owner-created Agents and curated skill imports — work orders 007 and 011.
- Colleague-first Runs, Results, routines, bounded delegation, and supervised Computer work — work order 008.
- Reliable on-demand browser sessions, browser health, and production browser canary — work order 009.
- Production failure telemetry, cleanup, operator health, alerts, canaries, and incident procedures — work order 010.
- Guided first-use setup, read-only capability discovery, and five bounded starter jobs — work order 013.
- Agent-isolated persistent browser profiles, explicit sharing, owner authentication takeover, reconnect, and reset — work order 014.
- Unified Channels health, privacy-preserving Email/iMessage search, provider data boundaries, and delivery audit — work order 015.

## P1 — Make MyEve genuinely useful

### 1. Data ownership and recovery — active

- Work order 017: canonical ownership registry, provider-neutral backup contract, human-readable export, SHA-256 verification, deterministic completeness/portability status, file/reference inventory, safe connected-app metadata, retention visibility, and audit history.
- Work order 018: unified "What MyEve Knows" inspection, provenance, correction, and verified forgetting.
- Work order 019: dry-run planning followed by confirmed, dependency-aware restore into an empty deployment with post-restore verification.
- Work order 020: dependency-aware domain deletion, connector disconnect/revocation, verification, and receipts.

### 2. Phone production qualification — waiting on owner setup

- Complete live AgentPhone provisioning and a minimal billed test matrix before exposing Phone controls.
- Verify inbound/outbound text, iMessage, calls, verification inbox, webhook security, consent, opt-out, quiet hours, and failure recovery.
- Add spending limits and an emergency disable switch.
- Safety controls and the non-billed provider matrix are implemented in work order 016. The release gate remains closed until the owner adds AgentPhone credentials and designates a live test recipient.

## P2 — Strengthen differentiation

1. Knowledge and decision intelligence: broader source ingestion, claim conflicts, provenance, staleness, refresh, and stronger search.
2. Goal and review intelligence: conversation-to-Goal proposals, capacity-aware Focus, priority-change explanations, stalled dependency detection, and owner feedback tuning.
3. Routine operations: first-class provider/webhook triggers, notification policy, inactivity confirmation, replay protection, recovery, cost history, and templates from verified work.
4. Skill quality: continuous outcome evaluations, model-backed routing, individual review of deferred skills, and collision control.
5. Agent collaboration UX: contextual milestone/artifact replies, inspectable delegation, parent/child visualization, then roster organization and notification controls.

## P3 — Explicitly later

- Multi-owner tenancy and governed Relay grants. Do not start until the single-owner product demonstrates repeatable value.
- Cards, payments, and billing. Keep hosted card-data handling, idempotent authorization, reconciliation, incident controls, and product billing separate; this must not block V1.

## Sequencing rule

Finish and production-qualify each numbered P1 item before starting the next unless the Product Owner explicitly changes priority. Create one uniquely numbered work order per enhancement, update this roadmap when scope changes, and do not infer current status from unchecked boxes in historical plans.
