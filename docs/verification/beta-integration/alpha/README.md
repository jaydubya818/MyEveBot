# Two-person private alpha integration

Status: **PARTIAL — local assembly exercised; deployment is not authorized or ready.**

The accepted pre-final-components commit `7f86aca06c2cfd007bd54c1c256bf75fc3aaa5a9` remains intact in history. This tranche implements the owner's smaller private-alpha scope. No main merge, deployment, paid execution, secret access, or live model call occurred.

## Component crosswalk

| Component | Pin / treatment |
| --- | --- |
| Capsule source | `3331721f6335829a52b0b0d7fd8f7deca402d79d`; core parser, policy checks, review UI and staging contracts adopted |
| Digital Worker/Q37 consumer | `7bbf296f40ba61031f6e757b0d62929c3c95378d`; canonical Factory dependency closure and V2 spend validation adopted |
| Accepted spend-safe producer | `efe9e856f8fffbdb785497444a08d39e54d8f78d`; **source unavailable after host reset**, not substituted or reconstructed |
| Connected non-paid regression producer | `d9564beef41590c3700069ec340d926db23b7ba7`; retained canonical fixture used only for local integration evidence |
| Migrations | Preserved 0001–0057 and 0062–0066 byte-identical; 0058–0061 remain reserved; append 0067 only |

`component-imports.json` records initial adopted source fingerprints; `governance-review.json` records reviewed final integration changes. The file count reflects the two component dependency closures, their tests and evidence. It is not a broad feature tranche.

## What changed

Capsules now have an authenticated canonical Memory adapter. An owner explicitly attests that an exact personal source revision is portable to the selected destination. Export rechecks that policy under a canonical Memory lock; an edited source invalidates approval. Import requires the same independently authenticated owner on another Eve and explicit per-item review. New owner-level Memory/preferences narrow to the destination Agent. All selected Memory and the immutable receipt commit together. Conflicts keep destination truth. Replay cannot reactivate rolled-back or retired Memory; rollback refuses later corrections. Memory remains ordinary canonical `memory_records`, available to the existing scoped Memory retrieval API after restart.

Skills, Roles, Packs, procedures, learning and unsupported scoped experience stay in inert staging with their original version and provenance. Capsule 1.1 cannot represent the complete canonical repository/Work learning contract: this limitation is retained, not flattened or disguised as active learning. No authority, sessions, grants or provider access transfer.

MyFactory uses canonical routing, admission, spend validation, writer fencing, signed candidate custody, protected verification and Current Truth. The owner Work page and the primary-Agent tool expose bounded local Factory actions. The beta endpoint and tool deny LIVE qualification; a production Factory profile cannot silently fall back to native admission. The final spend-safe producer source and its qualified successor still belong to the producer/Q37 owners.

## Local evidence

- `whole-product.json`: Goal → canonical Memory → Work → Needs You → exact continuation → connected canonical non-paid Factory → signed candidate → real independent Docker verification → retained PARTIAL Result → incomplete Goal progress → feedback → evaluated/promoted repository learning → fresh-process reuse → explicit Capsule export → independent fresh Eve database → canonical activation → useful recall after restart → Today/Daily Brief. Candidate files and verifier evidence are retained in this report. **PARTIAL**, not final exact-pair or live qualification.
- `capsules-canonical.json`: independent fresh databases, destination-bound source consent, stale policy rejection, twelve concurrent imports, canonical recall in a fresh process, cross-owner/Agent rejection, conflict preservation, inert behavior/learning version retention, second-row failure rollback, correction-safe rollback and no replay resurrection.
- `migrations.json`: preserved migration bytes, populated accepted-chain upgrade, no-op replay and full rollback on injected migration failure.
- `canonical-journey.json`, `negative.json`, `canonical-recovery.json`: accepted product-spine regression and seven SIGKILL/replay boundaries. Result/Proof remain PARTIAL. `golden.json` is the historical fixture regression, not final completion evidence.
- `regressions/`: canonical Memory/Learning and Inbox PostgreSQL isolation/concurrency evidence. Logs and `checks.json` contain final test counts and browser findings.

Observed local safety counters are zero for duplicate Work, false Task/Goal completion, concurrent writers, duplicate Factory execution, authority expansion, cross-owner disclosure, stale continuation, Capsule authority transfer and false Ready. Goal PostgreSQL qualification records avoidable coordination debt zero. These are local observations, not live production guarantees.

## Remaining release decisions

1. Recover the exact accepted producer source, or obtain a newly qualified exact successor from its owner. The older non-paid fixture is not a spend-safe source replacement.
2. Approve the inactive [private-alpha runtime patch](private-alpha-runtime.patch). Automatic approval review rejected applying it because it changes the integration from disposable loopback data to the canonical application database. The active code still requires local qualification configuration. The patch requires explicit private-alpha mode, explicit deployment owner, configured web authentication and bounded server-side Work limits. It does not deploy or authorize paid execution. It has been checked for applicability; its new runtime tests must run after approval.
3. Select the deployment topology. Preparation assumes the existing single-owner authentication boundary: one private Eve and independent database/session secrets per person. A shared deployment with two independently authenticated owners requires a separate product decision; no multi-user authentication was invented.
4. Receive Q37's final exact-pair/live handoff before enabling real Factory execution. Live Sofie and Live MyFactory remain NOT_RUN here. Q37 owns its separately authorized single live journey; this task must not duplicate it.

[Deployment preparation](deployment.md) and [post-alpha backlog](post-alpha-backlog.md) separate real launch dependencies from noncritical hardening.

## Candidate status

The Beta SHA is the commit containing this dossier (reported in the handoff); the frozen parent remains `7f86aca06c2cfd007bd54c1c256bf75fc3aaa5a9`.

| Required status | Result |
| --- | --- |
| Migration lineage | PASS — 63 active migrations, preserved historical bytes |
| Memory/Learning | PASS — canonical local PostgreSQL and restart reuse |
| Goal OS | PASS — 19 PostgreSQL checks, seven crash boundaries |
| Inbox | PASS — owner isolation and concurrent response replay |
| Capsules | PASS for personal Memory alpha scope; learning/behavior activation deferred |
| MyFactory integration | Local connected fixture PASS; final spend-safe exact pair unavailable |
| Canonical Result | PARTIAL |
| Proof of Work | PARTIAL |
| Authenticated browser | PASS — local owner sign-in, Capsule consent/export/import and expiry clearing |
| Whole-product local journey | PARTIAL — real local custody/verification; no live or final-pair claim |
| Full regression | Available local suites PASS; 61 optional unit/integration tests explicitly skipped |
| Safety counters | All eleven requested observed counters zero; see safety.json |
| Live Sofie / Live MyFactory | NOT_RUN / NOT_RUN |
| Managed Beta | NOT_DEPLOYED |
| Overall | PARTIAL — local candidate preserved; final source and deployment decisions outstanding |

Application: 1,845 passed; root/security: 135 passed; Gate C: 47 passed. Typecheck, governance and production build pass. Screenshots are in `output/playwright/beta-integration/alpha/`. Browser findings and remaining release prerequisites are explicit; this is not a claim that deployment or live qualification occurred.
