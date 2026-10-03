# Private Alpha final consolidation handoff

This package hands the accepted offline Private Alpha checkpoint to the canonical Consolidation owner. Feature scope is closed. It does not activate production repair, start a candidate attempt, merge canonical main, deploy, publish a candidate or record owner acceptance. This workstream becomes read-only after the documentation package is pushed and remote-verified, except for a concrete compatibility defect reported by Consolidation.

## Source and adoption

| Repository | Accepted implementation commit | Observed canonical main | Relationship |
| --- | --- | --- | --- |
| MyFactory | `7fe3397ad0f2423e60299872c85e7ce1fe9eed19` | `c0b4c1155a6a98f91375163443938042e6a0be10` | main is ancestor; release ahead 3 |
| MyEve | `fadf08e12340035e3691c6f047b4927b1ab21264` | `d75091eb333a531fa91ed9d39e273948aa9d0eaf` | main is ancestor; release ahead 3 |

[Adoption manifest](adoption-manifest.json) pins full source trees, ordered commits, file deltas, migration identity, qualified Factory source digest/FactoryVersion and deferred gates. These implementation pins remain fixed; the later documentation-only commits carrying this package are transport receipts. They do not represent a newly qualified runtime. MyFactory carries an identical copy of the adoption manifest and a pointer to this primary MyEve package.

Consolidation must fetch current main again before adoption and preserve newer Computer/federation/task-session lifecycle work. At the observed mains there is no divergent ancestry or known textual merge conflict. Unmerged parallel branches and the future combined runtime were not qualified here. Adopt the complete three-commit delta in each repository, not only its final commit: safe-integer corpus → no-edit productive context → review/repair lifecycle. Reconcile normally if main advances; never reset or force-push it.

Keep producer inventory, consumer executor fingerprints and the builder manifest addition for the existing `connection-reporting.md` instruction. Its content was not changed. Recompute/requalify exact runtime/profile identities after integration if combined sources differ. No runtime, credential or deployment configuration is included in this package.

## Migration impact

There are **zero new migrations relative to the observed canonical mains**. MyFactory persists additive `review.*` and `repair.*` events in its existing transactional WorkOrder store; its storage source blob is unchanged. MyEve's migration tree and current schema marker remain `0079_candidate_publication.sql`; the source-only migration check passes all 75 ordered migrations. The manifest pins both identities.

Migration 0079 and prior Work/Factory, Computer/federation and session-lifecycle migrations are dependencies already in the observed MyEve main. Do not omit, renumber, replay destructively or downgrade them. Historical publisher qualification includes protected backup/restore and production migration evidence. The current production database ledger was not rechecked or changed for this handoff; target drift and any later migration adoption belong to Consolidation's normal protected migration process.

## Permanent regression corpus

[Regression inventory](regression-inventory.json) binds 18 regression groups to accepted source files and evidence. File hashes make the referenced test implementation reviewable. The groups include proposal normalization, admission semantics, namespaced model identity, bounded context/productive capacity, checkpoint feedback, completion, exact-byte output, safe integers, no-edit fencing, custody, protected verification/Gate B/C, accounting, publication, CI, independent review, bounded repair and single-writer/UNKNOWN recovery.

| Historical qualification | First failure or established behavior | Permanent evidence entrypoint in MyEve |
| --- | --- | --- |
| Attempt 1 | Sofie response normalization before canonical command admission | `docs/private-alpha/first-live-handoff-2026-09-30/` |
| Attempt 2 | Admission proposal is a request, never model-granted authority | `docs/private-alpha/second-live-semantics-2026-10-01/` |
| Attempt 3 | Provider-qualified `openai/gpt-5.4-mini` identity | `docs/private-alpha/model-reference-2026-10-01/` |
| Attempt 4 | Bounded context, productive capacity, provider-failure classification and terminal custody reconciliation | `docs/private-alpha/execution-capacity-2026-10-01/` |
| Attempt 5 | Host-owned productive closure → read-only completion → exact checked-tree commit | `docs/private-alpha/completion-transition-2026-10-01/` |
| Attempt 6 | Host-visible checks and bounded deterministic implementation feedback | `docs/private-alpha/implementation-feedback-2026-10-01/` |
| Attempt 7 | Explicit compact JSON + exactly one LF, exit 0, empty stderr; full journey accounting | `docs/private-alpha/output-contract-accounting-2026-10-01/` |
| Attempt 8 | First local production Golden Journey PASS; later CI PASS / numeric-range independent-review FAIL | `docs/private-alpha/owner-publication-2026-10-02/` and `docs/verification/2026-10-02-numeric-range/` |
| Failed safe-integer successor | Actual `pwd` / `rg --files` response consumed one productive operation without edits | `docs/private-alpha/no-edit-productive-2026-10-02/` |

The clarified **public** quantity contract is 1 through 9,007,199,254,740,991 inclusive. Invalid input returns exactly `{"error":"invalid_quantity"}\n`, exit 0, empty stderr. Public tests cover the minimum, maximum, maximum+1, 9007199254740993, huge input, zero, negatives, decimals, malformed input and whitespace/newlines. Protected tests independently cover the boundary classes and remain outside producer context. The control passes 17 public checks and 11 protected checks; historical Attempt-8 source fails four new public checks. Controls are fixtures, not a live repaired candidate.

The no-edit fixture preserves the actual tool sequence and public prompt. Relevant source absence, public tests/contract and runtime were supplied. The repair adds a host-owned productive-mode developer instruction instead of accepting no-change success or adding operations. Necessary targeted inspection remains possible. Captured inspection-only output still fails closed. Correct-first and bounded second-turn repair qualify offline; live adherence remains unproven.

## Review → Repair → Reverify

MyFactory [design](https://github.com/jaydubya818/MyFactory/blob/7fe3397ad0f2423e60299872c85e7ce1fe9eed19/docs/review-repair.md) and MyEve [consumer binding](../review-repair.md) specify the accepted extension:

`immutable Candidate A → authenticated review/findings → owner-approved bounded repair Work → new Candidate B → fresh checks/completion/custody/protected verification → CI if published → new independent review`

Findings bind category, severity, path, evidence, review identity and exact candidate. Only explicitly public findings can reach the producer. Protected content is excluded; host classification is a real trust boundary. Findings grant no writer, budget, completion, verification or publication authority.

Repair policy bounds chain rounds, Factory operation count, total allocation, deadline, allowed files and unchanged objective. Each approved round reserves its full quota permanently; unused capacity is not recycled. No-candidate failure, UNKNOWN, expiry or exhaustion goes to Needs You. A reviewed candidate and all its evidence remain immutable; B cannot borrow A's PASS verdicts, report identity or candidate-bound evidence digest. Published B needs new exact-candidate CI and independent review. Publication/PR replacement or closure is never implicit.

Trusted observation methods are host-only and deny ingestion with default empty allowlists. Authenticated production adapters/configuration are still a separate gate. Owner repair approval creates an awaiting-approval Factory WorkOrder, not paid execution. MyEve's exact trusted `repairBinding` must match the fresh Work revision/generation and that WorkOrder through ordinary routing, PREPARE/START, spend, writer and Gate B/C controls. Factory repair limits cover productive/completion calls; Sofie or paid review requires the coordinating Work's own authorization and cannot borrow that budget.

## Publisher, CI, review and Result/Proof

The Attempt-8 publisher reconstructs authenticated immutable Git objects in a fresh bare repository. It binds owner decision to Work/Result/revision/generation, candidate, tree, repository and expected base. Tree or base drift fails closed. Create-only branch leases, durable effect claims and locks permit at most one push and one draft PR; lost/ambiguous responses use readback rather than repeating an effect. No merge/deploy or implicit acceptance path exists.

CI readback records real workflow/check conclusions for the exact candidate. Local checks are not CI. Independent review is a separate candidate-bound observation; it may find defects after both verification and CI pass. Failed review keeps Result PARTIAL and Ready false. Owner acceptance is separately recorded, never inferred from publication, CI or reviewer PASS.

Current owner accounting includes Sofie and Factory; UNKNOWN exposure is separate. Historical pre-final-Sofie Proof is immutable. Six semantic checks intentionally reference protected artifact `db5bde1545dd47df4b1782eb4c995a4064166568f73e3231c96e47fec3c8a535`; presentation groups those references without deleting or rewriting them. Presentation/readback source `d75091e` is already in observed canonical main. The later numeric-range archive records its deployment; earlier archived reports retain their earlier NOT_DEPLOYED status unchanged. That historical presentation deployment does not imply activation of this new checkpoint.

## Historical records preserved

[Historical dispositions](historical-dispositions.json) and the [evidence index](evidence-index.json) preserve these separate outcomes:

- Attempt-8 Work `b1e4e5cf-f0d5-45b1-97d3-d4a113bd09fb`: Candidate A `1253fcbd5a4e11d72f8ee43c7025b0729d9fa298`, tree `ddcb301db219a744fe741d745f85a97da8a3cd22`. [PR #2](https://github.com/jaydubya818/myeve-golden-work-qual/pull/2) remains open, draft and unmerged; exact head/base and real `quantity-ci` PASS were read back for this handoff. Independent review remains FAIL. Original visible/protected observations remain 11/11 PASS. Sofie $0.005100 + Factory $0.013932 = $0.019032. Result PARTIAL; acceptance NOT_RUN.
- Failed successor `54af9acf-df9e-4d69-811e-aa886f3a138e`: paused/fenced at 3/3, no candidate, two real operations and $0.009619 retained. The safe-integer implementation contract was not exercised. No retry, resume or budget reuse.
- Already-staged fresh Work `db8d221c-275a-498f-90ed-c42fd3b4e157`: last qualified PAUSED at 1/1 with zero operations. Its older no-edit checkpoint binding has not been activated or rebound to the accepted review/repair checkpoint. It is not execution-ready merely because it exists; this handoff neither changes nor authorizes it.

All Attempts 1–8 source evidence references remain in place. No historical database row, candidate, PR, accounting, Proof or archive was rewritten. Later deterministic review/repair tests must never be described as having run during Attempt 8.

## Qualification and limits

[Qualification summary](qualification-summary.json) distinguishes retained broad-suite evidence from this documentation-only handoff's checks. All **166 indexed artifacts** across seven selected archives were rehashed successfully. The committed index contains paths/hashes; raw private traces, database snapshots and protected evidence stay in the existing restricted archive. Consolidation needs access to that archive for full replay; absence of an artifact must not be treated as a PASS.

Accepted checkpoint: Factory lifecycle 18/18; installed checkpoint scenarios 17/17; synthetic metered CLI 1/1; connected MyEve→Factory 26/26; Factory default 193 PASS / 17 opt-in skips; MyEve app 1,995 PASS / 94 optional skips; root 145 PASS / 2 optional skips. Required targeted integrations have separately retained evidence; unrelated optional integrations are not claimed. Typecheck, producer/consumer governance and builds passed. Publisher/readback evidence has 29 contract checks and 12 browser journeys, and its source remains unchanged through this accepted checkpoint.

Handoff checks: lifecycle + safe-integer regression **21/21 PASS**, no skips; 75 ordered migration source checks PASS; both release sources clean and descendant of fetched main; archival integrity PASS. Broad builds/suites were not rerun for documentation alone. **Additional real model operations: 0.** Production activation and live repair are NOT_RUN. Fixture passes do not establish live model adherence or successor CI/review/acceptance.

## Deferred gates and ownership

Consolidation owns combined-source adoption/qualification, target database drift review, deployment and exact runtime/profile activation. Authenticated trusted observers, owner-approved repair policy/binding and any fresh bounded real execution require their separate gates. Automatic repair, automatic merge and automatic deployment remain **DISABLED**; owner acceptance remains **separate**. No new feature scope, paid execution, publication or production change is authorized by this handoff.
