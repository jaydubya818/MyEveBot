# Checkpoint H merge-readiness decision

Merge ready: NO. Keep the release gate advisory and retain all deployment, publication, production-grant, paid-operation and external-alpha holds.

## Completed and qualified

The checkpoint fixes conversation persistence before Agent execution, renders structured enterprise proposal/Result evidence and links owner decisions to the existing MissionControl login. The link carries identifiers, not credentials or owner authority. It preserves MyEve `b5a6cecad225463fa45ad01ad5c818b2d0d86db1` and uses exact MissionControl `f68d216f32856265f0f2ffc7345342852dbdf57f`; the deployment-guard follow-up in that repository changes no backend contract, so this qualified pin stays unchanged.

[Hosted run 38067823709](https://github.com/jaydubya818/MyEveBot/actions/runs/38067823709) covers `76c15a0e5302000fafc6341fd08a7957330c5bcf`. Download `checkpoint-h-evidence` from the run. Typecheck, 20 focused tests, actual password login, Agent binding, proposal browser, 15 canonical contract/isolation checks and component conversation reconnect pass. The proposal browser has zero automated accessibility violations. The full local unit suite passed 2,277 tests with 123 skips.

Hosted runtime and Result browser are **NOT_RUN** despite the green job. The private runtime pull returned `manifest unknown`. Deterministic model responses and separate component Missions do not establish the full linked owner journey. Recruiting UI is not qualified by the delegated slug utility.

## Merge blockers

| Blocker | Action |
|---|---|
| Unmerged consumer dependency | Review/integrate `codex/missioncontrol-enterprise-consumer` at `9f1c83b…` separately. This checkpoint PR targets that branch to isolate the conversation and owner-handoff changes. No dependency merge is authorized. |
| Linked owner browser NOT_RUN | Exercise an existing nonproduction MC Clerk owner session through authorization, creation, execution, acceptance and reconnect on one canonical Mission. |
| Hosted Result execution NOT_RUN | Restore read availability of the exact pinned GHCR digest; `packages: read` is already requested. Do not substitute an image. |
| Independent Claude review NOT_RUN | Obtain an actual separate authenticated review of both final candidates. |
| Final PR checks | Require completed ordinary PR CI and final candidate evidence. Absence of main branch protection is not approval to bypass checks. |

## Deployment blockers and correction

GitHub deployment `6983672591` records a successful Vercel Preview for `76c15a0e…`. The earlier no-deployment description was too broad. This follow-up disables Vercel Git deployment for the checkpoint and its dependency-base branch in `apps/eve/vercel.json`, retaining the existing main disable and all other branch rules. See [Vercel's configuration contract](https://vercel.com/docs/project-configuration/git-configuration). No application logic or external project settings change.

A main merge should not trigger the checked-in Vercel Git deployment path while the existing main disable remains effective. Dashboard overrides, other integrations and manual production deployment still need separate verification and explicit authorization. Existing previews are not the approved owner test target and were not changed. Production integration and external-alpha rollout remain NOT_RUN.

## Next decision

No merge approval is requested yet. Provide existing owner test-session access and independent review access; resolve exact runtime read availability. Complete the single-Mission browser and hosted execution gates, then approve the dependency integration order separately. Fresh local clones/installations remain held for coordinated storage recovery.
