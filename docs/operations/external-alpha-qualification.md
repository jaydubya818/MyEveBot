# External-alpha qualification — 2026-10-05

**PRODUCTION ALPHA: NOT_READY.** Three synthetic owners are provisioned. No real testers are invited. Provisioning and deterministic isolation qualification do not establish the complete product journey.

The initial architecture is one independently configured deployment, database, private artifact store, session secret and owner identity per owner. This is an alpha limitation, not shared tenancy. Sharing infrastructure does not grant cross-owner access. No personal owner credentials, connected applications or Factory publication authority are inherited.

## Established scope

- Sign-in, session persistence, independent sessions, durable logout revocation, retained-cookie rejection, signed-session expiry and reconnect: 19 checks passed per owner.
- Six-direction isolation: 169 checks passed across foreign sessions, real canonical Agent/configuration/home IDs, Files, private Memory, thread metadata, Goals/Tasks, Work/Current Truth, owner decisions and list exclusions. Cross-owner disclosures observed: zero.
- Six foreign-Agent Eve session bindings were rejected. Routine execution is disabled on all three deployments.
- Real browser specialist creation and persisted configuration passed. No external capability was assigned to those specialists.
- Real browser private artifact upload, owner byte/digest readback and unauthenticated private-storage denial passed.
- Private Memory was created through the canonical store and inspected through each owner's actual UI. This is a synthetic persistence/retrieval fixture; natural conversational remembering is not qualified.
- The Goal UI created actual Goal/Task/paused Work records. Needs You displays actual canonical decisions. No Work completion, Result, Proof or conversation event was fabricated.
- Client HTML/bundle comparison against installation credentials found no disclosure. Credentials were compared in memory; none are included here.
- Read-only database accounting confirmed zero new model calls, Factory requests/admissions, publication records or Relay grants in the synthetic installations. Each Work remains paused.

Template release 265 corrects two observed Agent selector contrast failures and focuses the Agent name field when its inline form opens. These changes do not grant execution authority. Desktop and 390px checks cover Today, Work, Needs You, Agents, Files/artifacts and the empty Results state; an empty state is not Result/Proof journey qualification. The command palette is separately checked for keyboard opening, initial focus, focus trapping and Escape dismissal.

The earlier bounded production CLOUD canary remains accepted and is not repeated. Its independent execution/evidence qualification does not qualify natural Sofie orchestration, three-owner Factory integration, Relay, or external alpha. Its canonical Proof remains limited to established evidence; publication and owner acceptance are separate gates. Zero local runtime dependencies were established; physical Mac power state was not independently observed.

## Feature exposure decision

These statuses apply to the proposed external-alpha surface. **All real external access remains withheld until the full release gate passes.** ALPHA means a limited synthetic-owner scope has passed, not that invitations are authorized.

| Surface | Status | Qualified scope / remaining limit |
|---|---|---|
| Sofie / Chat | OWNER_ONLY | Natural conversation, continuation and natural Work are pending for synthetic owners. |
| Persistent Agents | ALPHA | Creation, purpose/instructions, persistence and owner isolation; model execution pending. |
| Live Agent Cards | ALPHA | Persisted identity and read-side home; live execution state pending. |
| Today | ALPHA | Canonical Goals, paused Work and owner attention. |
| Work Inbox | ALPHA | Awaiting admission and Needs You; completed Work journey pending. |
| CLOUD Work | DISABLED | No synthetic-owner production execution contract or grant. Prior bounded canary is inherited evidence only. |
| Result / Proof | OWNER_ONLY | Prior canary owner readback accepted; three-owner Result/Proof isolation pending. |
| Routines | DISABLED | Runtime release gate is off; no unattended execution claim. |
| Rooms | DISABLED | UI explicitly reports unavailable membership/execution. |
| Files | ALPHA | Owner UI upload, private custody, byte readback and cross-owner denial; agent conversational read pending. |
| Memory | ALPHA | Canonical local persistence and owner UI inspection/isolation; conversational/semantic feature remains disabled. |
| Email | DISABLED | No synthetic-owner provider connection. |
| Connected Apps | DISABLED | No inherited connections or owner-specific provider authorization. |
| OWNER_COMPUTER | DISABLED | No computer provisioned or inherited. |
| Relay | DEFERRED | Operator sign-in, separate synthetic identities and grant/message qualification pending. |
| MyFactory | DISABLED | Synthetic sources are outside the existing production installation and trust contract. |
| Publication | DISABLED | No grant, generated push, PR, merge or application deployment. |
| Automatic repair | DISABLED | No retry/repair authority. |
| Automatic deployment | DISABLED | No generated deployment authority. Operator release installation is distinct. |

## Remaining release gates

Natural Sofie conversation and durable continuation; natural Work admission; synthetic-owner CLOUD/Result/Proof/EvidenceProvider isolation; browser-disconnected execution and reconnect; Relay identity/message/grant isolation; and the remaining operational controls must pass before READY. Do not infer these from healthy deployments or empty API responses.

The installed production execution contract and deployment-protection trust rule are bound to the original production source. They cannot be copied into the synthetic projects. A separately reviewed bounded production-alpha authority class must specify exact owner/source/Work scopes, application identities, model/provider/pricing, aggregate operation/spend limits, deadline, candidate/writer fencing, independent verifier, custody/Proof, UNKNOWN handling and revocation. A monthly Gateway budget is not a hard per-journey operation envelope. No new executable grant or paid call is authorized by this document.

## Operator runbook

Keep the owner configuration, resource registry, full qualification artifacts and integrity manifest private. Public records contain engineering outcomes only, not raw Result/Proof, production resource identifiers, credentials or owner metadata.

| Control | Procedure and evidence boundary |
|---|---|
| Disable General / paid Work and CLOUD | Keep Factory worker disabled, production execution configuration absent and grants unavailable. Verify canonical Work remains paused and a valid-shaped start request is denied without state change. These denials passed for all three owners. |
| Revoke a browser session | Durable logout must succeed, then replay the retained cookie against APIs and agent reconnect. Passed for each owner. Already-admitted Work/streams require separate cancellation. |
| Revoke an owner | Pause the exact managed project through the explicit operator path after verifying its registry marker. For a credential incident, rotate that owner's password/session secret and fence older deployments. Do not reset or delete its data. |
| Revoke Relay access | Revoke the exact grant or retire the owner's paired identity through canonical Relay controls; independently verify subsequent denial. Pending live synthetic Relay qualification. |
| Pause Routines | Keep the release execution gate disabled. When enabled in a future qualified release, pause canonical Routine state and confirm no new occurrence is admitted. Existing admitted work requires separate fencing. |
| Kill/fence active Work | Use the canonical owner/Work/version/generation stop path, revoke exact authority and verify producer/verifier teardown. UNKNOWN is not success and does not authorize redispatch. No active synthetic execution exists to test this yet. |
| Roll back MyEve | Preserve the registry and data backup; promote the previous qualified deployment in the same owner project; verify production alias, owner authentication and readiness. Never roll back to a publicly reachable version without revocation. Do not undo migration history by resetting data. |
| Disable/roll back Factory | Disable new admission and reconcile/revoke outstanding exact grants before any rollout. Preserve unresolved accounting/custody. Synthetic owners currently have no Factory authority; inherited canary cleanup evidence remains private. |
| Investigate | Start with authenticated owner Work/Current Truth, then its canonical Result and evidence references. Keep exact owner/Work/run/candidate/version correlations in private evidence. An inaccessible record must not disclose another owner's metadata. |

## Onboarding and next owner stop

The current invitation mechanism is operator-controlled provisioning of a dedicated owner deployment; public signup is not enabled. A future invite requires a unique owner identity, unique credentials and storage, explicit migrations/readiness, independently scoped Relay pairing where qualified, and a minimal feature allowlist. Onboarding should verify sign-in, scope, specialist, Files/Memory and the separately authorized first journey, with visible success/error states.

Recommended first real cohort **after READY and explicit owner approval: two invited users**. Present their exact capabilities, remaining limitations, private credential-delivery mechanism, support/incident path and revocation/rollback plan before inviting either. This recommendation authorizes no invitation or paid operation.
