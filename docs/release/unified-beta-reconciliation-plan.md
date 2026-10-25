# Plan: reconcile the unified-beta production line into `main`

Status: **DRAFT for owner review. Nothing has been merged.** Prepared 2026-10-20.

## Facts

- Production runs `1582df4` (unified-beta tip `38def710` + 1). See `PRODUCTION-IDENTITY.md`.
- `main` (`252d4c8f`) and production share **no Git history**. Production descends from orphan snapshot `d0ecbfa4`, which was composed from `afa65bd4` (shares history with `main`, base `2ef36402`, Oct 6) plus #72's preparation `5802d785`.
- A 3-way merge using `afa65bd4` as the explicit base (`git merge-tree --merge-base=afa65bd4 252d4c8f 1582df4`) yields **69 conflicted files**: 34 `apps/eve/lib`, 8 `apps/eve/test`, 6 `apps/eve/components`, 4 `apps/eve/app`, plus root, `packages`, `.github`, `docs`, `scripts` and `package-lock.json`. Full list: `unified-beta-merge-conflicts-20261020.txt`.
- Migrations merge without conflict, because `main` has nothing after `0084`.
- Since `afa65bd4`: `main` changed 452 files (+11,782 / −23,458); production changed 481 files (+45,006 / −4,488). Main's ~23k deleted lines need explicit review. Some of them may be code that production still depends on.

## What 0085–0107 change (all applied to production 2026-10-14)

| Migrations | Effect |
|---|---|
| 0085–0090 | External-alpha allowance, Work authority, Work result, shared accounting, dispatch reconciliation, terminal settlement. New tables. 0087/0089 backfill `engineering_native_results` and `beta_result_provenance`. 0088 drops and re-adds a constraint. |
| 0091 | External-alpha chat recovery. Constraint replacement. |
| 0092 | Private result acceptance. Replaces the `engineering_owner_decisions.action` CHECK (adds `accept_private`), adds `response_id`, adds `beta_work_decisions.result_acceptance_binding`, and adds a guard trigger on `engineering_owner_decisions`. |
| 0093 | MyApps runtime (7 tables). This is #68/#72's work, renumbered from their `0085`. |
| 0094–0098 | MissionControl permit bindings, control acknowledgments, control attempts; unified-beta feedback (new tables). |
| 0099 | **Write guards on 7 existing engineering tables** (`route_runs`, `execution`, `model_calls`, `direct_workspaces`, `direct_verification_jobs`, `factory_requests`, `native_results`) plus `engineering_route_runs.missioncontrol_binding`. |
| 0100–0104 | MissionControl alpha admission custody and owner/alpha exclusion. Replaces guard functions and requires READ COMMITTED isolation (`MISSIONCONTROL_ADMISSION_ISOLATION_REQUIRED`). |
| 0105 | MyApps execution-admission trigger on `myapps_receipts`. |
| 0106–0107 | Factory preparation terminal and generation guard (function replacements). |

Main writes 7 of the 8 guarded engineering tables, so the 0099/0104 guards can reject main's writes. This is why `main` is held.

## Held PR coverage

Migration parity is measured by comparing each PR's added migration blobs against production. It is necessary but **not sufficient**: code parity still needs a per-PR `git range-diff` or tree diff during reconciliation.

| PR | Migrations vs prod | Proposed disposition |
|---|---|---|
| #65 owner allowance | 0085 identical | Superseded once code parity is confirmed. Close. |
| #67 Work authority | 0085–0090 identical | Superseded. Close after parity. |
| #71 final QE | 0085–0092 identical | Superseded. Close after parity. |
| #73 canonical pricing fixture | 0085–0092 identical | Superseded. Close after parity. |
| #74 composer focus | 0085–0092 identical | Check its UI fix is in prod. Then close or rebase onto reconciled main. |
| #75 zero-gap QE | 0085–0092 identical | Superseded. Close after parity. |
| #68 MyApps runtime | **different 0085** | Must not merge as-is (number collision). Prod has this as 0093. Close as superseded. |
| #72 MyApps successor | **different 0085** | Same as #68. |
| #69 conversation binding | none | Code-only. Needs diff review against prod. |

## Proposed sequence (each step needs owner OK)

1. **Freeze.** Production stays on `1582df4`. Tag `prod/myeve-20261017-1582df4` was pushed 2026-10-20 so the commit cannot be lost (its branch was never pushed).
2. **Reconcile branch.** Branch `release/unified-beta-reconcile` from `main`. Create one merge commit with parents `main` and `1582df4`, computed against base `afa65bd4`. Resolution policy:
   - production wins for migrations, guarded writers and the admission/custody code;
   - `main` wins for dependency bumps and work production never touched;
   - each `main` deletion since `afa65bd4` is reviewed.
   Update `database-schema.ts` so `requiredDatabaseMigration()` reflects 0107.
3. **Verify against the real schema.** Full CI. Run all suites against a Neon branch of the production database at 0107. A Neon branch is copy-on-write; production is not modified. Deploy a preview bound to that branch and run `smoke:production` against the preview.
4. **Owner review.** Get your OK on the diff, test evidence, and the held-PR closures.
5. **Release.** Merge to `main`, then `vercel deploy --prod` of the exact merge commit. Readiness, `smoke:production`, and the authenticated-owner and foreign-access checks per README. Rollback target: `dpl_9hQD9NRv538UsYdzyEHgD9kJ7wqh`.

Not in scope: activating external-alpha execution, billing, or tester access changes. Those stay behind their own gates.
