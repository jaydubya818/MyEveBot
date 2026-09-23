# Combined Multi-Run and Persistent Peer Permissions qualification

Status: deterministic qualification and corrected builds passed; live qualification pending the pushed checkpoint. Not yet qualified for canonical merge. Production migrations and feature enablement are not authorized by this local qualification.

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

## Remaining release gates

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

Status remains **NOT YET FULLY QUALIFIED / NOT MERGED** until final source activation, last bounded send and final verification complete. Production migration and enablement remain untouched.
