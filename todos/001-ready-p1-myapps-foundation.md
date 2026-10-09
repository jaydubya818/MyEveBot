---
status: ready
priority: p1
issue_id: "001"
tags: [myapps, foundation]
dependencies: []
---

## Problem Statement

Implement the authorized deterministic, owner-isolated App foundation without
changing external alpha, production or paid execution.

## Findings

Canonical source and the active MySkills draft are recorded in docs/myapps/FOUNDATION.md.
MyEve owns runtime/registry; MyFactory owns building and independent verification.

## Proposed Solutions

A constrained declarative reference host avoids arbitrary-code execution and new
services. Arbitrary generated code would require a separate reviewed sandbox.

## Recommended Action

Complete checkpoints A–I in existing repositories, then propose a separate production integration envelope.

## Acceptance Criteria

- [x] A: recover canonical sources and implement initial contracts
- [x] B: App model, registry, immutable identity and isolation tests
- [x] C: typed runtime, shared state, policy and audit
- [x] D: browser UI, accessibility, visual and agent consistency
- [x] E: deterministic Factory builder and canonical Work compatibility
- [x] F: independent verifier and negative tests
- [x] G: private preview and truthful Result/Proof
- [x] H: qualified install/update/migration and operational controls
- [x] I: composed creation/use/update journey and repository decision
- [ ] Fresh clone, exact hosted CI, independent review and final evidence

## Work Log

2026-10-08: fresh canonical clones in isolated branches. Initial contracts, SQLite
reference registry, typed CRM and nine tests pass, including separate-connection
concurrency. Production and external alpha untouched. Skills remain read-only.
