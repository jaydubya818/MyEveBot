# Attempt 7: public output contract and journey accounting

Attempt 7 remains a retained FAILED live qualification. Candidate `b39e3f4c188e352cef0f3c1254011d5bd07e278b`, Result, Proof, all seven historical Work snapshots and all 34 Attempt-7 evidence artifacts are unchanged. No candidate has been published and no additional real model operation was performed.

## Public contract decision

**Case B: line-oriented JSON with a terminal LF.** The original [repository issue #1](https://github.com/jaydubya818/myeve-golden-work-qual/issues/1) explicitly requires “one line of JSON.” README examples establish the compact object shapes; the input-whitespace rule concerns stdin. A line terminator is consistent with that public CLI interface. However, the README did not state its exact bytes and the visible tests trimmed stdout before parsing, so a missing terminator passed them. We make the public interpretation explicit rather than deriving it from protected expected answers.

The public specification now requires one compact JSON object followed by exactly one LF, exit 0 and empty stderr. `test/output-contract.json` contains only serialization metadata, no test inputs or expected answers. The visible tests consume it. The protected supervisor validates the same artifact, pinned by SHA-256 in the reviewed repository manifest, and refuses expected outputs that violate it. Protected black-box byte comparison remains strict; stderr is additionally required empty for the public-contract profile. Historical profiles and verification records are unchanged.

Qualification repository base `7380d3324224a5660daa1556384c7a1a17d7d21e` on `codex/private-alpha-release` contains only the specification/test repair, not quantity.mjs. Qualification-repository main remains unchanged: its protections require a candidate PR and passing quantity-ci, which are not authorized here. The reviewed branch and commit are pinned explicitly; no protection bypass or candidate publication was used. Future candidate scope remains quantity.mjs only. The Factory's existing bounded context includes the public artifact through test/. No producer code repair is needed. Protected inputs, expected answers, verifier code and evidence are not added to implementation context; protected coverage includes a case absent from visible tests.

## Captured regression and controlled journey

The captured live source passes the original 11 visible tests twice. Replaying the preserved ten outputs through the unchanged protected comparator yields ten failures, each solely a missing LF; the retained candidate custody and FAILED Proof remain bound to that source. New public tests reject that exact source before completion. A line-terminated implementation passes all 11 visible tests.

The installed CLI connected fixture uses controlled loopback responses, disposable PostgreSQL, real local Git/custody, and independent offline Docker verification. It reproduces the missing-LF source, stops/reaps productive execution at the host checkpoint, supplies bounded visible assertion feedback, permits one second productive repair, closes production, admits one read-only completion and commits the exact checked tree. Signed custody, Gate C, independent hidden coverage, final verification, canonical Result/Proof and final Sofie explanation pass. Accounting includes all controlled operations. No real provider is used.

The successful local Result/Proof remains **PARTIAL** under the existing canonical semantics: independent source verification passed, but external publication, GitHub CI, review and owner acceptance are not established. We do not manufacture COMPLETED or Ready from local qualification. Failed protected checks continue to retain FAILED, Needs verification and Ready false. The seven-attempt regression suite preserves normalization, proposal-vs-authority semantics, exact provider-qualified model, 503/UNKNOWN handling, capacity, productive-to-completion, feedback, custody, deduplication, cancellation and recovery.

## Complete journey accounting

The prior Proof queried only NATIVE_EXECUTION calls, dropping both Sofie conversation calls and external Factory ledger spend. The new read-only accounting query uses attributable operation receipts, including frozen legacy receipts; budget counters are not added again. It validates Factory Work ledgers, deduplicates cumulative readbacks by immutable operation identity, permits UNKNOWN-to-settled observation progress, rejects conflicting settlement and separates unsettled/UNKNOWN exposure from settled charges. Missing Factory coverage is explicitly UNAVAILABLE.

Future immutable Proofs retain a typed, timestamped accounting snapshot containing Sofie, Factory, native-executor and total settled microUSD, reservation and UNKNOWN exposure, plus coverage and unrepresented-charge limitations. Because the final Sofie explanation occurs after Proof retention, Work/Result/Proof views also read current journey accounting. That current total includes the final explanation when settled; it is displayed separately from the older immutable snapshot. Historical Proof hashes and bytes are never rewritten.

Attempt-7 accounting regression: Factory $0.013194 + Sofie $0.004768 = **$0.017962**. At Proof retention, before final explanation, the total was $0.014157. The final $0.003805 Sofie call increases current accounting without changing the Proof snapshot. Failed outcomes do not erase incurred costs. Infrastructure and charges outside the canonical model ledgers remain explicitly unrepresented.

## Retained-failure lifecycle decision

Work lifecycle describes owner intent; route/writer/controller state describes one execution. `nextWorkState` closes Work only through canonical lifecycle actions, while verification produces a candidate Result. Thus active Work + terminal fenced writer + Needs verification is intentional: a failed candidate does not silently cancel or accept the owner's objective. Active grants no new writer, operation or retry. The authorization for Attempts 1–7 remains exhausted and no historical Work is resumed. No separate lifecycle mutation/migration is warranted for this repair. Existing generation, deadline, proposal, admission and accounting gates remain required for any new execution.

## Qualification and limits

See `qualification-summary.json`, the connected receipts, historical preservation and captured comparator replay. Application tests: 1,990 pass, 94 environment-gated skips; root tests: 144 pass. Factory ordinary tests: 170 pass; producer types/governance pass. MyEve types, governance and production build pass. Both complete connected modes pass, with 26 assertions each. Zero additional real model operations and zero holdout leakage to implementation.

Changes span contract pinning/qualification, one read-only accounting module and schema, Proof/Current Truth/Result presentation, focused fixtures/tests, and reviewed governance fingerprints. No routing/admission, writer, budget-limit, model/provider or publication authority is widened. MyFactory source remains c0b4c1155a6a98f91375163443938042e6a0be10.

After normal canonical integration, isolated deployment and zero-model preflight, a fresh paused Work may be prepared. Attempt 8 requires separate explicit live authorization. Exact release SHAs, deployment and paused-Work receipts are retained in the private-alpha qualification archive after integration.
