# QA PR remediation — 22 October 2026 (America/Los_Angeles)

This folder is historical evidence for the six-PR close-out. It does not authorize merge, Production deploy, or tester activation.

## Source identities

| Artifact | Repository | PR | Branch | Exact SHA | Disposition |
| --- | --- | --- | --- | --- | --- |
| Silent-failure QA | MyEveBot | [#91](https://github.com/jaydubya818/MyEveBot/pull/91) | `cursor/qa-silent-failures-b54d` | `924cdec7526d81a4ea7644b8db40faa6ef4bb4ba` | Included in this main-line integration candidate |
| Mobile forms QA | MyEveBot | [#92](https://github.com/jaydubya818/MyEveBot/pull/92) | `cursor/qa-mobile-forms-b54d` | `1e35a01147c28fea51cdda4a314c6d42487c7db1` | Included |
| Deep Agent QA-43 | MyEveBot | [#93](https://github.com/jaydubya818/MyEveBot/pull/93) | `cursor/qa-deep-agent-b54d` | `ffa737a61966e0bbcfbabe6201efb60636de0e76` (docs successor of `1801b57ceb2d3d18325cc5115c78d9fae9b68dc6`) | **Keep on `codex/q37-private-alpha-continuation`. Do not merge to `main`.** |
| Medium/low QA + restored `output/` | MyEveBot | [#94](https://github.com/jaydubya818/MyEveBot/pull/94) | `cursor/qa-medium-low-b54d` | restore SHA `67a2907123219ca24c897605c72740bfdf8338ad` (code parent `0abcc2aaa5c2fb6149514b68b6480d91595b5275`) | Included; `output/` restored from `main` `252d4c8f` |
| Relay QA + Preview guard | relay | [#40](https://github.com/jaydubya818/relay/pull/40) | `cursor/qa-relay-remediation-58c5` | code SHA `e1389c0eebb7314244cdd47463fdeed33971bbdf`; local isolation commit `301ad372bfd7db7316065c0313d4458cf58173be` | Isolation **NOT ISOLATED**; Git Preview disabled in source. Push of the guard was denied for `cursor[bot]` on `jaydubya818/relay` |
| Factory QA | MyFactory | [#21](https://github.com/jaydubya818/MyFactory/pull/21) | `cursor/qa-remediation-38cf` | qualified code SHA `f00ccd885f70f8e088231be4bd6a2f0775714390`; local pin-docs `e61ab36079179fbec46c58d3bd0752b0ecae71cd` | Pin the qualified SHA. Successor identity is record-only. Push of pin-docs was denied for `cursor[bot]` on `jaydubya818/MyFactory` |

## Shared-file merge on this candidate

Conflicts were limited to `.github/workflows/ci.yml`, `apps/eve/package.json`, `apps/eve/vitest.config.ts`, `apps/eve/scripts/executor-inventory.json`, and `package-lock.json`. `apps/eve/app/chat.tsx` merged without conflict.

Resolution kept every unique fix and regression test:

- CI verify list is the union of #91 and #94 extra files (Playwright specs still selected by `test/owner/qa-*.spec.ts`).
- Vitest keeps #91's React 19 aliases and per-file `happy-dom` pragma (vitest 5 dropped `environmentMatchGlobs`).
- `package.json` keeps `#91`'s `@testing-library/react@^16.3.3`.
- Executor inventory unions #91/#92 helpers with #94 `lib/error-dedup.ts` and the QA-32 `lib/web-auth.ts` claim.
- `apps/eve/vercel.json` disables Git deploys for the four QA branches plus `cursor/qa-main-integration-6ef4`.

## Relay Preview database

See [relay-preview-production-db-isolation.md](relay-preview-production-db-isolation.md). Production+Preview share Neon `PGHOST` / `POSTGRES_URL_NO_SSL`. Apply [patches/relay-40-preview-isolation.patch](patches/relay-40-preview-isolation.patch) on `cursor/qa-relay-remediation-58c5` when write access exists. Existing READY Preview `dpl_9A416c72oobyfiCA3p5EvukyAXEW` was not cancelled.

## MyFactory pin

See [myfactory-21-integration-pin.md](myfactory-21-integration-pin.md). Apply [patches/myfactory-21-integration-pin.patch](patches/myfactory-21-integration-pin.patch) when write access exists. Consumers should keep `f00ccd885f70f8e088231be4bd6a2f0775714390` until a later SHA is requalified.

## Independent review

Second-pass notes: [independent-review.md](independent-review.md). Local combined vitest (109 tests), capability-notice (7), Relay unit (191 pass / 19 skip), protocol contract, and `eve-agent` typecheck passed on this tree. Hosted CI is a separate fact.

## What remains unauthorized

Merge to `main`, Production deployment, cancellation of live Relay Previews, and tester invitation.
