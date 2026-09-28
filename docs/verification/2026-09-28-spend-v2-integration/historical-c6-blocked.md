# MyFactory V2 consumer integration — blocked final CLI handoff

**Current status: BLOCKED; consumer changes preserved uncommitted. Live MyFactory NOT_RUN / NOT READY.**

The producer task “Build local software factory” stopped after its CLI correction was partly prepared. Its latest response at 2026-09-28T04:12:04Z says it needs a new direct user instruction and references freeze 8f5e377, although the observed checkout HEAD is c6c0164. This task sent the concrete defect and exact reproduction repeatedly under the existing defect exception; the owner still declined to continue. MyEve must not take over producer implementation. The follow-up automation is paused after consuming the original handoff.

Final c6c0164 installed-CLI qualification **FAILS before any provider call**: Codex 0.157.0 advertises `tool_search` with `execution: "client"`; the gateway denies every form. [Failure log](c6c0164-cli-hosted-tool-denial.log) and [redacted metadata](installed-cli-tool-metadata.json) are retained. The supported flag experiment did not remove the tool. The producer's two dirty source/test files are unqualified; do not activate or treat them as a successor. Correct handling must preserve explicit deny-by-default tool classification and hosted/unspecified search exclusion.

The prior ad23 installed-CLI and proposed-envelope-shape runs passed 16 checks but **cannot qualify c6c0164**, and ad23 itself has preserved recovery defects. Final complete integration review and an executable same-final-version dry run therefore have **not passed**. The $1.02 envelope remains a proposal. The success-case real producer-verifier addition has not completed on the final producer; only the independent MyEve verifier is established in the earlier complete runs.

Consumer base: `14eff2e24f4a083f6f6f9563f044c3f86e92ed35`, branch `codex/digital-worker-integration`. Sole consumer owner; no producer, main checkout, or protected workstream edits. This dossier supersedes the status of the [preserved preparation checkpoint](../2026-09-28-spend-safety-preparation/REPORT.md) and the V1 release blockers in [historical preflight](../2026-09-27-real-provider-preflight/REPORT.md). Every byte of the historical failed probes remains unchanged. Their counterexamples are evidence, not current qualification.

## Consumer contract

Paid admission requires backend-reviewed `WORK_LEDGER_V2`, exact source/version/model/pricing evidence and the full immutable productive/completion plan. PREPARE retains this plan in the existing request/configuration binding. No new ledger, authority architecture or migration was created. Registered MyEve migrations 0056 and 0057 remain unchanged; 0001–0055 retain canonical lineage.

The parser independently recomputes settled/retained/UNKNOWN exposure, protected completion dollars, total and phase operation counts, full-call reservations, and accounting completeness. It accepts actual producer `prepared/active/fenced` states. Prepared accounting is not a writer grant. Same-generation phase regression, history deletion or altered settlement is denied; new generations retain historical operations without treating them as current completion. Original and migrated V1 ledgers remain readable for recovery but cannot start paid production. Missing/expired qualification, UNKNOWN, unsettled accounting, unavailable completion capacity and exhausted slots hold paid production. DIRECT/HUMAN routing stays available.

Existing Chat/Work Current Truth now distinguishes total unused budget from productive allowance, protected completion dollars/slots, operation count and unsettled accounting. UNKNOWN remains a reconciliation blocker after execution becomes terminal. A settled terminal completion is not misreported as an accounting error; it still grants no new paid start. Sofie/native paid explanation is excluded from this bounded profile; deterministic Current Truth needs no separately billed model.

## Evidence and review

The first V2 producer `ad23f325` corrected the three original spend probes, but independent review found false completion-process quiescence, historical READ fencing newer authority, and historical completion reuse. [Negative review](independent-review-ad23.md) and [reproduction](review-negative-ad23.jsonl) are retained. Do not qualify that producer for live use. Successor review and exact final pins are recorded in the final qualification summary.

Application/M1, root/security, Gate B/C, typecheck, migration validation, governance and webpack logs are included. The existing default Turbopack dependency-symlink limitation remains; no unrelated dependency layout was changed. The qualified production build uses webpack.

The connected fixture exercises real HTTP, producer SQLite, signed results, Git custody, PostgreSQL, consumer restart, and protected Docker verification. Its installed-CLI mode replaces the synthetic coding function with Codex CLI 0.157.0 talking only to a scripted loopback Responses provider: a real local apply_patch call, productive final response, then a separate read-only completion child. No personal login/key is passed to the child. The proposed-envelope success case also uses the producer's real Docker verifier; deliberately false producer PASS remains only in the negative independent-verifier cases.

The controlled provider returns predetermined answers. These runs prove protocol, accounting, custody and tool plumbing, not real model quality or commercial billing. UNKNOWN fault injection uses a shorter child timeout to exercise recovery; it is separate from the successful envelope configuration.

## Q37 continuation and limits

Local Gate B/C, one writer, exactly-once dispatch, UNKNOWN/STOP, candidate custody, protected verification and normally admitted Factory→native repair are exercised. GitHub/CI/review and Work-bound Relay composition remain synthetic local contracts. Durable learning drafts and scoped advisory reuse pass; production learning promotion is not implemented by this tranche. Results remain PARTIAL; none becomes Ready from Factory evidence.

See [price card](price-card.json) and [credential/envelope handoff](ENVELOPE.md). Real provider and Live MyFactory remain **NOT_RUN**. A dedicated provider credential and bounded live authorization are not supplied by this implementation or by passing mock tests. No merge, publication, deployment or paid call occurred.

## Final preserved checkpoint

[Machine-readable summary](qualification-summary.json): application 1,586 PASS / 40 gated skips; root/security 151 PASS; Gate B 23 PASS; Gate C 47 PASS; canonical d956 connected 14 PASS; TypeScript/capability/routing, 57 migrations, governance (659 classified, UNKNOWN=0) and webpack PASS. Final producer regression 130 PASS / 1 opt-in skip. Its 26 focused independent tests pass, but the downstream full CLI test fails as described above. The corrected original UNKNOWN/completion/operation-limit probes are zero; the older ad23 false-quiescence counterexample remains preserved, not folded into an all-zero claim.

Next required user action: tell the existing producer owner directly to resume the concrete c6c0164 installed-CLI client-tool-search compatibility defect, finish the preserved fix, retain hosted/unknown tool denial, qualify and commit a clean successor. Then this consumer work can rerun its final connected/dry-run checks, commit, obtain complete independent review and finish real-provider preflight. No producer ownership transfer, paid call or live authorization is requested.
