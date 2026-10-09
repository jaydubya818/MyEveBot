# Attempt-8 numeric range escape and successor preparation

## Conclusion and public decision

The original issue, Work criteria and public output artifact specified positive integer quantities but no numeric upper bound. The implementation parsed decimal text through `Number` without a safe-range check. Large integers could round or serialize as null. Both implementation-visible checks and protected verification omitted precision/range boundaries; the latter used positive integer inputs of at most three digits. Downstream independent review correctly rejected the candidate. This is a permanent verification-corpus regression, not a reason to weaken review.

The owner explicitly clarified the contract on 2026-10-02: integer quantities from **1 through 9007199254740991 inclusive**. Reject larger values even when a particular value is exactly representable as a Number. Invalid input emits exactly `{"error":"invalid_quantity"}\n`, exit 0, empty stderr. Valid output is compact JSON with exactly one terminal LF. Input whitespace is trimmed; the established decimal text interface remains unchanged.

Public prerequisite branch: `codex/quantity-safe-integer-contract`, commit `0d61cf7cbad18831543ae93f118f18595d2a0be2`, tree `2309869f617a010df39ad53a94640218a6a7f536`. It contains only specification/tests and no quantity implementation. The old base branch remains pinned at `7380d3324224a5660daa1556384c7a1a17d7d21e`.

## Qualification

- Public corpus: 16 byte-exact cases plus implementation presence = 17 tests. Includes minimum, MAX_SAFE_INTEGER, MAX_SAFE_INTEGER+1, 9007199254740993, huge integer, zero, negative, decimal, malformed, blank and whitespace/newline variants.
- Captured Attempt-8 source fails four new public cases. Deterministic test control passes 17/17.
- Independent protected corpus covers 11 boundary classes with separate inputs; the real offline Docker verifier rejects the old source and passes the control 11/11. Inputs remain host-side and are absent from the approved producer snapshot.
- Independent review regression detects unsafe, rounded and null output and accepts the safe-range control. No review was rerun or relabeled against the historical candidate.
- Factory installed-CLI checkpoint regression: 4/4 (first-check success, bounded repair, repeated failure, scope violation), loopback synthetic Responses only.
- Connected MyEve/Factory qualification: 26/26, including captured-source checkpoint failure, bounded repair, read-only completion, exact checked-tree commit, signed custody, Gate C/B, protected verification, Result/Proof/final explanation, UNKNOWN, cancellation, stale admission and duplicate dispatch. Additional real model operations: 0; concurrent writers, duplicate dispatches, false Ready and unauthenticated admission: 0.
- MyFactory suite 173 pass, 9 optional integrations skipped; required new installed-CLI integration was separately run. MyEve root suite 145 pass, 2 optional protected checks skipped by default and separately run; application suite 1992 pass, 94 optional integrations skipped. Typecheck, governance and build passed for both repositories.

The deterministic control is a test fixture, not a produced successor candidate. Test success does not establish CI, independent review or owner acceptance for a future candidate.

Required commands:

```
# MyFactory
npm test
FACTORY_INSTALLED_CLI=1 node --test apps/supervisor/test/numeric-range-checkpoint.test.mjs
# MyEve
QUANTITY_PROTECTED_CORPUS=1 node --import tsx --test apps/eve/test/numeric-range-protected.test.mjs
FACTORY_NUMERIC_RANGE=1 FACTORY_SPEND_FIXTURE=1 FACTORY_INSTALLED_CLI=1 MYFACTORY_SOURCE_ROOT=<qualified-checkout> node --import tsx apps/eve/test/factory-live.integration.mjs
```

## Historical preservation and canonical successor

Attempt-8 Work `b1e4e5cf-f0d5-45b1-97d3-d4a113bd09fb`, candidate `1253fcbd5a4e11d72f8ee43c7025b0729d9fa298`, tree `ddcb301db219a744fe741d745f85a97da8a3cd22`, draft PR #2 and base are unchanged. Readback: one candidate branch, one draft PR, historical verification PASS, GitHub CI PASS, independent review FAIL. Current Result remains PARTIAL; Ready false; owner acceptance NOT_RUN. Immutable Proof digest remains `c521dae2e59c14cc78bf16988754cf2ca06bdc4c7d2f177ecf35c5e42eb0857e`. No historical evidence was rewritten.

Use a new canonical Work rather than revise the historical Work's current criteria/profile binding. Paused successor `54af9acf-df9e-4d69-811e-aa886f3a138e`, revision/generation 1/1, records its predecessor in the objective. It has zero model calls, commands and route runs. Its new profile is staged and not activated; the production Attempt-8 profile remains unchanged.

The existing owner publisher binds an exact candidate/Result/Work and has no automatic supersede/close-PR effect. Leave PR #2 open draft and unchanged. A successful successor needs its own exact-tree custody, protected verification and separate owner publication decision, producing its own traceable branch/PR/CI/review evidence. Do not silently retarget PR #2 or infer owner acceptance.

## Bounded authorization gate

Proposed successor: one canonical resume, one candidate attempt, only quantity.mjs, at most 600 seconds from first Sofie reservation; openai/gpt-5.4-mini through project-scoped Vercel OIDC → AI Gateway → OpenAI only. At most 5 model operations: 2 Sofie, 2 productive Factory, 1 read-only completion. Skip unused productive capacity. Maximum $1.35: Sofie $0.30, Factory $1.05; reserves $0.15 final explanation and $0.336864 Factory completion. No fallback, extra attempt, automatic retry or budget reuse after a stop.

Allowed downstream effects: exact-tree local commit, signed custody, independent protected verification, Gate C/B, Result, Proof and final explanation. Publication remains disabled and separately approval-gated. No candidate push, PR creation, merge, deployment or acceptance is authorized by this preparation.

Before a paid operation, require explicit owner approval, exact source/base/profile binding, refreshed pricing/provider eligibility through canonical non-productive preflight and no competing writer. The prepared record itself grants no execution authority. Historical Work is never resumed.
