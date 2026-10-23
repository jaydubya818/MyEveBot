# Productive HTTP fixture port — source only

Branch: `codex/productive-http-fixture-20261023`, based on frozen QA candidate `ea7093a5f427238fe0bee335bee7746b558cefb3`. No deployment or production state change.

This ports only the existing productive-journey fixture correction from `c8eec4580e964cdebe6a7351ff78546244291ebf`. The resulting test-file blob is exactly `927fd386d4ed02f1f27e5755c95ebddf63e62034`, identical to the previously qualified correction. The other changes are this evidence, independent review and the explicit nondeploying branch guard.

The HTTP handler receives the same real synthetic owner/capability binding as its injected restricted runtime, a digest of that binding array, and the database role obtained by `SELECT current_user` inside the runtime's own transaction. It continues to run the real Factory configuration loader. Missing and foreign-owner bindings remain rejected before Factory intake or Factory authority, queueing, local sandbox allocation or deterministic model transport. No production handler, pricing validator, accounting function, capability gate, migration, credential or tool-enablement code was changed.

## Exact initial source pair

- MyEve base: `ea7093a5f427238fe0bee335bee7746b558cefb3` (PR #99 lineage plus six feedback fixes and QA adoption).
- Factory: `1da82a739b2dd411ac63cdf261963effd5451d94`; source identity `92c6f5ebae7d0a1a9ca32ab12ef6d7e4c74d806a6f9ed7b000c753fe589a1e7a`.
- Factory was extracted into an isolated temporary directory. All 935 tracked blob contents matched that exact Git tree. Its dependency lock matched the existing installed dependency tree; dependencies were copied, with 11 relative workspace links verified to resolve inside the exact extracted source.
- Production pricing checks remain unchanged. The selected Factory's canonical card is valid through 2026-10-29; no clock, rate, fixture pricing wrapper or production approval was changed to make this run pass.

## Checks performed

```sh
env -u FACTORY_VERIFIER_CUSTODY_DIR \
  MYEVE_EXTERNAL_ALPHA_TEST_DATABASE=postgres://auth_test@127.0.0.1:55482/postgres \
  MYEVE_EXTERNAL_ALPHA_PRODUCTIVE_FIXTURE=1 \
  MYFACTORY_SOURCE_ROOT=/tmp/myeve-factory-peer-20261023 \
  npm exec --workspace=apps/eve -- vitest run --fileParallelism=false \
  --testTimeout=60000 lib/external-alpha/productive-journey-postgres.test.ts \
  lib/external-alpha/productive-sandbox-test-fixture.test.ts
npm run typecheck
```

Ordinary offline tests: **9 passed, 3 explicitly skipped, 2 suites**, 13.13 seconds. Seven passing journey cases cover the two HTTP binding denials, missing verifier custody yielding PARTIAL, cancellation before delivery, lost queue acknowledgment, ambiguous model transport and corrupt source fencing. Two existing mailbox tests pass. The 3 skipped cases require private verifier custody and are not qualification evidence. Local resources and deterministic model transport are synthetic; no provider/model API or tester request was made. The tests create/drop only randomly named localhost databases; cleanup readback found zero remaining `ea_work_` databases.

Full typecheck, registry, imported routing and executor governance passed: **903 classified sources, UNKNOWN=0**. No application UI/runtime changes require a new browser artifact; the prior QA artifact is unchanged. Evidence: `/Users/jaywest/Myeve/output/productive-http-fixture-20261023/`.

## Holds and follow-up

This is an initial source-pair compatibility result, not a release-wide, installed journey, security-invariant or paid-execution PASS. It does not test or close the separate delayed-identical-request/admission financial hold. In particular, the selected peer's negative test state of CANCELLED does not prove permanent nonadmission after a later configuration change. No historical vulnerability/replay case was rerun.

Factory's pending financial successor changes revocable configuration failure to 503/UNKNOWN. Qualification against that exact reviewed successor will require retaining missing/foreign-owner no-effect assertions while updating the expected response/state to the new fail-closed contract. Do not inherit this older pair's outcome or enable paid Work from it.

The coordinator reported hosted QA CI run 40019649577 failed its Builder packaging lock fingerprint after tests/typecheck passed, and its older Factory peer failed pricing qualification. Those failures are preserved and require separate source corrections. This fixture-only commit does not repair, bypass or certify either CI failure; existing CI peer pins remain untouched.
