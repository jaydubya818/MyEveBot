# Q37 Relay boundary qualification

**Local contract PASS; runtime integration NOT IMPLEMENTED; Q37 BLOCKED.**

Baseline: `1d736975019965864880252219973d096de0288a`. Branch: `codex/q37-integration`. See [assessment](ASSESSMENT.md) for the baseline exception, current-main integration debt, active ownership and all remaining workstreams. Source and evidence fingerprints are recorded in `manifest.json`.

## Implemented and checked

`prepareRelayCollaboration` accepts selected text whose SHA-256 matches the trusted caller's approved disclosure. It binds owner, Sofie identity, exact Work revision/generation, peer, grant revision, request ID and deadline. The outbound body contains only that selected text. Both text and replies are bounded to 4,000 UTF-8 bytes. There is no memory lookup or enumeration interface.

`observeRelayCollaboration` requires current Work and grant readback plus a transport-authenticated peer identity supplied separately from the untrusted response. It rejects stale/revoked/expired authority, changed Work, wrong peer/request/reply identity, malformed and oversized answers. It reuses the existing bounded peer result projector, stripping unrelated remote fields. Delivery acknowledgment is not treated as an answer. Timeout/unsupported outcomes remain UNKNOWN for same-request reconciliation. An exact serialized prior receipt suppresses duplicate attachment; a different answer for the same request is rejected.

Returned receipts retain exact Work/request/peer/grant/disclosure provenance and answer hash with `ADVISORY_ONLY` trust. Peer instructions do not grant local permission, writer custody, publication, or verification. A later revocation prevents further consumption without erasing existing history.

## Validation

| Check | Result |
|---|---|
| New Relay fixture and existing peer, Factory observation, GitHub adapter/App, learning unit tests | 57 PASS across 6 files |
| App TypeScript (`tsc --noEmit --incremental false`) | PASS |
| Migration manifest (`migrate-database.ts --check`) | PASS, 53 ordered migrations; none applied |
| Executor governance | PASS after approved additive entry: 639 classified sources, UNKNOWN=0 |
| Existing governance entries | All 638 preserved exactly; removing the insertion recovers the original inventory bytes |
| Diff whitespace | PASS |
| Live provider / authenticated Sofie / reciprocal Relay / shared database | NOT RUN |

Commands run from `apps/eve`:

```sh
../../node_modules/.bin/vitest run lib/engineering/relay-collaboration.test.ts lib/relay/message-result.test.ts lib/engineering/factory-observation.test.ts lib/engineering/github-app.test.ts lib/engineering/github.test.ts lib/digital-worker/learning.test.ts --reporter=verbose
../../node_modules/.bin/tsc --noEmit --incremental false
node scripts/migrate-database.ts --check
node --import tsx scripts/check-executor-governance.ts
```

Provider/config: synthetic identities and time only; no .env copied, no live keys or grants read, no Relay/MyFactory/GitHub requests from tests. The GitHub App tests inject fake fetch/key material; they do not qualify an installed App. The local `node_modules` links reuse the existing dependency installation without changing it. Runtime: Node v24.18.1. No model spend or provider authority issued.

## Remaining boundary

This is a pure library seam with **no production caller**. `ATTACH` is a proposed receipt, not a database write. Grant/qualification/approval snapshots are trusted-adapter inputs, not cryptographic proof or new authority. The 30-second readback-age ceiling is an additional local refusal rule; it does not replace live grant validation at dispatch/commit. A production adapter must recheck revocation at its effect boundary.

Durable request binding before dispatch, atomic unique receipt attachment across concurrent workers, current-main scoped message delegation, authenticated response verification, Action Gateway binding, automatic bounded polling, cancellation propagation, Current Truth rendering and reciprocal provider qualification remain required. The shared schema and Current Truth services belong to M1/ER1. No new schema or conflicting writer contract is introduced here.

No-babysitting is NOT QUALIFIED. Necessary Human Judgment and Coordination Debt remain separate as recorded in the assessment; no live intervention counts or global safety zeros are inferred from tests. MyFactory candidate handoff, native/Factory publication, CI/review continuation, learning promotion and composite Q37 are still open. Capsules remain conditional and untouched.

## Shared inventory decision

The user explicitly approved the single Q37-owned `INTERNAL` entry in `governance-entry.json`. It was added only to this branch's inventory, with no removals, replacements, reclassifications, renames or changes to existing entries. `governance-addition.json` records the parent commit, inventory hashes and preservation checks. Governance and all 57 affected tests were rerun and passed after the addition. Type checking and migration results above remain from the unchanged implementation source.

Protected worktrees and their inventories were not modified. The previously rejected cross-task coordination message was not retried, and no further information was shared with that task. No live qualification was performed.

## Next independent P0 capability

MyFactory candidate/evidence return validation is the next bounded independent capability: bind the return to the exact submitted request, MyEve Work revision/generation and Factory WorkOrder; validate candidate/artifact identities and provenance; reject duplicates with conflicting content, stale returns, cancellation and timeout/UNKNOWN ambiguity. Start with a synthetic contract fixture and retain MyEve ownership and independent verification. Stop before dispatch, writer handoff, shared schema or Current Truth changes owned by M1/ER1. This recommendation is not implemented by the governance-only approval.
