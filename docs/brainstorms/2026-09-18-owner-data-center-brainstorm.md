---
date: 2026-09-18
topic: owner-data-center
---

# Owner Data Center

## What We're Building

A calm management surface where the authenticated owner can inspect the categories MyEve stores, download a portable integrity-checked archive, validate that archive without changing data, and understand the source and scope of saved memories.

## Why This Approach

An explicit portable archive closes the immediate trust gap without coupling recovery to the live database schema. A raw database dump would expose operational secrets and make future restores brittle. A validation-first recovery step is reversible and establishes evidence before an empty-deployment restore. Merge remains deferred.

## Key Decisions

- Export user meaning, not infrastructure: allowlist portable fields and omit credentials, tokens, secrets, provider IDs, and storage keys.
- Use a versioned ZIP with per-file SHA-256 digests so corruption and tampering are visible.
- Sequence the subsystem as independently reviewable export, knowledge-control, empty-restore, and deletion enhancements.
- Extend the existing Memory surface rather than create a second source of truth.

## Open Questions

- Should a later restore merge non-conflicting records or replace the current owner workspace after a safety backup?
- Should audited account deletion remove external-provider data immediately or use a short recovery window?

## Next Steps

Implement work order 017, exercise the archive against realistic data, and use the evidence to specify transactional restore.
