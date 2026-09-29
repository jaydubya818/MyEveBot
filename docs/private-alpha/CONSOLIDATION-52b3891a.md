# Product Expansion → accepted Beta consolidation

**Qualified product source; MANUAL_ADOPTION_REQUIRED. No combined application is assembled or qualified by this handoff.**

- Product source: `9caacf60c6affae48f3cdaadfd3ecd7ca50dd0c2` on `codex/private-alpha-product-expansion` (Work Canvas code checkpoint e92ca110; documentation-only descendants).
- Accepted integration target: `52b3891a2685307cbb50bba97680070700df4cc0`, exact `origin/codex/myeve-beta-integration` verified remotely on 2026-09-29.
- Common baseline: d64f2f96003818b2f51341b54a2edd6f426a0dae. Product reused Beta UX under cdd7f2cd725eb2b58254a08328c7e34af79ade06. Beta already contains that UX through its own source history.
- Consume **expansion changes after cdd7f2c**, not the initial four replayed Beta UX commits. Do not copy product files over canonical versions wholesale.

The product branch was neither rebased nor rewritten. Beta and main were not merged or modified. `git merge-tree` was used only to inspect synthetic trees; no generated merge tree is a release candidate.

## Conflict analysis

A normal whole-branch three-way analysis from the shared durable baseline reports **10 add/add conflicts**:

1. apps/eve/app/apps/page.tsx
2. apps/eve/app/work/page.tsx
3. apps/eve/components/owner/decisions.tsx
4. apps/eve/components/owner/experience.tsx
5. apps/eve/components/owner/navigation.tsx
6. apps/eve/components/owner/owner.css
7. docs/digital-worker-ux.md
8. docs/verification/beta-product-experience/AUDIT.md
9. docs/verification/beta-product-experience/README.md
10. docs/verification/beta-product-experience/integration-preparation.md

Treating cdd7f2c as the already-consumed UX base leaves **two textual conflicts in the expansion-only delta**: owner/navigation.tsx and owner/owner.css. The synthetic delta analysis preserves Beta's IntegratedExperience wrapper and typed Work route. Textual cleanliness does not resolve the semantic conflicts below. Raw results are retained in the comparison dossier.

## Canonical ownership and semantic overlaps

| Surface | Preserve from Beta | Product treatment |
| --- | --- | --- |
| Work / Today / Needs You / Results | OwnerExperience → IntegratedExperience; `/work?kind=goal|work&id=…`; canonical Goal/Work/Result providers | Never replace owner/experience.tsx or Work route with the product snapshot. The product human-only filter can be ported only to the preview implementation or equivalent canonical attention filter. |
| Inbox | Universal Inbox, owner scope, correlation/episode/source sequence, exact action binding, response receipt and explicit continuation | Reuse InboxHub styling; replace its legacy email/channel data as the primary feed with `/api/beta/inbox`. Channel diagnostics remain auxiliary. No second Inbox/response ledger. |
| Search | Canonical Goal and Work identities; immutable Result plus outcome/source/verification_mode | Reuse cancellation, source-error and list UX. Current legacy Goal/Outcome search links are not canonical identities. Bind `/api/beta/goals`, `/api/beta/work` and `/api/beta/results`; retain artifact/agent/knowledge/thread sources. |
| Approval Center | Existing approvals service plus Universal Inbox's canonical action response/delivery | GET/PATCH and ApprovalRequestView match exactly. Center is a view of that authority, not a new ledger. Resolve a trusted typed Work/Goal link; never pass a legacy taskId as Work. |
| Four engineering choices | Exact canonical proposal and publication authority, Work version/generation/candidate binding | The current binary approval endpoint is not a four-action publication endpoint. Open PR, branch-only, private and changes need distinct bound intent; confirmation must revalidate on server. Keep sample choices disconnected until that binding exists. |
| Work Canvas / Proof | EngineeringWorkerProjection, CurrentWorkTruth/currentTruthLines, retained native Result and canonical ProofOfWork | Adopt layout only after binding. Sample reducer, sample verified Result and synthetic proof stay isolated. Display subset is shape-compatible but omits current truth fields and is not an authoritative complete projection. |
| Weekly review | Canonical dated Goal/Work/Result brief | Reuse presentation with a weekly interval. Do not treat legacy TaskRun review entries as canonical completion. |
| Team | Persisted roster and per-Work qualification/routing/current truth | Keep roster; replace blanket waiting copy in consolidated app with actual canonical status. A configured specialist grants no dispatch. |
| Capsules / Memory / Learning | Accepted Capsule route and governed lifecycle | Add navigation links to `/capsules`, `/memory`, `/learning`. Update portable-experience copy when assembled; do not overwrite canonical lifecycle with the old product boundary. |
| Navigation / shared CSS | AGENT_NAME, canonical destinations, owner-form/select/label and evidence-wrapping behavior | Compose deliberately. Scope new product grids and forms so canonical controls retain layout, contrast and mobile behavior. One ⌘K listener per surface. |
| Computer / Files / Apps | Existing API/session/artifact/connection semantics | Adopt independent UI and accessible labels. Preserve canonical chat selected-Work context. Prompt prefilling is compatible with Beta's existing initialPrompt and does not send automatically. |

The authority audit found **zero new or modified API routes, backend modules, executor inventory, migrations or package manifests** in Product Expansion relative to the durable common baseline. No Q37/MyFactory backend has been copied. However, competing legacy presentations would be exposed by wholesale adoption; the manifest explicitly excludes/rebinds them. Therefore this is not an unconditional “no conflicts/no competing implementation” claim.

## Exact source adoption inventory

Every one of the 44 changed app/test paths after cdd7f2c is classified, with its immutable source blob, in [compatibility.json](../verification/product-beta-52b3891a/compatibility.json). Decisions distinguish ADOPT_PRODUCT_UI, ADOPT_EXISTING_AUTHORITY_VIEW, MANUAL_COMPOSITION, ADAPT_CANONICAL_DATA/IDENTITY/STATUS, PRESERVE_BETA and KEEP_DISCONNECTED_PREVIEW/PRODUCT_TESTS_ONLY.

Independent adoption includes Files/detail mounts, Computer accessibility, shared read-only resource handling, exact knowledge records, Apps presentation, private/shared explanatory UI, and prompt-prefill routing. All depend on the reconciled navigation/design shell; compile and browser qualification must run after assembly. Keep evidence histories under separate directories; preserve Beta's historical reports rather than resolving report conflicts by pretending the two runs are one.

## Migration impact

**Product migration impact: NONE.** Product Expansion allocates no migration identifiers and changes no schema runner or ledger. Retain Beta's complete 64-file chain: 0001–0057, 0062–0068. Reserved 0058–0061 stay untouched. Beta owns `0068_published_main_lineage_bridge.sql` and its exact published-main lineage checks. Do not restore the older product checkout's migration directory or runner. Canonical migration blobs are recorded in compatibility.json; no migration was run by this comparison. Shared schema proposals remain proposals and are not required for the independent presentation adoption.

## Qualification and release truth

Existing source qualification was rerun without adding fixtures: 22 owner UX tests, 14 product browser scenarios, 18 Canvas browser scenarios, and 136 light/dark desktop/390px accessibility scans with zero violations. Historical captures were restored unchanged; the rerun is retained separately. These exercise Product Expansion at its own source, not a combined Beta/Product build.

The accepted Beta dossier remains the source for canonical local integration evidence. **Canonical Result: PARTIAL. Proof of Work: PARTIAL. Golden Journey: PARTIAL. Live Sofie/MyFactory/providers: NOT_RUN.** Sample Results, zero fixture writes and passing accessibility cannot upgrade those statuses. No new fixture was introduced to change acceptance.

Consolidation still owns: resolve the two textual conflicts and semantic items; bind trusted canonical identities/data; compile/typecheck/governance on the assembled tree; rerun canonical Work/Inbox/approval/continuation/Result and Capsule/learning checks; repeat desktop/390px light/dark/browser/fault-state checks on that assembly; preserve migration checksums and 0068 behavior. Only then produce its own durable RC. Nothing here authorizes a main merge, deployment or live-provider call.
