# Persistent Peer Permissions V1: authority inspection decision

Status: authorized by the owner; Relay dependency qualified and merged. MyEve implementation and qualification are in progress.

## Fetched canonical sources

- MyEve origin/main: `ffbcfda7e4cd4741ea8f9fa1a60fbdb9f1e2ab7f`.
- Relay origin/main: `e2eb350f5655427d55cc204264020a9295173f96`.
- MyEve feature worktree: `/private/tmp/myeve-peer-permissions-v1`, branch `feat/persistent-peer-permissions-v1`.
- Relay inspection worktree: `/private/tmp/relay-peer-permissions-baseline`, detached at fetched main.

Relay authority inspection was merged through PR #13 as `a52584b59717795326fe3f9a22b3016c7358a98e`. This document records the original boundary decision; the recommendation below is now authorized. MyEve changes are isolated in the feature worktree.

## Verified boundary

Relay's `lib/v2/federation/api.ts` exposes submit, poll, get, respond, acknowledge, and discover. Its operator endpoint exposes mutations, including grant creation and revocation, but no grant-authority inspection. The MCP surface delegates to the same command implementation.

`lib/v2/federation/discovery.ts` returns peer addresses, advertised capabilities, verification labels, and discoverable public views. These are not current caller-specific grant authority.

`lib/v2/federation/service.ts` evaluates grant, resource, identity, and policy authority during submission and subsequent lifecycle operations. Missing, expired, and revoked grants converge on `CAPABILITY_DENIED`. MyEve cannot truthfully distinguish them from that response.

Submission cannot be used as a read-only probe: successful admission persists a request and an outbox event, may create an approval or reserve a work budget, and produces signed audit evidence.

Relay's grant contract requires a finite `conditions.expiresAt`. Persistent MyEve policy can legitimately use Until Revoked while Relay authority remains finite, as explicitly permitted by the work order. This alone is not a blocker and does not justify changing the grant contract.

## Original decision rationale

The work order requires current effective authority in Manage and model discovery, distinguishable Relay expiry, and avoiding exact-action approvals when Relay authority is already unavailable (sections 87–93, 145, 149–151, and 357). The current public API cannot supply that information. Treating unknown as active fabricates authority; treating every unknown as denied prevents the intended steady-state interaction. Reading Relay's database directly from MyEve would bypass the service boundary and is not a distributable solution.

Section 143 freezes protocol contracts; section 469 requires stopping for a genuinely new Relay protocol decision. An additive inspection operation needs that decision before implementation.

## Authorized bounded extension

Authorize an additive, authenticated, read-only Relay authority-inspection operation:

- Derive caller owner and Agent from the existing credential; never accept a caller identity override.
- Inspect only exact target Agent, canonical capability, and resource bindings; bound batch size for the peer list.
- Return safe caller-scoped grant status and expiry, approval requirements, and unavailable/unknown reasons where disclosure is authorized. Do not enumerate private resources or reveal another owner's grants.
- Distinguish grant status from complete request authorization. Payload-dependent conditions, budgets, rate limits, and current policy must still be evaluated for the exact request.
- Share the canonical authority predicates rather than implementing a second authorization engine.
- Create no request, delivery, approval, budget reservation, grant, or signing operation. Ordinary authentication and rate limiting may still apply.
- The inspection response grants no execution authority. Submission and delivery must retain their current fresh authority checks.
- Keep V2 signing, tokens, request envelopes, peer identity, grant expiry contracts, and Action Gateway/approval continuation unchanged.

## Qualification state

Relay: 329 tests passed, five intentional provider skips, 15 authority-inspection tests, performance, typecheck, lint, database consistency and build passed. V2 signing unchanged; live KMS calls zero.

MyEve: implementation in progress. Unit and contract tests, disposable SQL migration and approval-continuation checks have passed. Browser, live Atlas, restart and source integration qualification remain pending. Production deployment and enablement are not authorized by local qualification.
