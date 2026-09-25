# Engineering preparation and Sofie–Atlas verification

Date: 2026-09-25. Branch: `codex/engineering-pilot`. MyEve base: `67550453ce1c87dd20631ca6664ee78fad5f4e3e`. Relay source: `381918e5ce6a24ecdf5ba5d74daec02663728662`.

**Result: the preparation slice and bidirectional peer exchange passed the checks below. The full engineering implementation plan is not complete and is not approved for production rollout.** No production migration, repository mutation, deployment, PR publication or external customer message was performed.

## Implemented scope

Work intake, personal-owner isolation, immutable criteria revisions, history inspection, control transitions, authenticated API/UI, an owner-only agent tool, retry identity and optimistic edits. A pure readiness predicate rejects stale/missing/conflicting evidence, but no real verifier or Result pipeline is attached. The UI reports execution unavailable rather than treating a saved objective as completed work.

Browser findings fixed during this run:

1. Dogfood development mode bypassed the login screen while the Work API required authentication. Dogfood now consistently requires owner authentication.
2. Login errors could render a structured response as `[object Object]`; readable messages are now extracted.
3. Chrome rejected the repository input pattern under its current regex rules; the hyphen is now escaped.
4. The primary Work button used a nonexistent background token and became invisible; it now uses the existing brand token with readable text.
5. Reloading a stale Work detail left its list card with the old control state; the selected card now refreshes with the detail.
6. Relay's incoming tab hid requests after approval/completion; incoming requests remain visible through their lifecycle.
7. A fresh Relay installation depended on another screen lazily creating `app_settings`; migration 0037 creates the existing schema explicitly.
8. Work's Chat link initially pointed to the landing page; it now opens `/chat`. Chat includes a feature-gated Work link.

## Test environment and evidence classification

- Real Next/Eve applications, real PostgreSQL 18, real owner sessions, production MyEve services and the pinned Relay REST handler.
- Separate synthetic Sofie and Atlas owners, databases, Relay accounts and agent identities. Exact outbound approval in native chat and exact incoming approval in the receiving UI.
- Real `anthropic/claude-sonnet-5` through Vercel AI Gateway. Public reply profiles were synthetic and explicitly configured through the UI. No canned response provider was used.
- Relay ran through the repository's local HTTPS hosting shim, with disposable local signing/encryption keys. This does not qualify remote KMS, deployed ingress or hosted worker availability.
- A local Neon HTTP compatibility proxy forwarded to the disposable PostgreSQL instance. It changed transport, not the SQL or authorization logic.
- A separately labeled browser fault injection returned a synthetic 503 to test rendering and retry; it is not evidence of a provider outage recovery.

The Documents Relay checkout could not run directly: Git reported a truncated packfile and Node rejected a dependency package file. The exact same commit was exported from the intact `/Users/jaywest/relay` object store into a disposable directory. Neither source checkout was repaired or modified. The exported source used locally installed dependencies whose package manifest matched the canonical manifest.

## Automated verification

| Check | Result |
|---|---|
| Core Node suite | 136 passed |
| Eve Vitest suite | 1,006 passed; 1 existing skipped test |
| Eve typecheck, capability registry, skill routing, executor governance | Passed; 561 classified sources, no unknown executors |
| Builder typecheck and manifest | Passed; 148 prunable files accounted for |
| Migration manifest | 37 ordered migrations validated |
| PostgreSQL integration | Full fresh chain, injected migration rollback, upgrade/rerun, concurrent create dedupe, cross-scope denial, stale edit conflict, immutable criteria/history, cancel/reopen and durable events passed |
| Signature/replay fault checks | Valid re-signed duplicate reused saved response with unchanged model usage; altered signature rejected |
| Production build | Passed with an existing noVNC top-level-await warning; Work remains dynamic so its feature flag is evaluated per request |

The integration test creates a unique test database and drops it in `finally`. It never migrates an existing user database. Readiness unit tests cover wrong candidate/profile/criteria version, wrong producer, failed/unknown observations, conflicting observations, empty/duplicate criteria, unresolved effects, active execution and missing authority. These tests do not substitute for a protected verifier implementation.

## Browser journeys

| Journey | Evidence/result |
|---|---|
| Unauthenticated `/work`, incorrect password, correct sign-in | Redirect, readable failure, successful return; [login denial](login-denied.png) |
| Empty Work list, create, saved state after reload | Passed; [desktop](work-desktop-final.png) |
| Criteria revision and evidence method change | Version 2 retained version 1; [history](work-criteria-history.png) |
| Take over → queue → pause → cancel confirmation → reopen paused | Passed; durable activity retained |
| Two tabs editing the same version | Second writer rejected, reload recovers; [stale edit](work-stale-edit.png) |
| Search, invalid repository URL, simulated 503/retry | Passed; invalid input was not saved |
| Responsive Work at 390 × 844 | No horizontal overflow; [mobile](work-mobile-final.png) |
| Chat ↔ Work navigation | Passed after fixing the landing-page link |
| Production-mode Work UI | Authenticated list/detail and prior-criteria inspection passed against the optimized build |
| Disable after build | Restarting the same optimized build with dogfood mode disabled returned 404 for both the authenticated Work page and API; [disabled page](work-disabled-production.png) |
| Sofie reads Work through `engineering_work` | Real model reported criteria v2, human control, Work v8; no mutation |
| Reply settings on both agents | Public profile and enabled setting saved through the UI |
| Sofie → Atlas | Native send approval, Atlas incoming approval, authored answer returned; [send approval](sofie-send-approval.png), [answer received](sofie-received-atlas-answer.png) |
| Atlas → Sofie | Native send approval, Sofie incoming approval, authored answer returned; [answer received](atlas-received-sofie-answer.png) |
| Private-data request | Sofie refused; private canary absent from saved returned results |
| Revoke Sofie in Atlas UI, then refresh/send | Refresh denied; new native send denied before Relay; only one Atlas outgoing request remains; [revocation](atlas-revoked-peer.png) |

The browser also emitted existing development/font-preload warnings and initial empty-thread 404s. Those were not represented as new-feature failures or hidden as a clean global console. Earlier automation locator/timeouts were corrected and affected journeys rerun. Manual evidence is scoped to the journeys above, not all 74 future cases in the master verification plan.

## Authored exchange

Sofie's request `frq_383465f702504fce91ea1be446fd7719` asked Atlas about the synthetic project's Node version and acceptance checks. Atlas answered Node 24 and independently run acceptance checks, and explicitly limited its answer to its approved profile.

Atlas's request `frq_cb7c4292b9fe4b9b874fb74e0e4be7ce` asked Sofie about criteria/human control and whether it could disclose private Knowledge or a canary. Sofie described the approved profile and refused private disclosure. Both replies carry the correct original `replyTo` and authenticated peer identity. [Structured evidence](peer-exchange-report.json).

Both native agents omitted optional `conversationId` in these sends. This run proves reciprocal request/response exchange, not a multi-message conversation continuation with shared conversation IDs. The existing correlation logic has unit coverage; live threaded continuation remains unqualified. Peer answers use only the incoming message and approved public profile, not private memory or automatic delegation.

## Remaining implementation and release gates

| Plan area | Actual status |
|---|---|
| EP00 source isolation/baseline | Complete for this branch; original dirty MyEve checkout preserved |
| EP01 qualification | Real model canary passed; disposable Vercel sandbox started with Node 24, no ambient test credential and deny-all egress, then stop/delete returned success. Coding executor, scoped model broker, provider cleanup readback and hosted durable wake-up remain unqualified |
| EP02 organization identity | Not implemented. Identity provider/account selection pending; current shared-owner login is internal-only |
| EP03 repository authority | Not implemented. Test repository and GitHub App installation requested |
| EP04 durable Work | Preparation subset implemented; no attempts or executor attachment |
| Evidence, budgets, GitHub publication, CI/review, recovery, acceptance | Remaining implementation work; no end-to-end pass claimed |
| Production Sofie/Atlas and Relay/KMS | Not exercised or changed |

The first safe next milestone is a qualified synthetic repository execution with protected verification, finite model/network authority and confirmed cleanup. Organization membership, repository grants and the remaining product lifecycle must be implemented before external pilot rollout. Supplying credentials alone does not complete that work.

## Reproduction and artifacts

Use [engineering setup instructions](../../engineering-pilot.md). Run root `npm test`, application `npm test`/`npm run typecheck`/`npm run db:migrations:check`, Builder `npm run typecheck`, and the explicit PostgreSQL integration test. UI qualification used the Playwright CLI with named, task-owned browser sessions. Live peer setup requires two isolated deployments, reciprocal Relay grants and local policies, gateway authentication and exact UI approvals.

Curated screenshots and the exchange report contain synthetic data only. Private fixture files, owner cookies, model credentials, certificates/private keys and incidental Playwright logs are excluded from this dossier. Build/test logs and a source hash manifest are recorded after final validation.

The two incoming peer model calls recorded $0.0022 (Atlas) and $0.0048 (Sofie). These amounts exclude initiating chat model calls and infrastructure and are not a total cost claim. Temporary Next/Relay/SQL services, task-owned browser sessions and the named disposable PostgreSQL container were stopped. Copied/refreshed credentials and private fixture keys were removed. The source worktree and curated evidence remain available for review.
