# Consumer integration package — no producer repin

Final producer SHA: **<FINAL_QUALIFIED_PRODUCER_SHA>** (not yet supplied). Canonical producer remains **d9564beef41590c3700069ec340d926db23b7ba7**. Candidate **8f5e3774129b5f9f4b1c9655ffbbb531cd20fa0f** is supported only by isolated non-paid fixtures. Its SQLite v7 SQL checksum is `208fd0facca9f2535c30e558bf261243efd3ababd3113697e34dbefdf8f1598e`.

## Qualification/configuration boundary

The consumer connection may explicitly select `spendContract: { version: "WORK_LEDGER_V1", sourceDigest: <actual source digest> }`. The selector must match the connection's source digest and signed preparation. `qualification.mode` additionally understands LOCAL_SPEND_FIXTURE; that mode is synthetic and never qualifies LIVE.

`qualification.spendReview` is a **consumer-reviewed evidence record**, not a producer message. It binds environment, sourceDigest, FactoryVersion, expiry, and independent status/evidence references for hardCeiling, preCallEnforcement, accounting, unknownRetention and completion. Pricing additionally binds exact model, revision and validUntil. Missing, stale, wrong-source, wrong-environment or PENDING evidence denies non-fixture production. Merely adding ledger fields, setting spendEnforced or editing a compatibility selector does not qualify the path. Actual producer health and complete prepared accounting must also pass before writer admission and START.

No actual LIVE review record is installed. Fixtures explicitly use synthetic local evidence. Final review must establish the approved **whole Work** envelope, including coordinating/completion calls and any prior native liabilities; the producer ledger alone is not a replacement or a grant for MyEve's existing common/model ledger. No new consumer ledger or database migration is introduced here.

## Future integration procedure

1. Obtain the fully qualified successor SHA, clean evidence/handoff, current price card, intended credential/provider-path qualification, completion behavior and final spend enforcement evidence. Reconcile its schema/source diff against CROSSWALK.md. Do not substitute the present local-only candidate for those facts.
2. Stage the exact SHA in an isolated checkout; verify source/FactoryVersion and SQLite lineage. Run the commands below against that checkout with a controlled local provider first.
3. Review capability evidence against the exact source/configuration and Work scope. Fill the consumer review record only from real qualification results; completion remains PENDING if the final contract/evidence does not establish it. If the producer adds completion wire fields, implement and test that exact finalized contract first.
4. Update the canonical pin/configuration and README only after qualification is accepted. Preserve prior pin as historical evidence. Do not mutate retained preparation configuration hashes or switch the producer beneath active attempts.
5. A paid/live run still needs its separate complete authorization envelope. This package does not authorize it.

## Changed consumer surfaces

- `factory-spend.ts`: exact ledger schema, evidence gating, arithmetic/binding/history validation, start hold and summaries.
- `factory-live-adapter.ts`: explicit version boundary; exact current operation/price binding; legacy zero-cost compatibility.
- `factory-routing.ts`: production-only qualification gate; DIRECT/HUMAN independent of Factory pricing/completion readiness.
- `factory-work-driver.ts`: prepared-accounting check before admission/dispatch; preserve observed liabilities and stale-read blockers in existing observations.
- `worker-projection.ts`, `current-truth-lines.ts`: same owner UI and Sofie context, with amounts, UNKNOWN, completeness, pricing/completion and next action. Existing CurrentWorkTruth renders these lines.
- `factory-spend.test.ts`, `factory-live.integration.mjs`: controlled fixtures and canonical/candidate regression. No parallel Work/Run/candidate/writer architecture.

## Local qualification commands

From the owned MyEve integration checkout (disposable PostgreSQL on 127.0.0.1:55479; Docker available):

```sh
ADMISSION_CONTEXT_TEST_POSTGRES=1 npm test --workspace=eve-agent
npm test
npm run typecheck --workspace=eve-agent
npm run db:migrations:check
npm exec --workspace=eve-agent -- next build --webpack
MYFACTORY_SOURCE_ROOT=/Users/jaywest/.codex/worktrees/digital-worker-factory/MyFactory node --import tsx apps/eve/test/factory-live.integration.mjs
MYFACTORY_SOURCE_ROOT=/private/tmp/q37-producer-spend-inspection FACTORY_SPEND_FIXTURE=1 node --import tsx apps/eve/test/factory-live.integration.mjs
node --import tsx apps/eve/test/factory-writer.integration.mjs
node --import tsx apps/eve/test/factory-receipt.integration.mjs
```

The first producer source is pinned canonical d956; the second is an isolated checkout of candidate 8f5e377. The spend-fixture flag exists only in the test harness, creates a loopback fake provider and grants no host paid execution. Candidate producer `npm test`, `npm run typecheck:producer`, and `npm run check:producer-governance` also passed locally.

## Rollback

Before any future activation, stop new admissions and reconcile/fence exact active attempts. Retain receipt, candidate and spend history, including UNKNOWN liabilities. Restore the prior reviewed application/configuration for **new** legacy zero-cost fixture Work only; do not reinterpret ledger-v1 receipts with the old parser or discard observations to regain allowance. Existing new-contract attempts must retain a compatible read/STOP path until reconciled. No consumer migration rollback is needed. Never reset the Work ID, rewrite configuration hashes or delete a budget to manufacture fresh headroom.
