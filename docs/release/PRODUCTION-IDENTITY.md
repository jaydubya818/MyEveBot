# MyEve production identity

Recorded 2026-10-20 (Pacific) from Vercel and the production migration ledger. Re-verify before relying on it.

## Live production (`sofie-personal-agent`)

| Field | Value |
|---|---|
| Deployment | `dpl_9hQD9NRv538UsYdzyEHgD9kJ7wqh` (`sofie-personal-agent-bgpf0z57n-jaydubya818.vercel.app`) |
| Created | 2026-10-17T18:11:15Z, Vercel CLI (`jaydubya818-1002`) |
| Source commit | `1582df4ab8264e24bd2a2bf9a894ae5fd678b46e` "Fix login navigation when browser storage is unavailable" |
| Source branch | `codex/sofie-login-storage-quota-20261017` (local only, never pushed). The commit is preserved on `origin/codex/production-readback-errors-20261020`. |
| Lineage | `origin/codex/unified-beta-myeve-20261011` (tip `38def710`) + 1 commit |
| Role | Unified beta used by the owner and both external testers |

## Production schema

`sofie_schema_migrations` has 102 rows, newest `0107_factory_preparation_generation_guard.sql`.

- `0082` applied 2026-10-05; `0083`, `0084` applied 2026-10-14. Checksums are identical to `main`.
- `0085`–`0107` applied 2026-10-14 from the unified-beta line. All 23 checksums match the files at `1582df4`. None of them exist on `main`.

## `main` is not deployable to this production

`main` (`252d4c8f`) is not an ancestor or descendant of production. The unified-beta line starts from an orphan snapshot commit `d0ecbfa4` ("MyApps offline composition rehearsal… Not an adopted release; no branch merge"). That snapshot is built from integration commit `afa65bd4` plus the #72 preparation `5802d785`.

`0099` adds write-guard triggers to tables that `main` writes (`engineering_route_runs`, `engineering_execution`, `engineering_model_calls`, `engineering_direct_workspaces`, `engineering_direct_verification_jobs`, `engineering_factory_requests`, `engineering_native_results`). `0092` replaces the `engineering_owner_decisions` action CHECK and adds a guard trigger. `0101`–`0107` replace those guard functions. Main's write paths are untested against these guards.

Do not release `main` to production until the unified-beta line is reconciled into `main` (see `unified-beta-reconciliation-plan.md`).
