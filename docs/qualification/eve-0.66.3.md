# Eve 0.66.3 migration qualification

Migration completed on main on 2026-09-24 (America/Los_Angeles). Eve moved from
installed 0.27.13 to 0.66.3, AI SDK to 7.0.114, and Agent Browser to 0.38.1.
The lockfile records the exact dependency graph.

## Changes

- Fixed-ID session clients replace continuation-token client calls across chat,
  voice, scheduled runs and web delivery. Custom channels use `from`/`to` sends.
- Updated dynamic model selection, approval imports, built-in tool imports,
  workflows, instrumentation discovery, and evaluation APIs.
- Retained structured questions explicitly; Eve now makes them opt-in.
- Governed browser wrappers use their existing `browser__*` callable names as
  root tools. This avoids the new compiler rejecting an extension whose original
  tools were all overridden or disabled. Existing browser capability IDs and
  execution gates remain in place.
- The sandbox provider implements prepare/start/resume with durable lifecycle
  identity. Build preparation carries workspace/skill bytes without provisioning.
  Start requires Action Gateway authority; resume reuses a verified owned resource.
  Governed Computer lifecycle controls remain responsible for cleanup.
- Builder manifests and executor inventory follow the migrated file locations.
  The preserved memory writer is classified as gateway-enforced and SQL tested.
- Browser tests found and fixed chat navigation pointing to `/` instead of
  `/chat`, duplicate cancellation requests, and backup export rejecting framework
  continuation tokens in saved stream events. Exports omit those tokens while
  retaining transcripts and rejecting arbitrary secret-bearing fields.
- Voice cancellation requested during initial asynchronous session creation is
  retained until the fixed session is available.

The large file count primarily reflects framework API replacements and browser
wrapper/instrumentation moves. No new database migration or production data
change is part of the framework migration.

## Verification

Passing command output is retained under `output/eve-0.66.3/`.

- 986 Vitest tests, including the SQL-backed memory gateway test.
- 135 root Node contract tests.
- Both workspace typechecks, builder manifest coverage, capability registry,
  93 skill-routing checks, and 555-source executor governance review.
- All 22 SQL integration files exercised across explicitly disposable local
  databases. Fresh schema, historical upgrades, rollback, concurrent claims,
  owner isolation, run rotation, exact approvals and replay were covered.
  Notable suites: 59 Computer resource checks, 28 federation approval checks,
  and 16 conversation lifecycle checks.
- 14 passing Chrome acceptance scenarios: mobile/desktop navigation, Manage, peer permissions,
  uploads, file reload/readback, backups, failure states, and durable chat
  creation/follow-up/reload/question/approval/cancellation. The model and Blob
  boundary are local fixtures; application routes and PostgreSQL are real.
- File isolation checks use the actual browser-uploaded record.
- Eve's final service build and both Next production builds passed. Webpack was
  used for Next because Turbopack rejects dependency symlinks outside the isolated
  source copy. The repository's default bundler setting was not changed.
- Eval discovery passed; paid model-judged evaluation suites were not run.
- One live AI Gateway smoke call to `anthropic/claude-sonnet-5` passed using
  refreshed existing Vercel authentication (30 input / 11 output tokens).

Old SQL tests were aligned with the current canonical initializer, required
current-session binding, explicit tool-approval discriminator, bounded request
deadlines, and 35-migration manifest. Historical migration contents and approval
checks were not weakened.

## Boundaries and remaining release checks

No deployment, production migration, live message send, or live cloud Computer
provisioning was performed. Real microphone/phone and external integrations are
not qualified by the local fixtures. Existing parked sessions from a deployed
0.27 service were not replayed against a new deployment; verify those during a
staged rollout. The old voice continuation token is not treated as a fixed session
ID; old voice transcripts remain available and a new session is started.

Build warnings from the existing noVNC top-level-await bundle and the OTel
package's use of eval remain. Both builds complete successfully.

## Git and recovery

Outstanding local work and every old local branch tip were consolidated into
main, preserving unique work and newer main implementations. All old worktrees
were removed. The remaining working tree is the main checkout.
Unique untracked relay files are retained in `output/worktree-recovery/` with
hashes. Private old worktree environment settings are backed up outside Git,
as documented in that directory.
