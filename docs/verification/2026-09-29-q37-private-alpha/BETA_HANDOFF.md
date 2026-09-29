# Beta Integration handoff — Q37 / MyFactory consumer

**READY for local private-alpha integration.** Local qualification and independent read-only review PASS. Real provider **NOT_RUN**; deployment and paid enablement are separate.

| Identity | Pin |
| --- | --- |
| MyEve implementation/evidence SHA | `5b0033ba880cf45d4c69ab79385df129e19bedbb` |
| MyEve remote | `https://github.com/jaydubya818/MyEveBot.git`, `refs/heads/codex/q37-private-alpha-continuation` |
| MyEve baseline | `7bbf296f40ba61031f6e757b0d62929c3c95378d` |
| MyFactory SHA | `925530a6ba8764df6a7b8637192fe32edcbaff97` |
| MyFactory remote | `https://github.com/jaydubya818/MyFactory.git`, `refs/heads/codex/private-alpha-myfactory` |
| MyFactory SQLite v8 SHA-256 | `0994004a2a89c2264423e969fc3b97ef609f8d0fb437e9dcf6ea6203309cbeb3` |

The MyEve branch tip also includes this documentation-only handoff, independent review evidence, and the corrected repair wording. Its enclosing Git commit is the handoff delivery SHA; the exact reviewed implementation SHA above remains its ancestor, with unchanged production/test bytes. Resolve and compare `git rev-parse HEAD` and `git ls-remote origin refs/heads/codex/q37-private-alpha-continuation` before integration. The originating chat records the final delivery SHA after push. Never substitute the lost historical producer.

## Component contract

PREPARE/START/READ/STOP and strict WORK_LEDGER_V2 crosswalk pass with the reconstructed producer. Gate C validates signatures, FactoryVersion, exact bytes and immutable receipts; it grants no writer. Gate B preserves one productive writer, exactly-once dispatch, quiescence before succession and restart-safe custody. Factory candidates must undergo independent MyEve protected verification. Failed verification can lead to a new normally admitted native repair only after Factory quiescence. Protected PASS alone does not authorize publication.

Backend intent selects DIRECT for investigation/planning and separately qualified bounded operations, HUMAN for unsupported/judgment/unclassified intents, and MYFACTORY only for qualified PRODUCE. Factory outage or unpaid qualification does not block DIRECT/HUMAN proposals. Current Truth preserves UNKNOWN exposure after terminal execution and explains the next permitted recovery action; STOP/timeout/new generations do not refund uncertainty.

Installed Codex CLI 0.157.0, actual client-search outputs and separate completion children pass against a scripted loopback Responses provider. Protected completion dollars/slots, operation caps and full-call reservations remain enforced. MyEve migrations 0001–0057 are byte-identical to baseline; no consumer migration is added. SQLite migration 8 matches the requested producer hash.

## Evidence and limits

[Qualification report](REPORT.md), [machine summary](qualification-summary.json), [independent review](INDEPENDENT_REVIEW.md), and [prepared real-provider envelope](REAL_PROVIDER.md).

- Application/PostgreSQL: **1,586 PASS / 40 gated skips**; root/security: **151 PASS**.
- Gate B **23 PASS**, Gate C **47 PASS**, connected CLI **16 PASS**; typecheck, governance, migration lineage and webpack **PASS**.
- Independent review: **240 focused consumer tests**, **15 producer ledger/process tests**, and fresh Gate B/C/connected journeys **PASS**.
- Fresh safety counters are **zero** for concurrent writers, duplicate dispatch, unauthenticated admission, false Ready, stale mutation, lost custody, Factory-granted authority, post-UNKNOWN admission, completion starvation, operation-limit overflow, ceiling violation and reserve theft. These are fixture-scoped results.
- Real provider loader exists but is unactivated; **no credential read or real model call**. Producer activation and explicit bounded authorization remain before the first real operation.
- GitHub/CI/review and Relay composition are synthetic local contracts. Learning drafts/scoped advisory reuse pass; production promotion is unimplemented. Results stay PARTIAL/FAILED.
- The optional old offline dump restore is unavailable; fresh populated-state preservation, legacy migration, lineage and all migration hashes pass. See the report for this disclosed limitation.
- Billing classification is **NON-BLOCKING** for two trusted owners. Resource safeguards remain required.

This chat supersedes the stale Q37 implementation chat. No attempt was made to message or resume it. This handoff does not merge, deploy, publish or enable a provider.
