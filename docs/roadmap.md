# MyEve product roadmap

This is the canonical roadmap. Historical plans explain decisions but do not represent current delivery status.

## P0 — production confidence

- **Browser reliability — in delivery.** Browser work starts an isolated session on demand, distinguishes browser surfaces and failure states, and exposes health in System status.
- **Production operations — in delivery.** Owner-scoped signals, product canaries, scheduled Computer cleanup, alerts, and an incident/rollback runbook.
- **Roadmap reconciliation — complete.** Historical work orders 003 and 004 are superseded by the production qualification in 008; duplicate IDs are repaired.

## P1 — useful every week

- **First-use activation — next.** Guided setup, read-only opportunity discovery, five starter jobs, and a Try once → Run again / Save as skill / Make routine loop.
- **Persistent authenticated web work — planned.** Credential vault, per-Agent profiles, owner takeover, revocation, expiry, and recovery. Current isolated sessions intentionally retain no login profile.
- **Communications consolidation — planned.** One Channels surface with search, attachments, delivery state, approval, retention, and recovery.
- **Phone production qualification — planned.** Keep controls hidden until minimally billed live validation, webhook security, consent, limits, and an emergency disable switch pass.
- **Data ownership and recovery — planned.** Export, restore verification, retention, deletion, and storage visibility.

## P2 — differentiation after the core loop is reliable

- Knowledge and decision intelligence.
- Goal and review intelligence.
- Routine operations and provider-event triggers.
- Continuous skill-quality evaluation.
- Agent collaboration UX with inspectable delegation.

## P3 — explicitly later

- Multi-owner tenancy and governed Relay grants.
- Cards, payments, and billing.

The next product milestone after P0 is **First-use activation**. Persistent authenticated profiles follow only after the ephemeral browser path is reliable in production.
