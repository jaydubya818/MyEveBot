# MyFactory candidate and evidence return contract

**Synthetic/local contract PASS. Overall MyFactory integration PARTIAL. Q37 remains BLOCKED.**

MyEve baseline: `3c030bc364bd0ff787053b855994b21fc86f7a74`, branch `codex/q37-integration`, existing isolated worktree. MyFactory source: `543906dc20fefed2def97e43953095ea0b7c60bc`. Schema: inherited MyEve migration sequence through 0053, unchanged; no database accessed or migration applied. Provider/config: deterministic synthetic fixture and source/config pins only. Exact source/evidence hashes are in `manifest.json`.

## Qualification matrix

PASS below means the bounded synthetic contract at the recorded source fingerprints, not a running integration.

| Required finding | Result |
|---|---|
| MYFACTORY CONTRACT | **PARTIAL overall — synthetic/local PASS; transport/runtime missing** |
| REAL SOURCE INSPECTED | PASS — clean pinned source, actual receipt/Run/Check/events/API inspected |
| REQUEST CONTRACT | PASS — same hosted request ID; local Work/objective/criteria/base/scope/source/config/policy/budget binding |
| RETURN CONTRACT | PASS — strict bounded local envelope using actual Factory fields; no invented provider attestation |
| WORK LINKAGE | PASS — owner/agent/Work/version/generation/criteria and exact request/WorkOrder checks |
| FACTORY VERSION BINDING | PASS for explicit local source/config pin; real exported attestation MISSING |
| CANDIDATE IDENTITY | PASS against independent local commit/tree/patch/changed-path pins; full Git transfer/reconstruction deferred |
| ARTIFACT INTEGRITY | PASS — byte-bound copies, SHA-256, exact references; unbound extra artifacts denied |
| EVIDENCE PROVENANCE | PASS — Run/attempt/candidate/check/time/model/agent-version/skill/config bindings |
| FACTORY CLAIM ≠ PROTECTED VERIFICATION | PASS — FACTORY_REPORTED; independent verification always NOT_RUN; NOT_READY |
| DUPLICATE SUPPRESSION | PASS for sequential serialized replay; concurrent durable uniqueness deferred |
| STALE RESULT HANDLING | PASS — wrong Work revision denied; superseded/paused/taken-over/cancelled returns historical |
| UNKNOWN OUTCOME | PASS — accepted-response loss, unavailable return and possible-completion timeout retain the same request; no automatic resubmit |
| CANCELLATION CONTRACT | PASS for local intent/stopping/terminal-reported/unknown; no remote cancellation qualification |
| FACTORY-GRANTED AUTHORITY | **0 in exercised synthetic fixtures** |
| FALSE READY | **0 in exercised synthetic fixtures** |
| GOVERNANCE | PASS — only two new INTERNAL sources; all 639 existing entries preserved exactly; UNKNOWN=0 |
| LIVE MYFACTORY | **NOT_RUN** |

## Golden contract

`golden-fixture.json` represents one MyEve Work W, local source/config pin F1, WorkOrder WO1, Run attempt A1, exact candidate C1, two reported checks E1/E2 and a patch plus two log artifacts. Git-format fixture commit identities are deterministic. No coding worker or check process produced those logs; they explicitly say synthetic.

`golden-outcome.json` records the actual parser result:

- Work/request/Factory pin/candidate/provenance/artifact checks pass.
- First result: RECEIVED, with a bounded MyEve-local custody receipt.
- Serialized replay: DEDUPED; local fixture retains one candidate.
- Late completion after cancellation intent: HISTORICAL / non-authoritative.
- Factory evidence: FACTORY_REPORTED, with MATCHED_LOCAL_PINS integrity.
- MyEve independent verification: **NOT_RUN**.
- MyEve readiness: **NOT_READY**.

No current Work, writer, budget, protected verifier, Result or Current Truth is mutated. `RECEIVED` means the pure function returned validated data; there is no production caller or database insert.

## Validation

Final results: **139 tests passed across 8 files** (78 new Factory contract cases); full app TypeScript PASS; governance PASS (**641 classified sources, UNKNOWN=0**); migration manifest PASS (**53 ordered migrations**, none applied). Diff whitespace is checked before commit. The suite includes Factory adapter authority-denial tests with mocked fetch/token providers, existing signed intake observation, Relay regression, GitHub adapter/App mocks and learning regression. No tests invoke a live Factory, Relay, model or GitHub provider.

From `apps/eve`:

```sh
../../node_modules/.bin/vitest run lib/engineering/factory-return.test.ts lib/engineering/relay-collaboration.test.ts lib/relay/message-result.test.ts lib/engineering/factory-observation.test.ts lib/engineering/github-app.test.ts lib/engineering/github.test.ts lib/digital-worker/learning.test.ts agent/lib/myfactory.test.ts --reporter=verbose
../../node_modules/.bin/tsc --noEmit --incremental false
node --import tsx scripts/check-executor-governance.ts
node scripts/migrate-database.ts --check
```

Adversarial coverage includes wrong/rehashed Work, owner/agent/generation/criteria changes, wrong Factory/source/config pin, missing FactoryVersion, unknown request/WorkOrder/attempt, wrong base/repository/scope, coherent candidate substitution, patch/log digest changes, duplicate artifacts/checks, invalid provenance/timestamps/order, missing checks/logs/digests, contradictory PASS, returned READY/authority/lease/verification fields, malformed blockers, unknown outcomes, superseded attempts, replay/conflict and cancellation races. Source-matched defect reproduction/check ordering is also exercised.

The new governance entries are only `lib/engineering/factory-return-contract.ts` and `lib/engineering/factory-return.ts`. Removing their insertion recovers the prior inventory bytes exactly; proof and hashes are in `governance-addition.json`. No existing source fingerprint, classification or reason was changed.

## Ownership and next boundary

Main and protected M1/ER1/Gap #2B worktrees were inspected read-only and not modified. The M1/ER1 qualification branch was observed at `b4801cb`; Q37 stayed on its explicitly requested `3c030bc` baseline. The hosted MyEve worktree's tracked-status check timed out and was treated as protected. No protected migrations, fixtures, Action Gateway semantics, provider configuration or Current Truth were changed. No cross-task coordination message was sent.

**Stop boundary: C — requires another independent missing capability.** The actual hosted receipt does not transport candidate/evidence/artifact bytes or FactoryVersion attestation. Connected-client detail readback is narrower than a complete scoped artifact-return API; current diff/check-log routes are browser routes. A bounded authenticated return/export capability must be established before live return qualification.

**B is also required before production dispatch:** the M1/ER1 owner must supply writer-handoff, durable custody/current-Work fencing and independent verification integration. Real agent cancellation is additionally absent: current run.cancel is human-only and lacks an exact-attempt compare-and-set parameter. None of these boundaries was crossed. **A is not reached.**

See [real source crosswalk](SOURCE.md) for REUSE / ADAPT / MISSING / DEFER decisions and precise integration interfaces. Relay remains a separate Agent collaboration contract; Factory is not routed through it.

Necessary Human Judgment: choosing bounded production scope and approving consequential actions remains explicit. Coordination Debt: automatic return/artifact observation and recovery are still missing. Live counts/minutes remain UNKNOWN; this fixture demonstrates deterministic consumption/replay, not no-babysitting qualification.
