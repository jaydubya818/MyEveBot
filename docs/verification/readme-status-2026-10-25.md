# README source and release reconciliation — October 25, 2026

This record supports the developer-facing [README](../../README.md). It separates product direction, implemented source and serving availability. It creates no execution or release authority.

## Sources reviewed

| Source | Revision / evidence | Interpretation |
| --- | --- | --- |
| Remote `main` | `6b65d198a367b841fac586b94c8c9667cd52ebf9`, confirmed through GitHub's branch API | Development instructions and repository structure describe this source. It does not include the complete serving beta authentication/accounting lineage. |
| Serving beta | [PR #99](https://github.com/jaydubya818/MyEveBot/pull/99), stacked on [PR #98](https://github.com/jaydubya818/MyEveBot/pull/98); release source `5895b129b61c22b1bd276c8ddcdedfd0048228da` | Two installations activated for bounded CHAT. Work/Factory execution remains denied for this cohort. |
| Beta improvements | [Draft PR #101](https://github.com/jaydubya818/MyEveBot/pull/101), reviewed head `da619b4fe8ece088e91f8d5659af21ee09a40286` | Includes six feedback improvements and subsequent QA/tooling work. Local/source evidence does not establish complete runtime qualification or serving deployment. |
| Published releases | GitHub releases API returned no releases at reconciliation | A release tag cannot be used to infer the actual serving application. |

PR #101's current description supersedes earlier source-only readiness statements: runtime qualification remains incomplete, with failed Golden, E3, independent-journey and QE rehearsal checks. The PR remains a draft and is not ready to merge or release. This README change does not adopt that branch, deploy it or alter any holds.

## Serving availability observation

Read-only Vercel inspection of each canonical tester production alias resolved to the same retained production deployment identified in PR #99. Both reported `READY`. At **2026-10-25 09:16 Pacific** (`2026-10-25T16:16:46Z`), both canonical `/eve/v1/health` endpoints returned HTTP 200, `ok: true`, `status: ready`.

The inspection establishes alias resolution, retained deployment identity and health at that time. The serving-source attribution comes from the matching PR #99 deployment receipt; the CLI summary alone does not independently attest the source bytes. No authenticated chat, password reset, account mutation, enrollment, SQL change, model dispatch or deployment was performed during this documentation work. No tester quota was consumed.

PR #99 records actual browser chat replies, persisted assistant/turn completion after refresh and settled accounting on both installations. Those remain dated qualification evidence, not a fresh chat test on October 25. The original bounded activation expires **October 28, 2026 at 09:50 Pacific** unless earlier revoked or exhausted. This is not general availability or permission to extend the trial.

Production resource IDs, private runtime evidence and credentials are intentionally kept in existing operator custody rather than reproduced in public documentation.

## Beta evidence references

These documents live on the reviewed beta source, not on `main`. Links pin the reviewed revision so later branch movement does not silently change their meaning.

- [Password management and owner-assisted recovery](https://github.com/jaydubya818/MyEveBot/blob/da619b4fe8ece088e91f8d5659af21ee09a40286/docs/application-passwords.md): database password changes, session invalidation, single-use recovery, operator controls and rollback limits. Recovery has no automatic email issuance service.
- [Chat-only operations](https://github.com/jaydubya818/MyEveBot/blob/da619b4fe8ece088e91f8d5659af21ee09a40286/docs/operations/external-alpha-chat-only.md) and [security/accounting review](https://github.com/jaydubya818/MyEveBot/blob/da619b4fe8ece088e91f8d5659af21ee09a40286/docs/verification/2026-10-23-chat-only-security-review.md): permanent reservations, owner/cohort limits, expiry, denial of Work and handling of uncertainty.
- [Six-feedback qualification](https://github.com/jaydubya818/MyEveBot/blob/da619b4fe8ece088e91f8d5659af21ee09a40286/docs/verification/2026-10-23-beta-feedback-qualification.md) and [rollout prerequisites](https://github.com/jaydubya818/MyEveBot/blob/da619b4fe8ece088e91f8d5659af21ee09a40286/docs/operations/beta-feedback-release-20261023.md): accurate capability limits, Today state, daily turns, budgets, concise/latest-preference replies and primary-agent chip removal. Earlier source readiness is narrower than current PR #101 runtime readiness.
- [QA adoption evidence](https://github.com/jaydubya818/MyEveBot/blob/da619b4fe8ece088e91f8d5659af21ee09a40286/docs/verification/2026-10-23-beta-qa-adoption.md): retained authentication/accounting, conversation handling, UI/browser scope and separately gated Relay/Factory work.

## Architecture and integration evidence

- [Sofie runtime](../../apps/eve/agent/agent.ts), [persistent tools](../../apps/eve/agent/tools) and [engineering source](../../apps/eve/lib/engineering) establish implemented application surfaces. A feature's presence does not activate it in the chat beta.
- [Relay implementation](../../apps/eve/lib/relay) and [peer acceptance contract](../setup/agent-communication.md) support scoped compatible-peer requests. No dedicated production-qualified Codex, Cursor, Grok or ChatGPT Dots connector was verified in the reviewed MyEve source.
- The [Claude Code Docker executor](../../apps/eve/lib/engineering/docker-executor.ts) actually invokes the CLI under a bounded engineering contract. This is implemented adapter code, not permission for external testers to run it.
- [Deep Agent documentation](../setup/deepagent-harness.md) and [route admission](../../apps/eve/lib/digital-worker/routing.ts) distinguish experimental harness contracts from a registered qualified provider. No qualified production Deep Agent provider is established by this release.
- [Shared capability controls](../../packages/capability-control) and [enforcement](../../packages/capability-enforcement) exist on `main`. The reviewed beta also contains [MissionControl consumers](https://github.com/jaydubya818/MyEveBot/tree/da619b4fe8ece088e91f8d5659af21ee09a40286/apps/eve/lib/missioncontrol) with explicit environment/authority gates; this does not establish full enterprise availability.
- [Builder](../../apps/builder) installs and updates MyEve. The beta's [MyApps implementation](https://github.com/jaydubya818/MyEveBot/tree/da619b4fe8ece088e91f8d5659af21ee09a40286/apps/eve/lib/myapps) includes local integration gates that deny production composition. General application delivery/rollback is not claimed as serving.
- [Historical README checkpoints](readme-historical-checkpoints.md) preserve the superseded October 6 qualification details and their original limits. Historical bounded production journeys do not activate developer execution for the current chat cohort.

## Technical instruction checks

The README's Node/npm requirements, workspace names and commands were checked against the root and application package manifests, lockfile, Turbo configuration, migration runner, schema registry, environment example, runtime/readiness configuration and all four workflows on `main`.

The migration loader was executed without database access to validate filenames, unique ordering, SQL parsing and the current-schema pointer. The migration CLI uses `@neondatabase/serverless`; disposable PostgreSQL integration fixtures have their own test transports. No database migration was applied. An offline `npm ci --dry-run --ignore-scripts --no-audit --no-fund` also passed against the committed lockfile; this checks the install plan without claiming a completed installation or postinstall run.

Application builds and provider tests were not rerun for this documentation-only change. The README lists their source-defined commands; it does not claim a new application qualification pass. Markdown structure, local targets/anchors, shell syntax and declared npm scripts are validated separately before publication.

## Publication boundary

The isolated documentation branch uses the previously unused name `codex/peer-message-answers`, already covered by `deploymentEnabled: false` in the unchanged [Vercel configuration](../../apps/eve/vercel.json). Its absence from local and remote branch inventories was checked before creation. This avoids an unlisted documentation branch triggering a preview while preserving configuration and all active beta branches.

The PR changes only Markdown. No application source, migration, credentials or production configuration is changed. Review and merge remain separate from release.
