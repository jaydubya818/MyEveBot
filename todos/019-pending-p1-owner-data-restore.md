---
status: pending
priority: p1
issue_id: "019"
tags: [data-ownership, restore, recovery]
dependencies: ["017", "018"]
---

# Verified owner-data restore

Implement the validate → dry-run plan → confirm → apply → verify workflow for an empty deployment. The plan must report compatibility, domain counts, dependency order, conflicts, reconnections, warnings, and records that remain disabled without mutating state. Enforce archive limits and schemas, explicit idempotency and source-to-target mappings, authenticated target-owner reassignment, capability reconciliation, disabled restored schedules and webhooks, transactional database writes, provider-aware memory recreation, durable restore history, and post-restore verification through product APIs. Prepare but do not enable merge restore.

The required archive interpretation, deletion-resurrection guard, and verification invariants are defined in `docs/owner-data-restore-contract.md`.
