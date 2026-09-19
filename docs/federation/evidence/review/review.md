# Independent PR #3 review — 2026-09-19

Mechanism: a separate Codex AI reviewer (`/root/independent_pr3_review`) started with fresh context, independently inspected the actual diff and canonical dependencies, and ran controlled reproductions. It used security, TypeScript, performance and simplicity review perspectives. This is an actual completed AI PR review, not a human approval or the separate production security review.

Original base: `4d3f1eb685422fc77296cef245e84c5b09da6e91`.
Original head: `e96fc2edee827fd6a6d50a1eca02ae30293ab9a3`.
Fix commit: `a7182edf9111203b69e604374894740724db2931`.

Bugbot remains **NOT_RUN**. Its manual trigger returned “Bugbot is disabled for this repository.” The dashboard showed 0/0 repositories for this organization and offered global activation or activation for three other repositories. No usable MyEve-only activation was exposed; neither broader control was enabled. The user's authorized fallback was used.

| Finding | Classification | Resolution |
| --- | --- | --- |
| P1: Tiny work budgets reach paid model invocation; rejected output omitted known cost | VALID_BLOCKING | Conservative metadata-based estimated-cost admission before paid execution; reject unavailable/invalid pricing; persist known incurred usage before validating output/cost |
| P1: Delayed publication confirmation overwrites local pause/revocation | VALID_BLOCKING | Activation CAS requires sync_required; concurrent pause/revocation remains closed; no false activation activity |
| P2: Approved canonical Run remains awaiting_approval during accounting | VALID_BLOCKING | After exact gateway authority and fresh Relay authorization, transition to running before model invocation/accounting |
| P2: Approval Center decisions/crash after canonical approval strand federation work | VALID_BLOCKING | Reconcile existing exact action approval via action_requests.approval_id; normal gateway revalidates; bounded polling resumes approved decisions |
| Follow-up P2: Crash after accepted CAS strands an untouched request | VALID_BLOCKING | Bounded accepted-claim recovery through existing begin CAS; processing stays fenced |
| Follow-up P2: Pricing/DB latency leaves a stale deadline check | VALID_BLOCKING | Five-second pricing lookup timeout; metadata precedes fresh authorization; expiration checked immediately before model invocation |
| Unbounded acknowledgement retries | VALID_NON_BLOCKING | Ordered batch limited to ten |
| Architecture instruction named migration 0025 | VALID_NON_BLOCKING | Corrected to 0027; historical action-executor migration reference retained |
| Broad any types at database/network boundaries | VALID_NON_BLOCKING | Maintainability observation only; no demonstrated vulnerability; deferred instead of broad refactor |

No findings classified FALSE_POSITIVE, ALREADY_COVERED or REQUIRES_HUMAN_JUDGMENT. The reviewer independently rechecked the changes and concluded: all four original findings and both follow-up gaps resolved; no remaining actionable blocker in the fixes.

Reproduction: exact original function bodies with controlled DB/provider latency reproduced both publication orderings, zero accounting, tiny-budget overspend and Approval Center lockout. The committed 12 regression tests all fail against the original source and pass with fixes. They cover pause/revoke, admission/accounting, deadline, exact decision conflicts, polling and accepted recovery. Unit orchestration doubles do not replace the separate real ActionGateway forged-handle regression or live proof.

Validation on fix commit: 482 Vitest (48 federation), 130 Node, typecheck/governance (502 classified sources, UNKNOWN=0), migration checker (27), normal production build; 42/42 actual network MyEve/Ava live checks. The live report names the fix SHA and records one canonical model step and provider cost rounded to the canonical numeric(10,4) precision. Fresh/0026 upgrade/0027 idempotency and both canonical database recovery suites pass. Relay compatibility remains the previously passed 17 checks; no Relay changes or protocol changes.

Harness corrections: migration qualification now extracts the immutable approved base, because the unrelated canonical checkout advanced externally. An initial assertion incorrectly compared four-decimal canonical accounting to higher-precision provider cost; corrected to exact canonical precision, then reran all live checks. Initial sandbox IPC/port failures were rerun with normal local process permissions; no test/check was bypassed.

Estimated-cost admission uses Gateway model metadata, UTF-8 text byte bound plus framing allowance, fixed 800-token output ceiling and 2x margin. This is not a provider-enforced hard billing cap. Unknown provider usage remains verification/recovery required, never reported as successful zero-cost work. A contractual billing guarantee remains outside this PR and relevant to production security review.

Hygiene: disposable containers/keys/credentials destroyed; host debug logs and temporary environment file removed. Retained evidence contains non-secret receipts, checksums and test results only. No canonical private records, qualification stores or credentials are committed. Federation still requires MYEVE_RELAY_ENABLED=true explicitly; migration 0027 only adds empty tables/indexes, with PRIVATE publication default. No automatic enrollment, publication or grants. Relay was not modified. No merge or production deployment performed.

Production gates remain separate: independent federation security review NOT_RUN; production Agent-platform qualification NOT_RUN. This PR review does not replace them. Human GitHub reviews remain none; no branch protection/review requirement is configured on codex/openbot. Remote CI/Vercel must pass on the final evidence head before READY_FOR_MERGE.
