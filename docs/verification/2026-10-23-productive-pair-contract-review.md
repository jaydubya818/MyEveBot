# Independent review — productive pair contract fixture

Date: 2026-10-23 (America/Los_Angeles)

**Verdict: no blocker found in this fixture-only contract update. Factory qualification and the financial hold remain OPEN.**

## Scope

Reviewed `codex/productive-pair-contract-20261023` in `/tmp/myeve-auth-password-management`, against `59596b6773a159397d278433b1a23bde44337126`. Only `productive-journey-postgres.test.ts` changes: it records actual HTTP status codes and updates the two ordinary missing/foreign-owner capability-binding expectations.

The provisional peer is `e16a93890c2318067465a5f2394719e3f4d913f4`, at `/tmp/myeve-factory-successor-peer-20261023`, source identity `860123a5699dac23d8711b106315416e40ec6519644479d30c15c43566072587`. The peer is explicitly **not finally qualified**; installation/operator configuration and not-yet-valid refusal work remains separate.

## Findings

The changed tests match the inspected provisional response contract: one HTTP 503 is treated as an ambiguous dispatch outcome. Assertions now require:

- Exactly one HTTP POST and no HTTP reads, with `EXTERNAL_ALPHA_DISPATCH_UNKNOWN`.
- UNKNOWN local authority, local allowance, central admission and central dispatch.
- The exact 1,300,000-microusd reservation retained in the local allowance and central admission, with no terminal settlement.
- Zero Factory intake/authority rows, queued delivery, allocation and deterministic model transport calls.

These strengthen the observation of the one-attempt outcome without claiming later permanent nonadmission. A retained reservation at this observation is not a substitute for proof of the broader financial invariant.

The existing owner-binding/digest construction, real HTTP configuration loader, restricted transaction-role setup and positive cases remain unchanged. Foreign-owner setup still recomputes the digest, isolating the ownership mismatch from a bad digest. Status collection stores numeric codes only and leaves handler responses untouched. Existing private-custody skips remain visible.

No runtime, accounting, pricing, grant, migration, credential, CI peer pin or tool-enablement code changes. The branch retains its nondeploying guard.

## Independent execution and inspected evidence

Independently ran only the two ordinary binding cases from `apps/eve`:

```sh
env -u FACTORY_VERIFIER_CUSTODY_DIR \
  MYEVE_EXTERNAL_ALPHA_TEST_DATABASE=postgres://auth_test@127.0.0.1:55482/postgres \
  MYEVE_EXTERNAL_ALPHA_PRODUCTIVE_FIXTURE=1 \
  MYFACTORY_SOURCE_ROOT=/tmp/myeve-factory-successor-peer-20261023 \
  /tmp/myeve-auth-password-management/node_modules/.bin/vitest run \
  --fileParallelism=false --testTimeout=60000 \
  --testNamePattern 'handler capability binding' \
  lib/external-alpha/productive-journey-postgres.test.ts
```

**2/2 selected cases passed, 3.36 seconds, exit 0.** Eight other cases were filtered/skipped by this selected run. Existing fixtures created and cleaned disposable localhost databases; no live provider, production data or private verifier custody was used.

Also inspected the implementation agent's evidence under `/Users/jaywest/Myeve/output/productive-pair-contract-20261023/`:

- `ordinary-contract-tests.log`: **9 passed, 3 private-custody cases skipped, two suites, 12.92 seconds, exit 0**.
- `typecheck.log`: full typecheck passed; **903 classified sources, UNKNOWN=0**; routine activation disabled.
- `ordinary-source-pair.json`: selected provisional source/digest, final qualification false, financial hold OPEN, and zero paid operations/production writes/delayed-request reproductions.

The independent selected run overlaps that broader run and must not be added as unique tests. `git diff --check` passed.

## Limits

This review exercised only ordinary one-attempt configuration failures. No flagged delayed-request, refund, replay or financial/security demonstration was run. It does not close the financial hold, qualify the peer's remaining refusal paths, substitute for the skipped private-custody journey, change CI pins or authorize a production rollout. Requalification must use the exact later reviewed final peer.

Reviewer changes were limited to these reports; application/test source was not edited. No production credentials, tester sessions, private custody, live provider or external messaging was accessed.

Fixture Git blob: `c41c6a0a44ec99c026a185431497e9132deacfc2`.
Fixture SHA-256: `79daa13fa6acbb1a71b0f37bdc83c14c58df6adfcc8f4921e19a9b24b59c4186`.
