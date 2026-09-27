# Capsule integration-preparation qualification

Supersedes the parent dossier's integration-readiness classification at `bf7a45158dc14f7d38d14ad35ae84218b4866c0c`. The accepted core is preserved; old evidence remains historical. No live design partner or canonical activation is claimed.

CAPSULE CORE: LOCALLY QUALIFIED

SECOND-EVE BENEFIT: PASS — deterministic fixtures

CANONICAL MEMORY EXPORT POLICY: INTEGRATION PENDING

CANONICAL ACTIVATION: INTEGRATION PENDING

LIVE DESIGN-PARTNER CAPSULE: NOT_RUN

Overall: **READY_FOR_INTEGRATION**. This means the locally qualified core and the integration contracts are ready for their canonical owners. It does not mean live readiness or that all accessibility testing is complete.

## Results

| Requirement | Result and evidence |
|---|---|
| Core | PASS; existing 102 tests retained, expanded to 170 passing tests and one explicit canonical-driver skip. |
| Portability-policy contract | PASS; exact item/context-bound policy port with owner selection, classification, truth and scope guards. Production policy remains unavailable/denied. |
| Total Recall crosswalk | PASS against draft v1; actual pure `portableMemoryRecord` invoked on synthetic OWNER/WORK records and consumed by the adapter. See `total-recall-compatibility.json`. Source draft is not a released contract. |
| Atomic activation contract | PASS — fixtures only; all-or-none batch/receipt, CAS, idempotent retry, rollback refusal after later changes; ten real SIGKILL checkpoints plus nine existing core checkpoints. |
| Current Truth | PASS; current/current, history/current, superseded, multiple corrections, differing provenance, scope narrowing and stale review covered. No silent overwrite. |
| Learning portability | PARTIAL; representation/version/scope/evidence guards qualified. Canonical scoped learning cannot be serialized losslessly by 1.1; export stays blocked pending integration/wire revision. |
| Skill staging/qualification boundary | PASS; manifest binding, version conflict, duplicate, unsupported major, inert staging, exact destination qualifier and revocation-between-preview-and-activation covered. |
| Role/Pack staging boundary | PASS; equivalent controls; zero credentials, repository grants, provider or writer authority. |
| Authority scrubber | PASS for bounded adversarial corpus; nested plural credentials/session/grant fields, Skill/procedure secrets, encoded payloads, Work/approval/publication/billing configuration rejected. |
| Malicious Capsule suite | PASS; rehashed malicious payloads, overrides/hidden instructions, nested Capsules, manifest confusion, substituted digest, MIME, reference traversal, size/depth and binary/archive material. No archive decompression or source-reference following exists. |
| Scenario 1 | PASS; required retrieved context **0/3 → 3/3**, clarification inputs **3 → 0**, after reopen. |
| Scenario 2 | PASS; project-review context **0/3 → 3/3**, clarification inputs **3 → 0**, fixed setup checklist **4 → 1**, after reopen. Project convention absent outside its project. |
| Minimization | Three selected/exported items, six excluded, **2,341 bytes**, zero items redundant to the declared scenario-2 task. Not an account backup. |
| Security transfer counters | Credentials 0; sessions 0; grants 0; approvals 0; Work/writer/provider authority 0/0/0; unauthorized private data 0. Billing/publication and silently accepted tampering also 0. |
| Accessibility | PARTIAL; browser accessibility-tree/focus/checkbox-keyboard checks and desktop/390px layout pass. Native VoiceOver and native select-key behavior remain unverified; details below. |
| Canonical Memory activation | READY_FOR_INTEGRATION contract; actual policy/activation **INTEGRATION PENDING**. Production continues inert staging only. |
| Integration crosswalk / README | PASS; [exact hooks, owners, Builder flow and schema boundary](../../../capsules/integration-crosswalk.md). No migration. |
| Typecheck/governance | PASS; complete Eve check, 567 classified sources, UNKNOWN=0. |
| Build | PASS in webpack mode; linked local dependencies prevent using default Turbopack in this worktree. Existing noVNC top-level-await warning remains. |

All benefit measures are deterministic fixture metrics. Setup counts are three known input-entry steps plus one review-start step. They do not measure LLM performance, elapsed time, net savings after selection/import, real Work execution or a live design partner.

## Dedicated accessibility pass

Browser: headed Chromium on macOS, local fixture app; desktop 1440×1000 and mobile viewport 390×844. Browser snapshots expose screen-reader semantics but are not a VoiceOver speech recording.

| Journey | Verified |
|---|---|
| Export selection | Named native checkboxes inside labeled fieldset; Space toggles preference; selected count has polite atomic status; nothing selected automatically. |
| Export preview | Focus moves to rendered review heading; headings/content/provenance visible in accessibility tree; deselect buttons have item-specific names. |
| Exclusions/warnings | Named authority-exclusions landmark and plain text privacy/checksum warnings; Knowledge/preferences/procedures/Skills are explained. |
| Import preview | Labeled file input/fieldset; focus moves to incoming review heading; unverified source, scope and item states exposed. |
| Conflicts | Existing/incoming versions and text preserved; default keeps destination; select has specific label plus `aria-describedby` explanation. Native select choice verified using labeled selection API, not claimed as native keyboard PASS. |
| Activation/save state | Named “Activation state” note explicitly says saving does not activate Skills/Roles/Packs/learning; success is exposed through status and receives focus outside the busy region. |
| Layout | No horizontal overflow at 390px; desktop/mobile screenshots retained; existing 44px button/46px select controls and focus outline preserved. |

The pass caught timing-dependent `requestAnimationFrame` focus before React committed a review. Focus now runs in effects after review/status rendering. Status announcements were also moved outside the busy ancestor, and conflict reasons associated with controls.

VoiceOver was initially off. A bounded native probe returned `AppleEvent timed out (-1712)`; the computer-use VoiceOver lookup also timed out (`-10005`). Subsequent check confirmed VoiceOver remained off. No accessibility/security permissions or persistent preferences were changed. Native select-key simulation did not confirm selection; labeled DOM selection did complete the journey. **Actual speech output and native select-key operation remain NOT_RUN / unverified.** Do not promote this to full accessibility PASS. No axe/WCAG-conformance claim is made.

Evidence: `accessibility-export.log`, `accessibility-import.log` contain returned accessibility snapshots and focus assertions; screenshots under `output/playwright/capsules/integration-*.png`. Scripts are retained alongside the logs for reproduction against a fresh fixture DB (the import scenario requires a newer synthetic destination preference). Console warnings were development font/preload warnings; successful journey reported no app errors.

## Reproduction and boundaries

- `tests.log`: 170 pass, canonical driver explicitly skipped.
- `typecheck.log`, `build.log`: required project checks.
- Parent `qualification.json`: both retrieval scenarios, minimization, performance and zero-transfer counters.
- `total-recall-compatibility.json`: actual draft pure projection, synthetic input, exact source checksum, preserved scopes and denied export/activation.
- Acceptance entry: `apps/eve/lib/capsules/integration.test.ts`; reusable suite: `apps/eve/test/capsules/integration/acceptance.ts`.
- Canonical driver must seed the named synthetic source records/policies in its disposable tenant, use its real policy/transaction/qualification hooks and implement real scope-filtered retrieval after restart. Snapshot inspection alone is not retrieval acceptance.
- No canonical Memory, Knowledge, Total Recall, Digital Worker integration worktree, Factory or shared migration files were modified. No branch merge or production deployment occurred.
