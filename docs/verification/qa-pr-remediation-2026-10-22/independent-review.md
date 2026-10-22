# Independent review — QA integration candidate

Reviewer: same agent as the integration work, against `cursor/qa-main-integration-6ef4` parent `89abd398652d050a2fa8e44c5b2b43ece9262d37` plus this note. This is a second-pass reading of the merged tree, not a rubber stamp of the merge commits. It does not authorize merge or deploy.

## Scope

- Shared-file resolutions among MyEve #91/#92/#94
- Whether unique fixes and regression tests survived
- Relay Preview/Production database isolation evidence
- #93 remaining on the Deep Agent base
- MyFactory #21 pin vs later docs

## Findings

### MyEve #91/#92/#94 candidate — accept for authorized merge decision

`apps/eve/app/chat.tsx` merged without conflict. The integration file contains #91's `performCancelTurn` / `deleteThreadOnServer` / `useReattachNotice` imports and call sites, #92's `data-chat-sidebar` plus `min-h-11` touch targets, and #94's “Send again” regenerate copy.

CI verify lists the union of #91 DOM/silent-failure tests and #94 `qa-medium.test.ts`. Playwright still glob-runs `test/owner/qa-*.spec.ts`, so both `qa-viewport.spec.ts` and `qa-14-bfcache.spec.ts` are present.

Vitest correctly keeps #91's React 19 aliases and per-file `happy-dom` pragma. Taking #92/#94 `environmentMatchGlobs` would have been a silent no-op or a vitest 5 break.

Executor inventory unions the new helpers. `check-executor-governance.ts` reports `813 classified sources` and the SHA256 fields for `lib/error-dedup.ts`, `lib/web-auth.ts`, `lib/chat-stop.ts`, `lib/capability-notice.ts`, and `lib/candidate-decision-fetch.ts` match the files on disk.

Local combined run on this tree: 18 vitest files / 109 tests pass; 7 capability-notice node tests pass; protocol contract PASS; `eve-agent` typecheck PASS including executor governance.

### MyEve #93 — keep off main

Head remains based on `codex/q37-private-alpha-continuation`. It is not an ancestor of this integration branch. README and PR body now say not to merge it to `main`. That matches the designated Deep Agent continuation.

### Relay #40 — do not treat Preview as isolated

Runtime uses `RELAY_DATABASE_URL ?? DATABASE_URL`. The QA branch has no branch-specific values for those keys. `PGHOST` and `POSTGRES_URL_NO_SSL` are single Neon integration-store records targeting Production+Preview+Development. READY Preview `dpl_9A416c72oobyfiCA3p5EvukyAXEW` already exists for `e1389c0e…`. Isolation is **UNSAFE**, not unknown.

The `vercel.json` guard and regression test exist locally as `301ad37` but were not pushed: `cursor[bot]` received 403 on `jaydubya818/relay`. Apply `patches/relay-40-preview-isolation.patch` with a token that can write that repo. Do not cancel the live Preview without a separate operator authorization.

### MyFactory #21 — pin the qualified SHA

Keep consumers on `f00ccd885f70f8e088231be4bd6a2f0775714390`. The successor JSON already says qualification does not inherit. Pin-docs commit `e61ab36` also could not be pushed (403 on `jaydubya818/MyFactory`). Apply `patches/myfactory-21-integration-pin.patch` when write access exists. Do not treat that docs commit as the execution source.

## Residual risks

- Existing Relay READY Preview may still inherit Production Neon host records until an authorized operator deactivates it.
- Sibling-repo patches are evidence in this repository only until they land on those remotes.
- This review did not re-run Playwright locally (no browser install in the worktree). Hosted `owner-fixture-playwright` later passed on this integration SHA and on #94 restore SHA `67a29071`.

## Hosted CI (recorded after the first review note)

| Identity | Checks | Result |
| --- | --- | --- |
| Integration `31031d42759bb35c25159e4bbe8d5f58ffabbc7c` | verify, postgres-validation, owner-fixture-playwright | SUCCESS ([39821323463](https://github.com/jaydubya818/MyEveBot/actions/runs/39821323463)) |
| #94 restore `67a2907123219ca24c897605c72740bfdf8338ad` | verify, postgres-validation, owner-fixture-playwright | SUCCESS ([39819189249](https://github.com/jaydubya818/MyEveBot/actions/runs/39819189249)) |
| #93 docs `ffa737a61966e0bbcfbabe6201efb60636de0e76` | verify | SUCCESS ([39819187228](https://github.com/jaydubya818/MyEveBot/actions/runs/39819187228)) |
| #91 `924cdec7526d81a4ea7644b8db40faa6ef4bb4ba` | verify, postgres-validation, owner-fixture-playwright | SUCCESS (prior `39741568945`) |
| #92 `1e35a01147c28fea51cdda4a314c6d42487c7db1` | verify, postgres-validation, owner-fixture-playwright | SUCCESS (prior `39738177995`) |
| Relay #40 `e1389c0eebb7314244cdd47463fdeed33971bbdf` | quality, owner-browser | SUCCESS (prior `39727578317` / `39727578333`). Isolation guard not on the remote. |
| MyFactory #21 `f00ccd885f70f8e088231be4bd6a2f0775714390` | prior hosted green | Unchanged qualified pin. Pin-docs not on the remote. |

A later docs commit on this branch must be requalified; it does not inherit the table above.

## Decision

Ready for the owner’s authorized merge decisions on the six PRs. Default recommendation: merge this candidate to `main` only with explicit release authorization. Do not merge #93 to `main`. Do not deploy Relay Preview or Production, and do not invite testers, under this review.
