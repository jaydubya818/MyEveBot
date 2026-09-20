# Routine admission integration qualification

**ROUTINE ADMISSION INTEGRATION QUALIFIED**

Date: 2026-09-20. This is a local, deterministic integration candidate for review. It does not authorize deployment, migrations on shared databases, provider qualification, or Routine activation.

## Source identity

| Item | Value |
|---|---|
| Integration branch | `codex/routine-admission-integration` |
| Starting main HEAD | `1d20be474e7841871001cf592b8f523a178770e1` |
| Qualified feature HEAD | `396631afa4739e5ca8ac0c5c81781f82f3160403` |
| Merge base | `d6832575ab51542ff7ce8a728b6e3d3774e0ec55` |
| Main-only commits | 16 by identity |
| Feature-only commits | 20 by identity, including its merge commit |
| New integration commits | One qualified reconciliation merge; resulting hash is recorded in the completion reply |
| Final integration HEAD | The reconciliation merge containing this report; exact hash in completion reply |
| Main / source branches | Unchanged |

The [reconciliation audit](routine-admission-integration-reconciliation.md) records the exact graph, every unique commit, patch-equivalent pairs, overlap decisions, and full canonical migration sequence. Both qualified histories are parents of the candidate; neither was squashed or rewritten.

## Migrations

Canonical sequence: **0001–0030**, with no gaps or duplicate numbers.

| Migration boundary | Result |
|---|---|
| Main 0001–0026 | Byte-identical to starting main |
| 0027 Federation | Byte-identical to feature source |
| 0028 Routine reconciliation / pending send | Byte-identical to feature source |
| 0029 Routine admission | Byte-identical to feature source |
| 0030 Action binding reconciliation | New additive approval generation and unique live binding constraint |
| Fresh database | PASS |
| Populated current-main upgrade | PASS |
| Earlier populated 0025 upgrade | PASS |
| No authority backfill | PASS — legacy version remains NEEDS_APPROVAL with `canRun=false` |

0030 is necessary because feature source had extended its 0026 after main committed a different 0026. Main's migration is not rewritten. The fresh suite applies all 30 migrations. The new upgrade scenario applies canonical main through 0026, seeds 12 canonical state groups, then applies 0027–0030 using main's SQL statement splitter.

Upgrade assertions preserve Agent identity, Run state, Action IDs/bindings/status/provider receipts, approval decisions, Action receipt history, Routine definitions/versions/occurrences, Browser Profiles and grants, Computer sessions and control leases. It also seeds a Federation grant after 0027 and a saved pending draft after 0028 and proves subsequent migrations preserve both. It checks nullable receipt columns, blocked-only null Run, deferred owner/Run FK, and duplicate-live-binding rejection.

No shared/Production migration ran. A later rollout must apply all four new migrations in order while execution remains disabled. Conflicting live bindings intentionally fail 0030 without discarding possibly transmitted Actions. Databases using the feature variant of 0026 need explicit schema reconciliation; they are not the tested canonical-main upgrade path.

## Admission, security, and reliability

| Gate | Result |
|---|---|
| Admission engine | PASS |
| Immutable capability ceiling / version binding | PASS |
| Permission distinct from availability | PASS |
| Required vs optional capability semantics | PASS |
| Provider/account-aware readiness | PASS |
| Blocked precheck uniqueness and receipt | PASS |
| No-model preflight | PASS |
| Optional delivery degradation | PASS |
| Dynamic disconnect / reconnect without replay | PASS |
| Race revalidation | PASS |
| Action Gateway enforcement and exact approval | PASS |
| Browser semantic-effect enforcement | PASS |
| Federation double authorization / privacy / identity isolation | PASS |
| Opaque MCP remains blocked | PASS |
| Delegation / Routine ceiling | PASS |
| Owner and Agent profile grants | PASS |
| Occurrence uniqueness / renewable claims / heartbeat | PASS |
| Retry/backoff / auto-pause / bounded catch-up | PASS |
| Execution distinct from delivery | PASS |
| Pending-send continuation without repeated research | PASS |
| Provider inspection and owner recovery decisions | PASS |

Provider disconnect, authority revocation, Agent disablement, profile grant revocation, global kill and budget exhaustion remain fail-closed. Live effects use executor-time checks even after admission. The deterministic Browser suite denies semantic email/send, publish, deploy, delete and purchase bypass attempts. Opaque tools and unqualified delegated/federated executors cannot expand a Routine's approved tool set.

The isolated PostgreSQL suite preserves the same Run and saved draft across exact approval, consumes the one-use handle once, rejects changed/replayed authority, and resumes only the pending send. All sends/provider behavior in these scenarios are simulated. No real research/model/provider invocation was used.

Main's Owner Data export still labels executable history as non-restorable and requires fresh owner review on restore. Admission/preflight receipts are added to that existing owner-scoped export; they cannot restore authority. Main's Control Center/Approval Center safe projection, Computer API error handling, file ownership repair, and complete Owner Knowledge client-safe type boundary are preserved.

## Routine classes

Actual results from the final candidate's canonical-registry, provider-free local qualification fixture with reviewed synthetic Sarah/Ava authority:

| Class | Readiness | Execution |
|---|---|---|
| Daily Brief | READY technically | `canRun=false` |
| Weekly Goal Review | READY technically | `canRun=false` |
| Stalled Work Review | READY technically | `canRun=false` |
| Research Digest | READY technically | `canRun=false` |
| Competitor Monitor | READY technically | `canRun=false` |
| Campaign Performance Review | BLOCKED — Routine workspace binding unsupported | `canRun=false` |
| Draft Follow-Up | NEEDS_CONFIGURATION — email provider/account unavailable | `canRun=false` |
| External Follow-Up Send | NEEDS_CONFIGURATION — email unavailable; exact send approval also required | `canRun=false` |

These are fixture-backed technical eligibility results, not claims that existing owner definitions or shared deployment providers are configured/reviewed. Each legacy/unreviewed definition must still pass owner review. Optional notification unavailability retains the in-app result. No class was activated.

## Qualification counts and builds

| Gate | Actual result |
|---|---|
| Full unit suite | **591 passed**, 86 files |
| Core contracts | **134 passed** |
| Admission tests | 69 unit cases, included in full total |
| Federation tests | 51 unit cases plus the isolated SQL Federation/Gateway scenario |
| Gateway tests | 17 authority/recovery/route unit cases, 5 additional approval cases, and SQL executor/recovery/coverage matrices |
| Routine reliability / continuation | PASS — full isolated SQL suite plus existing unit contracts |
| Browser effects | PASS — 8 Routine graph/effect cases plus existing executor/Computer suites |
| Database | PASS — 3 executable scenarios: fresh integration, populated 0025 upgrade, populated current-main upgrade |
| Migration order | PASS — 30 ordered migrations |
| TypeScript | PASS — Eve and Builder |
| Root typecheck | PASS |
| Capability Registry | PASS — 135 definitions, 99 authored tools |
| Skill routing | PASS — 93 checks; 50/57 rank one (87.7%) |
| Builder manifest | PASS — 146 prunable files, all claimed, template release 255 |
| Eve production build | PASS — normal Turbopack build |
| Builder production build | PASS — normal Turbopack build |
| Provider-free generated build | PASS — local webpack production build and boot |
| Desktop | PASS — 1440×1000 |
| Mobile | PASS — 390×844 |
| Source hygiene | PASS |
| Secret scan | PASS |

Executor inventory regenerated from final cumulative source:

| Classification | Count |
|---|---:|
| ENFORCED | 33 |
| BLOCKED | 89 |
| READ_ONLY | 37 |
| INTERNAL | 330 |
| NOT_APPLICABLE | 26 |
| UNKNOWN | **0** |
| Total | **515** |

The new total includes main's additional internal modules; counts were not copied from feature qualification. Fingerprints were regenerated after conflict review and checked against every inventoried source.

Generated deployment: 871 files, synthetic owner Sarah and primary Agent Ava, only Goals/Knowledge features, no email/Telegram/Phone/Federation credentials, and no test or qualification files. Local boot returned `/login` 200 and protected `/manage/routines` 307. A build-environment symlink limitation was resolved with local dependency copies; no source build bypass, dependency version change, or provider configuration was needed. Main's pinned Raindrop 0.8.0-otelv2 and lockfile are preserved.

UI qualification uses the final candidate's actual Routine component with isolated synthetic API data and no writes. All six states render; all Run Now buttons remain disabled with linked explanations. Expanded capability details and filters work; controls are labeled, keyboard focus is visible, and horizontal scroll width equals the viewport at desktop and mobile sizes. Screenshots were visually inspected. The only browser console error was the local fixture's missing favicon, not an application failure.

Reproduction commands from the integration worktree:

```sh
npm run test --workspace=eve-agent
npm test
node --import tsx apps/eve/test/execution-reliability.integration.mjs
node --import tsx apps/eve/test/action-upgrade.integration.mjs
node --import tsx apps/eve/test/routine-integration-upgrade.integration.mjs
npm run db:migrations:check
npm run typecheck
npm run build
node apps/eve/scripts/qualification-routine-admission-ui.mjs
git diff --check
```

Database scripts pin PostgreSQL to loopback port 55441 and drop temporary schemas. Generated build and UI harnesses use temporary directories. They do not consume deployment environment credentials.

## Operational state and cleanup

| State / activity | Result |
|---|---|
| Global Routines | **DISABLED** |
| Federation | **DISABLED BY DEFAULT** |
| Phone | **DISABLED / UNQUALIFIED** |
| Real model calls / real provider qualification | 0 / NOT RUN |
| External sends | **0** |
| External qualification resources | **0** |
| Shared/Production mutation | **NONE** |
| Deployment | **NONE** |
| Merge into main / source history rewrite | **NONE** |
| New accounts / credentials / provider connections | **NONE** |
| Worktree | Clean after qualified reconciliation commit |

Temporary database schemas, UI/generated-app servers and browser session are cleaned up; the isolated PostgreSQL instance is stopped. Temporary harness/generated artifacts are removed. Safe source tests and reports are retained. Ignored dependency/build caches remain local to the integration worktree for review.

The completed candidate is committed locally for review; no remote branch publication or PR is required by this work order. Final commit identity is provided in the completion reply. **Stop here: no activation, merge to main, deployment, shared migration, or next feature.**
