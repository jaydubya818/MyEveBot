---
status: pending
priority: p1
issue_id: "017"
tags: [data-ownership, export, recovery, memory, trust]
dependencies: ["016"]
---

# Owner Data Center — Inventory, Export, Backup, and Audit

## Problem Statement

MyEve holds the owner's goals, conversations, memories, knowledge, agents, runs, results, and routines, but the owner cannot yet take a portable backup or verify that a backup is intact. Memory is visible only as unstructured text, which makes it hard to understand why MyEve knows something or where that memory applies.

## Decision

Ship an explicit, owner-scoped export rather than a database dump. The archive contains only documented portable records; credentials, session tokens, webhook secrets, provider identifiers, and internal storage keys are excluded. Add local archive verification before enabling any data-changing restore behavior.

This work order establishes the canonical registry, dual-format archive, integrity verification, and audit ledger. Work orders 018–020 build correction, restore, deletion, and connector revocation on that foundation.

## Acceptance Criteria

- [ ] The owner can download one ZIP containing conversations, Goals, Knowledge, memories, Agents, Runs, Results, routines, and review settings.
- [ ] The export uses an explicit allowlist and excludes credentials, tokens, webhook secrets, internal provider identifiers, and storage keys.
- [ ] Every exported file has a SHA-256 digest in a versioned manifest.
- [ ] The owner can validate an archive locally through the UI without changing stored data.
- [ ] The Data Center reports record counts, approximate portable size, retention behavior, and excluded sensitive data.
- [ ] Memory shows scope, source, confidence, and confirmation metadata alongside existing forget controls.
- [ ] The archive includes both human-readable Markdown and canonical machine-readable JSON.
- [ ] Export and verification operations produce secret-free audit receipts.
- [ ] Authentication, owner scoping, archive integrity, error, loading, empty, and success states are tested.
- [ ] Tests, typecheck, production build, and browser qualification pass.
- [ ] The canonical roadmap records the completed scope and ordered follow-on work.

## Post-Deploy Monitoring & Validation

- Search logs for `Owner data export failed`, `Owner data inventory failed`, and `Owner archive validation failed`.
- Healthy: authenticated exports complete, manifests validate, and no excluded field names appear in archive entries.
- Failure/rollback trigger: repeated export 5xx responses, unexpectedly large archives, checksum failures, or any secret-bearing field in an archive. Disable the Data Center route and revert the enhancement immediately if sensitive data is exposed.
- Validation window: 72 hours after deployment. Owner: technical owner.
