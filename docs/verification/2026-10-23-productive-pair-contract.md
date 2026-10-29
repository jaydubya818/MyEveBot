# Ordinary Factory refusal-contract alignment

Source-only fixture update on `codex/productive-pair-contract-20261023`, based on `59596b6773a159397d278433b1a23bde44337126` (qualified packaging correction plus the separately ported restricted-capability fixture). No runtime, accounting, authority, credential, migration, peer CI pin or production setting was changed.

The actual HTTP fixture now records numeric response statuses. Missing and foreign-owner capability bindings each make exactly one request and assert:

- HTTP503 and `EXTERNAL_ALPHA_DISPATCH_UNKNOWN`, with no readback or implicit retry.
- UNKNOWN local authority and local allowance; the original $1.30 nonrefundable reservation remains.
- UNKNOWN central admission and dispatch, with the full $1.30 charge retained and no terminal settlement.
- Zero Factory intake rows, Factory authority rows, queued deliveries, local sandbox allocations or deterministic model-transport calls.

The negative test still supplies the actual restricted runtime role and canonical capability binding. The foreign-owner case recomputes its digest, so the owner check remains meaningful. Positive cases and the three explicit private-custody skips are unchanged. This tests a single ordinary failed attempt; it does not reproduce delayed/refunded/replayed-request demonstrations or prove permanent nonadmission.

## Exact provisional source and results

Factory source: `e16a93890c2318067465a5f2394719e3f4d913f4`; source digest `860123a5699dac23d8711b106315416e40ec6519644479d30c15c43566072587`. All 936 extracted tracked blobs were verified against that tree; copied dependencies retain the unchanged lock and resolve workspace imports within the extracted peer.

With explicit productive-fixture opt-in, private custody unset, and guarded disposable localhost PostgreSQL:

```sh
npm exec --workspace=apps/eve -- vitest run --fileParallelism=false \
  --testTimeout=60000 lib/external-alpha/productive-journey-postgres.test.ts \
  lib/external-alpha/productive-sandbox-test-fixture.test.ts
npm run typecheck
```

Result: **9 passed, 3 private-custody cases skipped, 2 suites**, 12.92 seconds. Full typecheck, capability registry, routing and executor governance passed: 903 classified sources, UNKNOWN=0. Independent review separately ran the two ordinary binding-refusal cases: 2/2 passed. Its report distinguishes those checks from the broader implementation-agent run.

Evidence: `/Users/jaywest/Myeve/output/productive-pair-contract-20261023/`. No provider, production database, tester session/turn, real credential or deployment was used.

## Holds remain open

The selected Factory source is provisional and has not received final release qualification. Temporary installation-disabled/not-yet-valid refusal paths remain the Factory source owner's separate open work. Final source-pair qualification must bind the corrected reviewed head and rerun the ordinary contracts before changing CI peer pins. The delayed-admission financial hold, private-custody qualification and installed/paid execution remain **OPEN**. This passing fixture run closes none of those holds.
