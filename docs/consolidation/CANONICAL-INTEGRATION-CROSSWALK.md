# Canonical integration crosswalk

Candidate source checkpoint `b14988add08886cd8e2f8ae128b508ac11b509c8`. This is a Stage 1 crosswalk, not a completed canonical release.

| Capability | Source | Destination | Migration impact | Integration method | Disposition |
|---|---|---|---|---|---|
| Work / Digital Worker / Gate B-C / routing / Current Truth / custody / protected verification | 7bbf296 → cf83e3b | apps/eve/lib/engineering; agent/tools/engineering_* | 0001–0057 | Selective dependency closure in 9ef5a95 + Q37 test/evidence cherry-picks | ADOPTED; final combined qualification pending |
| Total Recall / Knowledge / Memory correction / governed learning | b5b3179 → 9ef5a95 | apps/eve/lib/total-recall; agent/lib/memory-store | 0063 product plane | Canonical scoped adapters | ADOPTED; no uncontrolled feedback-to-behavior promotion |
| Goal OS / proactive Work | 838af27 → 9ef5a95 | apps/eve/lib/goal-os; lib/beta-integration | 0063–0066 | Canonical Work/Result composition | ADOPTED; false Task/Goal completion remains prohibited |
| Universal Inbox / Needs You / continuation | cf19943 → 9ef5a95 | apps/eve/lib/universal-inbox; lib/beta-integration | 0063–0066 | Owner and generation-bound response composition | ADOPTED |
| Beta product experience / Today / Proof of Work | 105aeb7 → 9ef5a95 | apps/eve/components/owner; app/api/beta | 0063–0066 | Integrated owner UI | ADOPTED; final product expansion still actively owned |
| Personal-memory Capsules | 3331721 → 9ef5a95 | apps/eve/lib/capsules; app/api/capsules | 0067 | Reviewed canonical-memory adapter | ADOPTED; Skills/Roles/Packs/scoped learning activation DEFERRED_POST_ALPHA |
| Approval Center / Computer / Files / specialists / Apps / product navigation | origin/main + Product Expansion | apps/eve/components; apps/eve/app | Main lineage | Existing capability APIs; consume exact final product handoff | WAITING_ACTIVE_HANDOFF |
| Relay identity/grants/revocation and optional hosted Factory routing | d64f2f9 | apps/eve/lib/relay; agent/lib/myfactory; agent/lib/foreman | Published 0039/0040; candidate relocated equivalents | Canonical main preserved; authority-label fix 28f5b5e adopted | ADOPTED; safe main upgrade BLOCKED pending Beta bridge |
| Q37 missing historical regressions | 7bbf296; cf83e3b | apps/eve/test; chat-turn-failure; Telegram receipts | 0049 and existing schema | 22 missing fixtures restored for discrepancy review | PARTIAL: 136 root pass / 2 module-import failures; do not claim regression closure |
| Managed multi-tenant provisioning / Telegram live-local campaign / upstream templates | Retained source branches | See branch-dispositions.json | Separate historical lineages | Keep source and qualification evidence; do not import wholesale | DEFERRED_POST_ALPHA or REJECTED_EXPERIMENTAL; no deletion |
