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
