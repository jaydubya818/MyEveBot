# Gap #2B — completion planning and Current Truth

Projection implementation and schema-free planning qualification: PASS. Overall Gap #2B: PARTIAL; the separately owned 0053 completion contract and integrated local M1/ER1 journey are not qualified by this dossier. No live authority is requested yet.

Base: f3a5de879ec48a6e65faf9e9dcac9e5441a024c5. Branch: codex/p0-gap2b-projection. Both 0051 and 0052 are unchanged. This work does not create or apply 0053. The completed retained 0052 upgrade evidence is preserved at the original workspace's docs/verification/digital-worker/p0-gap-02-conversation-budget/retained-0052-upgrade/.

## What changed

- Canonical Work projection separates active Run, latest associated Run, Run history and recorded versus productive writer custody. The legacy currentRun alias now means the observed active Run. Unknown current authority fails closed.
- Native active status requires a current read-only NativeRouteAuthority observation, current Work generation/version/control/deadline, common budget state, and matching recorded writer custody. Every action still rechecks authority. Old executor histories remain visible; this native-only change does not assert current executability of legacy executor processes.
- Latest order uses immutable route admission time or legacy execution start time, never a later status update. Unbound legacy route rows with no admission timestamp remain in history with explicit unknown ordering.
- Protected verification is bound to exact candidate, attempt, Work, criteria, profile, base and artifact hashes. A PASS additionally requires a completed job and current matching immutable PARTIAL proof. A newer draft does not erase the failed candidate or failed Result. Local verification never implies Ready.
- Work UI and selected-Work model context render the same currentTruthLines. The inspect path returns the same projection. No active Run is explicitly distinct from no Run history.
- Historical reconciliation does not fabricate UNKNOWN usage. Stored historical accounting is displayed without adding its native subtotal again. The optional additive completion_remaining function supplies held capacity when installed; absence on 0052 is unknown capacity, not a zero-cost grant. Available allowance is displayed only for an observed ACTIVE common budget and known exposure.
- Pure completion planning prices explicit implementation, check interpretation, repair, submission and final explanation bounds using the existing conservative maximum-exposure formula. It keeps the Work ceiling unchanged, counts outstanding reserved exposure, refuses unknown usage and unsafe arithmetic, and always returns productiveAdmissionAllowed=false. This planner is not an atomic reserve and must not be used as permission to begin work.

## Preserved failed journey

Regression input is a bounded extraction of the immutable M1/ER1 closure dossier and pre-upgrade filesystem snapshot. It retains the failing candidate, ten evidence records, immutable FAILED proof, revision-6 unverified repair draft and recorded writer. The retained accounting is $0.777654 spent, $0 reserved, no observed UNKNOWN exposure. No failure was rewritten as a successful repair.

The PostgreSQL clone test restores the fresh quiescent 0051 checkpoint into a uniquely named disposable database and applies candidate migrations there. It never connects to golden_auth_127447eb80f3. Projection runs with default_transaction_read_only=on. All 114 post-migration tables have identical row counts and hashes before/after projection. The disposable clone is removed afterward. Original fixture and its 0052 migration were not touched or rerun.

## Checks

| Check | Result |
| --- | --- |
| Active/latest/history A–I semantics | PASS, unit fixtures |
| Failed candidate + unverified repair + immutable Result | PASS, retained fixture and PostgreSQL clone |
| Exact verification binding and repaired PARTIAL fixture | PASS |
| Work UI / selected-Work context formatter parity | PASS locally; authenticated model explanation remains a live gate |
| Conservative completion planning / unchanged ceiling | PASS; planning only |
| Full Vitest | 1,341 passed; 40 skipped |
| Root regression/security | 151 passed |
| TypeScript / registry / skills / governance | PASS; 637 classified sources, UNKNOWN=0 |
| Disposable PostgreSQL projection integration | PASS |
| Read-only retained checkpoint clone | PASS; 114 tables unchanged |
| Common-ledger SQL regression | PASS; races, restricted roles, real process-loss boundaries, controlled-provider wrappers |
| Migration manifest | PASS; 52 migrations; 0051/0052 unchanged |
| Production webpack build | PASS |
| Atomic completion reserve / integrated local M1/ER1 journey | PENDING separate 0053 integration; not claimed here |
| Original retained fixture | STILL PAUSED / untouched |
| Live M1/ER1 | NOT READY from this candidate alone |

## Scope and remaining gate

Runtime changes are confined to read-only projection, its shared UI/context renderer and pure planning. Tests, one SQL regression assertion, the bounded retained fixture and reviewed governance fingerprints account for the remaining changed files. No provider dispatch, writer acquisition, budget change, historical modification, or publication path was added.

The other task reported a newer explicit owner approval for 0053 in attachment 404e066f-a653-481d-a884-bf42a4421b31 and owns that migration. No conflicting migration was created here. Integration must requalify atomic shared completion holds, conservative bounded requests, admission and process-loss/concurrency behavior together with these projection changes. Only after the full local failure → repair → protected verification → PARTIAL journey passes may the minimum fresh provider/payload/spend authority for one authenticated M1/ER1 run be requested. A retained 0053 upgrade requires its own coordinated checkpoint process; this dossier does not perform or authorize it. ER2 and all other Q37 gaps remain blocked.
