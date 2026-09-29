# Canonical integration handoff

**Current target: 52b3891a2685307cbb50bba97680070700df4cc0. MANUAL_ADOPTION_REQUIRED.**

The accepted Beta candidate now contains Q37/MyFactory consumer integration, Capsules, canonical Work/Inbox/Needs You/Result, Current Truth and reconciled migrations. Its exact remote ref was verified on 2026-09-29. Product Expansion stays independently owned and unchanged; no rebase or assembly has been performed.

Use the [complete comparison and adoption crosswalk](CONSOLIDATION-52b3891a.md) and [machine-readable 44-path manifest](../verification/product-beta-52b3891a/compatibility.json). These supersede the earlier handoff against frozen 7f86aca and observed 9ef5a95. Prior source/test receipts remain historical evidence.

- Consume only the product expansion delta after cdd7f2cd725eb2b58254a08328c7e34af79ade06; Beta already has the earlier UX.
- Whole-branch analysis finds 10 conflicts. Expansion-only analysis finds two textual conflicts: navigation and owner.css. Additional semantic adaptation is mandatory.
- Preserve Beta's IntegratedExperience and typed Work/Goal routing. Rebind legacy search/Inbox/review data; keep canonical Result/Proof/current truth and exact-action authority.
- Work Canvas remains an explicitly disconnected interaction candidate until bound by consolidation. Its sample reducer grants no execution or publication authority.
- No product API/backend/schema/migration/runner changes. Keep Beta's 64-file lineage and 0068 guarded published-main bridge.
- This product source still labels unbound Q37 capability WAITING_FOR_CANONICAL_Q37. That now means **not adopted into this source**, not that a durable Q37 candidate is missing. Update status copy only in the assembled canonical context.

Canonical Result, Proof of Work and Golden Journey remain **PARTIAL**. Live providers remain **NOT_RUN**. Existing UX fixtures were rerun, not added to change these statuses. Consolidation owns final assembly and its own qualification; this handoff requests no merge or deployment.
