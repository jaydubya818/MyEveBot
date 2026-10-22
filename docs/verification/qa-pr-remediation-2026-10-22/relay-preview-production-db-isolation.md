# Relay Preview vs Production database isolation (2026-10-22)

**Result: NOT ISOLATED.** Do not treat Vercel Preview as a safe database for PR #40.

Observed 22 October 2026, America/Los_Angeles. Read-only Vercel project metadata for `relay` (`prj_3IRvr9knK5VJcBTgTYMvhv6ixmJK`). No secret values, connection strings, or database rows were printed or stored.

## How Preview would get a database

Runtime resolution is `RELAY_DATABASE_URL ?? DATABASE_URL` (`lib/db.ts`). Vercel Preview runs with `NODE_ENV=production`, so a missing URL fails closed at pool creation rather than falling back to loopback.

## What the QA branch actually inherits

| Finding | Evidence |
| --- | --- |
| No QA-branch database override | `filter_project_envs` with `gitBranch=cursor/qa-relay-remediation-58c5` returned no branch-specific variables |
| Shared Neon host/url records | `PGHOST` and `POSTGRES_URL_NO_SSL` are single encrypted records targeting `production`, `preview`, and `development` with `gitBranch=null` |
| Same Neon store as Production | Those records are integration-store secrets. Additional Neon store secrets exist on the same project; their names were truncated in the inventory snapshot, so they are not assumed safe |
| Dedicated Relay URLs are elsewhere | `RELAY_DATABASE_URL` and `DATABASE_URL` exist only on preview branch `codex/fq-relay-6384519e0e01`, commented as synthetic federation qualification, incomplete, and out of production scope |
| Preview already deployed | READY Preview `dpl_9A416c72oobyfiCA3p5EvukyAXEW` for exact SHA `e1389c0eebb7314244cdd47463fdeed33971bbdf` (`cursor/qa-relay-remediation-58c5`) |

A Preview that inherits Production `PGHOST` / `POSTGRES_URL_NO_SSL` (and any sibling Neon `DATABASE_URL` with the same targets) is not an isolated database. Isolation is therefore **UNSAFE**, not UNKNOWN.

## Guard committed on this branch

`vercel.json` sets `git.deploymentEnabled["cursor/qa-relay-remediation-58c5"]=false` so later Git pushes do not create automatic Previews. This is source configuration only. Existing READY Previews were not cancelled, merged, or replaced. Production aliases were not changed.

The already-READY Preview for SHA `e1389c0e…` remains a hosted risk until an authorized operator deactivates it. This document does not authorize that deactivation.

## What this does not do

- It does not prove Production is unused by that Preview at runtime.
- It does not create a dedicated Preview database.
- It does not authorize merge, Production deploy, tester activation, or secret rotation.
