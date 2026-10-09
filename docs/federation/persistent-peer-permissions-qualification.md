# Persistent Peer Permissions V1 qualification

Status: **NOT YET QUALIFIED FOR MERGE**. Implementation candidate is committed; local Atlas, restart and final integration checks remain.

## Source and runtime boundary

- Relay inspection merged through PR #13: `a52584b59717795326fe3f9a22b3016c7358a98e`.
- MyEve implementation candidate: `2ddfce5`, branch `feat/persistent-peer-permissions-v1`, based on canonical `ffbcfda7`.
- Local MyEve runtime independently advanced to `2123a1b` on `fix/expired-run-action-admission`. Its conversation-Run migration uses 0034, as does this candidate's peer-permission migration.
- The owner has been asked whether to integrate those committed fixes together or wait for their canonical merge. No runtime or owner-database changes were made by this task while that decision is pending.

## Passed checks

- MyEve unit suite: 914 tests across 118 files.
- Existing contract suite: 135 tests.
- SQL integration: 21 scenarios using temporary tables in an isolated database. Includes exact native approval continuation, no approval for known Relay denial, pending Relay/local revocation and expiry, policy revision fencing, owner-scoped saves, idempotent save replay, atomic audit, offline revocation, incoming exact approval, and participant/thread-bound reply correlation.
- Migration runner: fresh schema, canonical-prefix upgrade, deliberate failure rollback, repeated runs. Only disposable schemas were changed.
- Browser fixtures: desktop and mobile review-before-save, saved relationship after page reload, explicit revocation, conflict error with retained selections, keyboard focus, and no horizontal overflow. These are UI fixture tests, not live Atlas qualification.
- MyEve and Builder TypeScript checks; capability registry; imported Skill routing; Builder manifest.
- Executor inventory: 550 classified sources, UNKNOWN=0.
- MyEve and Builder production builds using supported Next webpack mode. Turbopack could not follow the isolated worktree's dependency symlink.
- Diff whitespace checks and changed-source credential-pattern scan passed. This scan is not a claim of exhaustive secret detection.

## Authority and persistence

`myeve_peer_permissions` stores owner/local-Agent/Relay-origin/local-Relay-identity/remote-account/remote-Agent bindings, exact capability/resource policies, explicit Knowledge scopes, expiry, revocation and revision. Desired policy does not create Relay authority. Until Revoked applies to MyEve policy; Relay grants retain their existing finite expiry contract.

`myeve_peer_action_bindings` fences each canonical Action to its permission revision and request hash. Exact outbound approval tuples and the native durable continuation are preserved. Final transmission additionally verifies the executing Action's canonical parameter hash. Incoming requests use the same Action Gateway and existing approval decisions. Reply exemptions require the exact outgoing parent, participant pair and conversation and still check current receive permission.

The owner API authenticates the session, enforces same-origin mutation, rejects owner overrides, validates bounded input and uses revision CAS with an atomic safe audit event. Models cannot mutate policy. Owner-data export includes non-restorable policy metadata; it does not export credentials or reactivate authority.

## Remaining gates

1. Reconcile the independent conversation-Run migration before local runtime changes.
2. Requalify the combined source, commit the exact candidate, and apply its migrations through the canonical runner to the authorized local databases.
3. Exercise the real Sofie engine and local Atlas: effective-policy explanation, published-only retrieval, two distinct exactly approved messages at most, correlated replies, revoke/restore and restart persistence. Preserve the existing model authentication; no sandbox provisioning or live KMS calls.
4. Merge only after the required live gates pass, then leave the canonical local runtime configured and running. Production Federation remains disabled; local qualification does not authorize production schema rollout or peer effects.

An automatic review rejected a proposed reduction in repeated permission checks because of stale-authorization risk. That optimization was not applied; the repeated current-permission checks remain.
