# MyEve roadmap

This is the canonical product roadmap as of 2026-09-17. Completed work is recorded in `todos/`; the dated files under `docs/plans/` are historical implementation plans and are not the current backlog.

## Shipped foundation

- Production owner authentication, readiness, migrations, CI, and the Manage shell — work orders 001–002.
- Evidence-backed delegated Runs and Goal OS — work orders 003–004.
- Outcomes, Daily Brief, Weekly Review, and proactive review delivery — work orders 005–006.
- Persistent owner-created Agents and curated skill imports — work orders 007 and 011.
- Colleague-first Runs, Results, routines, bounded delegation, and supervised Computer work — work order 008.
- Reliable on-demand browser sessions, browser health, and production browser canary — work order 009.
- Production failure telemetry, cleanup, operator health, alerts, canaries, and incident procedures — work order 010.
- Guided first-use setup, read-only capability discovery, and five bounded starter jobs — work order 013.

## P1 — Make MyEve genuinely useful

### 1. Persistent authenticated web work — next

- Add a secure credential-vault integration and approved persistent browser profiles.
- Separate profiles by Agent by default; sharing must be explicit and revocable.
- Support owner takeover for login, MFA, CAPTCHA, and sensitive forms.
- Handle expiry, reset, reconnect, and credential failure without exposing secrets.

### 2. Communications consolidation

- Create one Channels surface for Email, Slack, iMessage, push, and later Phone.
- Unify message/thread search, attachments, delivery state, approval, audit, retention, deletion, and redaction.
- Add provider-event idempotency and retry handling.

### 3. Phone production qualification

- Complete live AgentPhone provisioning and a minimal billed test matrix before exposing Phone controls.
- Verify inbound/outbound text, iMessage, calls, verification inbox, webhook security, consent, opt-out, quiet hours, and failure recovery.
- Add spending limits and an emergency disable switch.

### 4. Data ownership and recovery

- Export Goals, Knowledge, memories, conversations, Results, routines, and Agents.
- Verify backup/restore, define retention by data class, show storage usage, and add an audited deployment/account deletion flow.

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
