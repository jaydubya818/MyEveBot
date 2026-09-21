---
status: ready
priority: p1
issue_id: "029"
tags: [federation, consolidation, deployment]
dependencies: []
---
# Federation final consolidation

## Problem Statement
Publish qualified federation on current canonical authority, merge through normal reviewed PRs and prepare isolated owner E2E only. No architecture expansion or general enablement.

## Findings
Canonical Relay main: 7ea29b2886d2b8bad7b1a1ca1c3e8df1d39ee9ee (candidate merge base; no canonical-only commits). Canonical MyEve main: e9984e4962151bffca1f6eb48c544b60bb643aa7 (newer routine/product fixes). Exact missing ancestor 7852287e1c5f8eb14119d9e8accdf174d27eeb69 recovered from preserved myeve-federation-hosting checkout. 42 repositories checked; GitHub direct object lookup returned 404 before recovery. Missing object was local clone incompleteness, not evidence that history must be invented; transfer/deletion cause is not established.

## Proposed Solutions
Restore verified original ancestry and merge qualified changes onto current canonical. Semantic reconstruction is reserved for unrecoverable history; not needed after exact recovery.

## Recommended Action
Follow owner's 14-phase request. Keep actual external gates NOT_RUN. Merge only after local compatibility, remote checks and repository review complete; deploy only existing approved isolated resources.

## Acceptance Criteria
- [x] Restore/publish exact MyEve ancestry and verify parity.
- [ ] Compare both repositories and reconcile current canonical including migrations.
- [ ] Publish green consolidation candidates.
- [ ] Complete both repositories' regression and exact-SHA compatibility.
- [ ] Complete local three-party golden path and cleanup.
- [ ] Publish evidence, open normal PRs, complete review and remote checks.
- [ ] Merge under stated conditions and verify canonical parity and smoke.
- [ ] Deploy exact merged revisions only to existing isolated qualification infrastructure.
- [ ] Verify deployment smoke and deliver owner E2E UI instructions/URLs.
- [ ] Preserve disabled defaults and external gates NOT_RUN.

## Work Log
2026-09-21: Began from Relay c910c9d and readiness d579e91. Read explicit consolidation/merge/deploy authorization. Fetched canonical refs, found original missing object, created this isolated branch from current MyEve main. No canonical mutation or deployment yet.
