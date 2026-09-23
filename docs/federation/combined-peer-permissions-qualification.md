# Combined Multi-Run and Persistent Peer Permissions qualification

Status: **LOCAL COMBINED QUALIFICATION PASS** at code checkpoint `6ca1a80d40182bcfc1cb5caa871dc124ec438a13`. Final model canary, golden same-Action send, correlated acknowledgement and post-reload health passed. Canonical merge follows the final CI gate. Production migrations and feature enablement remain separately controlled.

## Source lineage

Canonical base: `ffbcfda7e4cd4741ea8f9fa1a60fbdb9f1e2ab7f`.
Exact Multi-Run dependency: `2123a1b411783bdc5431e13aa45fce8dc9e58d8a` (includes `20e2c2fc54fb38ae430ca502724c320d57236c1d`). Integrated as an ancestor, not reconstructed.
Original Peer Permissions candidate: `35f8041`, implementation `2ddfce5`. Reapplied above Multi-Run as `32d1015` and `d2f567e`; semantic conflict resolution retains lifecycle denial, current Run selection, and every independent permission/Relay execution recheck.
Relay authority inspection dependency merged at `a52584b59717795326fe3f9a22b3016c7358a98e` (implementation `31ab0eec3d02d660f81bc156f1eea4535c2f5764`).

Migration 0034 belongs exclusively to Multi-Run. Peer Permissions is 0035. Migrations 0001–0033 are unchanged; 0034 is byte-identical to the dependency. Both qualified local databases already have 0034, with historical preservation evidence from its qualification. Only 0035 may be pending there; no rerun of 0034 or database restart is planned. Disposable test databases use port 55439, never the qualified owner databases at 55432.

## Owner-reported messaging configuration defect

The original candidate required a model-supplied resource and told the owner to provide it. Corrected within the existing peer permission and Action path: message input may omit resource, the server resolves exactly one non-denied message.send policy for the exact local and remote Relay identity, and canonical Action parameters contain that resolved resource. A provided different resource is denied; no fallback exists. Native approval re-resolves and verifies the complete canonical hash. A changed resource, policy revision, revoked/expired policy, or expired Run cannot inherit authority.

Manage offers the peer-address messaging binding only after read-only Relay inspection confirms that exact caller/peer/capability/resource. Messaging has no raw-resource input. Missing/ambiguous saved bindings fail before Action approval with a truthful configuration error linking `/manage/relay`. Actual submission still performs all fresh local and Relay checks. Relay transport, signing, envelopes and tokens are unchanged.

## Evidence to date

- Authenticated no-tools model canary: PASS on the existing running engine after owner restart. No Federation send occurred.
- Eve: 927 tests, 119 files, PASS after the resource correction. Core: 135 PASS.
- SQL native approval: 28 checks PASS, including missing resource creates no Action, changed resource invalidates pending approval, automatic resource resolution resumes the exact Action once, replay sends zero additional messages, and one peer permission spans three Runs with distinct Actions/approvals. Relay mocked; live effects zero.
- SQL lifecycle: 16 checks PASS. Populated upgrade preserves historical Actions, approvals, Run links and data; concurrent recovery selects one current Run; three-cycle history persists.
- SQL Action context: 22 PASS. Computer lifecycle: 59 PASS; real providers zero. Routine/execution regression groups PASS, including signed Relay delivery and published/private data isolation.
- Migrations: fresh chain through 0035, canonical prefix upgrade, 0034-to-0035, atomic failure rollback for both migrations, and safe rerun PASS in disposable namespaces/databases.
- TypeScript, registry (136 definitions), skill routing (93 checks), Builder manifest (147 files, release 255), executor governance (551 sources, UNKNOWN=0) PASS after resource correction.
- Eve/Builder webpack builds PASS after resource correction. Desktop/mobile owner flows and error recovery PASS; messaging resource entry removed.

Evidence logs are local `/private/tmp/combined-*.log`. They are not production qualification. Earlier individual-feature reports retain their historical scope and do not qualify this combined head.

## Original release gates (historical; completed below)

Final corrected builds, desktop/mobile/keyboard owner flow, pushed attributable checkpoint, private backup and writer pause, verify both 0034 checksums and apply only 0035 locally, canonical runtime reload preserving model authentication, exact bounded Atlas grant renewal if needed, owner Manage relationship establishment, long-lived conversation fresh-Run native approval and same-Action send, correlated actual acknowledgement, pending revoke/expiry denials, restart persistence and privacy evidence. Maximum two intentional local Atlas sends across this combined qualification. No sandbox/KMS provisioning. No Production migration or enablement.

Automatic deployments for main and the integration branch remain disabled. Canonical merge is conditional on completed combined qualification. The rejected optimization to remove repeated effective-permission checks was not applied.

## Live evidence update (2026-09-23 UTC)

Pushed code checkpoints: `d4c67657f439b7ad4d2c34607edb150c84e982f4`, `c8fe000ac06e02af09f27f5d4602014cda34c036`, then `1bda8eafc1eaaa4be059b8313f8d84019fe18065`. Draft PR: https://github.com/jaydubya818/MyEveBot/pull/6. The final checkpoint clarifies that a submitted Action has already consumed native approval; Relay `AUTHORIZED` is admission status, not a new owner-approval prompt. Final runtime activation and its second bounded send are pending because unrelated Composio edits appeared in the shared runtime checkout. Those edits have not been overwritten or included in this PR.

Both local databases applied only 0035. Migration 0034 checksums match the dependency. Verified PostgreSQL custom backups and complete pre-existing-table count/hash preservation are recorded in `/private/tmp/combined-live/migration-report.json`. Local provisioning required the same DML grants on the two new tables for existing web, worker and engine roles; no role or database access scope was expanded. Production deployment must explicitly verify its migration/application-role privilege model.

The authenticated engine passed the initial no-tools canary. After reload, it produced a valid model response but declined the original authentication-token wording; that exact-response canary is not counted as passing. Subsequent real model/tool turns prove functioning model authentication. Engine artifact refresh required the installed server's GET `/eve/v1/dev/runtime-artifacts/rebuild?force=1`; preserved authentication alone does not prove that a new source artifact is active.

Live relationship `peer_permission_34a2c352-95bb-48b1-8eb7-3666c18ef6f1` was created through `/manage/relay` with no resource input and reloaded on desktop/mobile. It persisted across process/source reloads. Local expiration is Until revoked; Relay expiry remains separately bounded. Atlas's existing exact message grant was renewed for two hours at one call per 7200 seconds; its expired passport was refreshed to that same expiry with all eligibility/policy fields unchanged, using the existing local signer. No KMS or sandbox infrastructure was created.

| Acceptance case | Observed result |
| --- | --- |
| Exact Atlas discovery and automatic resource | Native pending tool input omits resource; canonical Action binds the stored exact Atlas resource. |
| Revoke while pending | Original Action `action_d925236c-f7cd-4aee-845a-4c9370d10843` remains at zero execution attempts; no new Relay message. |
| Run expires while pending | Original unchanged deadline passed naturally; approval continuation returned `RUN_EXPIRED`; zero sends. |
| Same conversation, fresh work | Historical Run `action_run_ac5d4adcc981054cfe9fce085e620622bc3337a2205fbba8face065c02e2e707`, second Run `action_run_0fa8a707-8bdf-45f2-8253-4c1b7d1597ff`, and third Run `action_run_29b53ffa-b6e6-45e8-b611-1aa172874a1e` retain history and one current pointer. |
| Exact native approval executes once | Action `action_c2f84f12-2421-4fdd-b226-db599365c56f` changed from pending/0 attempts to completed/1 attempt with its original approval/hash and permission revision 4. |
| Actual Atlas result | `frq_4421eb4e3b4a48d4bd8fa1f82c0ed5e6` completed; actual result `{ "acknowledged": true }` was retrieved and surfaced. This is a protocol acknowledgement, not an authored substantive reply. |
| Published Knowledge | Fresh request `frq_b4d921aaa43d460aab8220d5b756d110` returned the owner-published pilot-launch fact with provenance from the explicit shared view. |
| Private Knowledge | Model explicitly denied private/internal access; no private marker was supplied to the model or found in its events/results. |

Live qualification found and fixed native-Date tool serialization. A first Knowledge request hit missing worker table privileges before Run allocation/effect execution and remains safely fenced for recovery; a fresh request passed after role provisioning. It was not replayed or relabelled as success. A model-invented topic outside the published view was correctly denied. The first successful message exposed model confusion about Relay `AUTHORIZED`; the final tool-output clarification still requires its last live acceptance check.

Final isolated regression results at the response-clarification checkpoint: 928 Eve tests, 28 combined SQL approval checks, types/registry/routing and executor governance pass. Eve build passes; final Builder packaging and CI are tracked separately. Four browser tests cover desktop/mobile, keyboard focus, failed-save preservation and missing messaging configuration with no internal-resource prompt.

Historical status at that checkpoint was **NOT YET FULLY QUALIFIED / NOT MERGED**. The completion evidence below supersedes it. Production migration and enablement remain untouched.

## Completed final acceptance and canonical integration (2026-09-23 UTC)

Composio preservation: **PASS**. The three unrelated tracked files were preserved byte-for-byte, with binary diff equality, in `/private/tmp/myeve-composio-preserved-20260923`, branch `codex/composio-preserved-20260923`, local checkpoint `fb14599b9342cfff568fcf70b2a29bf6e018b546`, based on `c8fe000ac06e02af09f27f5d4602014cda34c036`. No secrets or dependency/runtime directories were copied. It was not pushed, merged or reapplied. Shared source was restored only after preservation verification.

The final golden message asked Atlas what research and analysis it is best suited for and what bounded work it currently accepts. Sofie showed the exact draft. A stale model-authored expiry was denied with no Action or send; after refreshing current time and relationship via the canonical tools, Sofie prepared a fresh native Action without a resource input. Approval resumed **the same Action, Run, payload/resource hash and permission revision**:

- Action: `action_d777702d-96a5-477c-a9fa-3b3c1762d006`
- Run: `action_run_ae097ee5-44ba-4586-9b9b-66fdbb0557fe`
- Approval: `approval_3de8e8c12888222b2072738e9eda73bb14ab5369ac50cddc33532007813dcc32`
- Canonical hash: `6ffe6b862425390d56b513d84e0f121ecdade69e9981be997c91204dcdd2ab3e`
- Request: `frq_c4dd5d59f57a403f8b63cb5cb3c8b0e6`
- Pending attempts: **0**; approved completed attempts: **1**; duplicate deliveries: **0**.

Atlas has one completed incoming record for that request, a completed receiving Run, and acknowledged Relay delivery. Sofie automatically fetched the correlated result after approval and surfaced the actual `{ "acknowledged": true }` response, explicitly saying this was not a substantive research/work-scope answer. No owner-supplied resource was requested. The final acceptance sent **one** message; the entire combined qualification sent **two** (the authorized maximum). Both databases contain six historical message records, versus the four-record baseline. No further message was sent.

The used first one-call grant was revoked and replaced with the same exact identity/capability/resource/rate and original expiry `2026-09-23T04:39:48.043Z`, without extending the window. This is finite test authority, not permanent Relay authority. The durable relationship remains revision 4 and Until revoked. Grant expiry and rate limits continue to apply to future owner tests.

Post-reload read-only ledger checks found 0035 and zero pending migrations in both qualified databases, with all candidate checksums matching. **Neither 0034 nor 0035 was rerun** during restoration/final qualification. The original relationship and all historical Run/Action/approval records remain. The privacy marker has zero matches across Sofie's persisted public tables; model streams also contain no marker. Atlas's private source fixture remains private.

Canonical main independently advanced to `185edd9290879a011ae8d52f4928d3fef510eeb1` with Jev source. It was integrated through merge `301c0f8bf3ee290d2018e557c81fa8388fec3eb2`, retaining both histories and all deployment-disable controls. Permission, Federation, Action and migration implementation stayed unchanged from the live-qualified candidate. The merged model canary found a provider-incompatible root union in the newly added Jev tool schema. A minimal compatibility correction exports a root object while retaining operation-specific validation, exact native approval and disabled runtime configuration. It adds no Jev activation or provider call.

Final regression: **942 Eve tests / 120 files PASS**, TypeScript/registry/routing PASS, governance **553 classified sources / UNKNOWN=0**, Eve webpack build PASS. Builder types/manifest **149 files / release 255** and webpack build PASS. Earlier unchanged core (135), SQL native approval (28), lifecycle (16), Action context (22), Computer lifecycle (59), routine/permission/privacy matrices, migration preservation/rollback checks and four desktop/mobile/keyboard/error-state browser checks remain passing evidence. The compatibility test explicitly verifies a provider-compatible root object and rejects missing evaluate statements or statements on status.

Known limits remain explicit: Atlas's message handler returned an acknowledgement only; the earlier failed Knowledge fixture remains fenced for recovery and was not falsely relabelled as success. Successful fresh Published Knowledge retrieval and private denial are separately evidenced. No additional send was used for the main/Jev integration: its affected schema was verified with deterministic tests and the live model canary.

Production schema rollout is pending separate control: **0034 Multi-Run Conversation Lifecycle and 0035 Persistent Peer Permissions are required before deployment**. This task did not inspect or migrate Production schema, enable Production Federation, or create Production peer grants. Automatic deployment remains disabled. Local qualification must not be represented as Production readiness.

Final code checkpoint: `6ca1a80d40182bcfc1cb5caa871dc124ec438a13`. Final no-tools model canary: **PASS** after schema correction. MyEve, workers, Sofie engine, Atlas, Relay and both qualified databases remain running. The owner-testing source is clean; preservation work remains isolated.
