---
status: complete
priority: p0
issue_id: "012"
tags: [roadmap, work-orders, planning, reconciliation]
dependencies: ["010"]
---

# Reconcile the roadmap and historical work orders

## Problem Statement

Completed production work was still represented as unfinished in older work orders and dated plans. Duplicate issue IDs and multiple apparent roadmaps made current status ambiguous to the owner and to Sofie.

## Acceptance Criteria

- [x] Work orders 003 and 004 are closed using the later production evidence from work order 008.
- [x] The duplicate 007 identifier is resolved without rewriting the historical work content.
- [x] Shipped colleague-first plan items are checked only where later work orders provide evidence.
- [x] Historical plans point to one canonical roadmap.
- [x] The canonical roadmap separates shipped foundations, current P1 sequence, P2 differentiation, and explicitly later P3 work.
- [x] README points contributors and Sofie to the canonical roadmap.
- [x] Todo identifiers and statuses validate with no duplicates or stale ready work orders.

## Work Log

### 2026-09-17 - Completed

**By:** Codex

**Actions:**

- Closed the two historical Preview-only gates after confirming work order 008's later production qualification covered their release criteria.
- Renumbered the curated-skills history from 007 to 011; persistent user-created Agents retains 007.
- Reconciled dated plan checkboxes conservatively and kept composite items open when any named behavior remains unshipped.
- Added `docs/roadmap.md` as the single current roadmap and linked it from README and both historical plans.

**Learnings:**

- A completed implementation plan is not a reliable backlog unless later work orders write their evidence back into it.
- Composite checklist items must remain open when only part of the sentence shipped; otherwise roadmap cleanup becomes another source of false confidence.
