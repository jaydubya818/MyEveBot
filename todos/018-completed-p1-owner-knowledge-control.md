---
status: complete
priority: p1
issue_id: "018"
tags: [data-ownership, memory, knowledge, provenance]
dependencies: ["017"]
---

# What MyEve Knows

Build a unified owner-inspection view for Memory, Preferences, Facts, Observations, Commitments, and Decisions. Preserve semantic types, scopes, provenance, confidence, status, related Goals, and source links. Add explicit Correct and Forget actions with authorization checks, remote-memory verification, canonical Knowledge supersession, and audit receipts.

## Acceptance criteria

- [x] Manage → Data opens a calm, responsive What MyEve Knows experience with Backup & recovery retained as a separate view.
- [x] Bounded, paginated, server-filtered search projects canonical Memory and Knowledge without creating another source of truth.
- [x] Memory, Preference, Fact, Observation, Hypothesis, Decision, Commitment, and Insight retain canonical type and repository identity.
- [x] Owner authorization and Agent execution scope are applied before ranking.
- [x] Detail exposes best-available source, provenance, canonical scope, eligibility, recorded Run use, confidence, lifecycle state, and correction history without fabricating legacy provenance.
- [x] Needs review, contradictions, potentially stale, recently learned, and recently corrected queues use deterministic canonical signals.
- [x] Correction preserves Knowledge supersession and provenance; Memory correction uses replacement semantics with verified remote cleanup.
- [x] Forget requires explicit owner confirmation, removes Knowledge graph relationships safely, and does not report Memory success until remote absence is verified.
- [x] Mutations create secret-free audited receipts with completed, partially completed, or failed outcomes.
- [x] Read-only Agent tools support bounded search and inspection; destructive Agent Forget requires owner approval every time.
- [x] Existing export behavior excludes deleted active Memory and reflects corrected canonical state.
- [x] The V1 empty-deployment and future merge-restore interpretation is documented without implementing Restore.
- [x] Focused contracts cover projection, type preservation, scope-before-rank, pagination, provenance absence, supersession, remote verification, audit receipts, authentication, malformed identifiers, and explicit Forget confirmation.
