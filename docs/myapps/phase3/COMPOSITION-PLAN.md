# MyApps Phase 3 production composition plan

**Production composition: NOT_READY. Production integration: NOT_RUN.** This reviewed preparation plan authorizes no merge, installation, deployment, paid operation, production grant or feature exposure. The qualified Phase 1/2 candidates and evidence remain immutable.

## Exact source and adoption order

See `sources.json` for machine-readable pins. Reconciliation on October 9, 2026 (America/Los_Angeles):

| Source | Exact revision | Relationship / disposition |
|---|---|---|
| MyEve main | `2ef364024bc1cdd3e10ec28f3d340119c6f87d41` | ancestor of accepted Phase 2 |
| MyEve Phase 2 | `500f17a463682b6e4a2c445f99a04fcf77eaea74` | preserved; 12 commits ahead of main |
| MyEve external-alpha engineering base | `c2db7ae413665b55441cfdec558659ffa186809b` | independent authority branch |
| MyEve engineering / draft PR #67 | `8338309582d6806829dec1ae1beef301d6b52425` | ancestor of UX source; do not adopt automatically |
| MyEve UX remediation source | `474bd465c2773bf55536b1914045c646deaa644f` | `codex/myeve-owner-experience`; 15 commits beyond engineering |
| MyFactory main | `030b1a51017f3159436b93817ed2d5bf6ae18288` | ancestor of accepted Phase 2 |
| MyFactory Phase 2 | `0e22176fbeaaeca54f268af6e1b8b00cf9fe528b` | preserved; 5 commits ahead of main |
| MyFactory external-alpha base | `2eb5f04f5824dc6957d0732fc7abf35a4d831537` | private source / authority foundation |
| MyFactory engineering / draft PR #12 | `fa48a820ba185eb9b891130c78166463b61cba74` | 8 commits beyond engineering base |
| Optional MyEve MissionControl consumer | `4b8cacce64f260b0816ff615222a3cac621d749b` | excluded; ordinary owner apps do not depend on it |

The separate external-alpha QE remediation checkout currently starts at UX `474bd465` and contains unpublished work. Its corrected source cannot be assigned an invented SHA, copied from a dirty checkout or treated as accepted. QE-009 context budgeting, QE-008 accounting admission, QE-002 race/evidence and QE-005 journey coverage are independent release concerns. The current pinned UX source remains subject to that release hold even if the narrower MyApps rehearsal passes.

Required future adoption sequence: first settle the external-alpha corrected candidate and its own qualification; then refresh all source pins and conflict/migration analysis; review exact MyEve and Factory composition diffs together; explicitly authorize branch integration; derive new FactoryVersion and installation identities; independently qualify the real production adapters and rollback plan; separately authorize migrations/deployment/activation. A green rehearsal does not waive any of these gates. No dependency PR is merged by this work.

## Conflicts and bounded preparation

Current-main plus Phase 2 is textually compatible in both repositories. External-alpha engineering conflicts with MyEve's schema catalog/tests. UX adds a third conflict in `apps/eve/lib/beta-integration/runtime.ts`: its private Result acceptance consumer and the MyApps installation consumer both enter the same canonical Inbox delivery path. Factory engineering plus Phase 2 is textually clean, but production contracts still differ.

The offline `scripts/myapps-composition/materialize.mjs` rehearsal:

1. Requires exact committed preparation inputs, accepted Phase 2 ancestry and an absent output directory.
2. Uses Git tree-level conflict analysis with an exact conflict allowlist. Unknown conflicts stop execution.
3. Preserves both Inbox consumers, with the MyApps local-only exact-request consumer before private Result acceptance. Neither decision is authority for the other.
4. Moves the proposed MyApps migration to `0093_myapps_runtime.sql`, preserving its exact SQL bytes. Existing external-alpha `0085`–`0092` remain unchanged.
5. Keeps external-alpha's required schema at `0092`, older alpha at `0084` and personal requirements at `0082`/`0083`. The catalog may advance without silently advancing installed release requirements.
6. Classifies the two MyApps routes under an existing **denied** family in the disposable snapshot only. The external-alpha allowed families/capabilities are unchanged; nested unknown routes remain denied.
7. Records both input SHAs, composed tree IDs and parentless snapshot commit IDs in `composition.json`; creates only detached disposable checkouts. It updates no branch refs and creates no adoption merge.

This preparation changes no app runtime implementation. The rehearsal checks the runtime's exact Phase 2 bytes and key alpha authority/accounting/Proof bytes. The snapshots are test artifacts, never release candidates or installed source.

## Change impact and compatibility requirements

| Surface | Current compatibility and required adoption work |
|---|---|
| Canonical Work | WorkStore remains sole lifecycle authority. The MyApps deterministic adapter creates/resumes exact Work and snapshots version/generation. Production request orchestration must use approved canonical admission; its nominal fixture cost ceiling is not a paid allowance. |
| Factory admission | Reference callback rechecks exact Work. Production must bind owner/project/task/criteria/base/source/FactoryVersion, lease, deadline, single consumption, revocation and UNKNOWN fencing through the established authority issuer. No reference callback or model flag can stand in for this. |
| Candidate custody | Immutable declarative package remains accepted. A production adapter must use private credential-free custody and exact owner/app/version/digest receipts; separately verify bounded retrieval and producer/verifier isolation. |
| Result/Proof | Reference signed Result and EvidenceProvider validation are compatible. Production must bind its actual keyring, version, candidate, run, cleanup and accounting into canonical retained Proof. Private Result acceptance, app installation, publication and deployment remain distinct. Historical Proof must not be relabeled or upgraded. |
| Owner acceptance | Resolve both consumers in canonical Inbox. Exact retained app approval controls installation only; stale outcomes cannot poison later decisions. Private Result acceptance does not install an app. |
| Shared accounting | Deterministic MyApps has no provider calls and creates no paid grants. Its production builder needs central bounded reservation, per-operation reporting, conservative UNKNOWN retention, no redispatch after uncertain send, and original-resource recovery. Existing alpha allowances must not be borrowed, reset or refunded. Run the established accounting regressions against composition; no new ledger is introduced. |
| Authentication | Native adapter reuses authenticated web identity and same-origin POST; agent denies guests/delegation and cannot install. Production bootstrap must inject trusted policy, with no browser-authored owner/grants and no fixture login. |
| Owner isolation | Shared owner context and forced RLS plus explicit owner/app/version/digest checks are preserved. Production DB role must not bypass RLS; verify pool reset, non-superuser privileges and cross-owner errors with deployed infrastructure. |
| App installation | Runtime/target/proof/capabilities/preview/Work binding is preserved. Production needs separately approved target identity, durable config and exact private installation policy. Verification alone never installs. |
| Persistent storage | Same PostgreSQL store for UI/Sofie. No Memory, Files, connected-account, secret or arbitrary generated-code access. Migration/operation/receipt/audit transactions and restart/rollback remain required. |
| Migrations | Numeric collision requires a reviewed later number after the final adopted ledger. `0093` is valid only for this pinned rehearsal. No migration is applied outside disposable tests. See migration procedure below. |
| Feature policy | Production/Vercel activation remains hard-disabled. External-alpha navigation, routes and capability allowlists remain closed to MyApps. A unified capability resolver under another workstream is not installed authority. |
| Publication | Disabled. No generated PR, repository push, merge or deployment is granted by app installation. Operator checkpoint source pushes are separate. |
| Relay | No Relay requirement for local owner CRM. Future outbound capabilities require qualified exact Relay owner/grant contracts and separate review; no inherited grant or account. |

## Configuration, targets, dependencies and secrets

Keep `MYAPPS_LOCAL_INTEGRATION` unset in every deployment. The current runtime additionally denies production NODE_ENV and Vercel; do not remove these gates as part of readiness work. Local rehearsal explicitly injects the pool, authenticated policy, runtime id, target and Result verifier. New production bootstrap/flag semantics require a separate implementation authorization.

The intended logical host is the existing canonical MyEve web/agent runtime plus its canonical PostgreSQL store, and the existing MyFactory control plane/verifier/custody services. No standalone MyApps service is required. **Exact production project, database, custody store, region, role and release target identities remain unselected/unverified**; do not substitute current tester installations. No deployment variables, secrets, identities or grants are created here.

Dependencies: Node 24, the repository lockfiles, canonical Work/Inbox/Result contracts, PostgreSQL migrations and RLS, trusted declarative CRM/runtime, immutable Factory source/configuration, isolated verifier and private custody. Browser qualification uses Playwright fixtures. Production custody/signing keys must be supplied by an approved server-only provisioning path, distinct from fixture keys and other release profiles. Inspect key identifiers/public trust and secret containment without logging private material. Rotation/revocation must preserve historical signature verification. The production operations window, ownership and incident response require explicit assignment.

FactoryVersion changes whenever the adopted Factory source/configuration or bound runtime bytes change. Derive it after final source integration, using the real executor/verifier/source/custody/model/pricing configuration; reference-process/no-model identity cannot qualify production. Existing installed FactoryVersion pins and historical evidence remain unchanged.

## Migration and rollback procedure (future authorization required)

- Inventory the exact target ledger, checksums, database role and data; take a tested backup. Confirm MyApps has never been applied there. Test the same ordering in a restored disposable copy.
- Apply the canonical adopted migrations through the external-alpha/UX tip only where that release is independently authorized; then apply the later additive MyApps migration on an explicitly selected non-alpha target. Confirm all preexisting migration names/checksums are unchanged.
- Phase 2 fixture databases that already recorded `0085_myapps_runtime.sql` cannot blindly consume the renamed migration. They require a separately reviewed checksum/ledger reconciliation or data-preserving transfer; no history rewrite or second table creation is authorized here. This rehearsal tests clean installs and upgrades from canonical UX databases, not that transfer.
- New schema creates no owner policy, activation, app installation, spending authority or production grant. Verify empty authority/admission tables before bootstrap.
- Rollback first disables new app admission and execution, then fences in-flight Work and reconciles original resources/UNKNOWN spend. Preserve app data, custody, receipts and immutable evidence. Restore a compatible application release; do not drop additive tables or roll back storage destructively.
- App behavior rollback remains a newly verified, explicitly approved successor, retaining expanded storage values while denying removed mutation fields. Release rollback is separate and requires backup/restore and historical keyring qualification.

## MySkills and MissionControl

MySkills has only one accepted bounded historical profile, `tdd-python-clamp-offline-v1`. Its later API profile failed and security profile remains partial; general Skills are unqualified. MyApps packages continue rejecting Skill execution. Record future qualified profile id/version/digest/contracts only through a separately reviewed capability extension; no profile is enabled now. MyApps works without any MySkills production activation.

MissionControl may eventually submit bounded WorkOrders using existing delegation. It must not become the policy owner, mandatory router, scheduler or database for direct Sofie → MyFactory owner apps by accident. The optional consumer branch is inventoried but excluded from the rehearsal. No policy-ownership decision from another active workstream is assumed.

## Deterministic qualification and production effects

Run the exact composed snapshot pair: contracts, migration uniqueness and upgrade preservation, shared runtime types/build, Factory custody/Result tests, real PostgreSQL Work/Inbox/app lifecycle, browser Golden Journey, UI/Sofie state, independent proof validation, updates/rollback, cross-owner/app denials and failure recovery. Also run the pinned external-alpha feature/proxy/policy, allowance/accounting, Work-authority, Result ingestion and private-acceptance regressions. Fixture keys/identities/databases only; model operations zero. Fresh-clone and hosted CI must regenerate the recorded source snapshots, and an independent read-only review must assess exact preparation commits and the plan.

Expected production effects of this preparation: **none**. Expected effects of a future authorized rollout: additive private tables, authenticated owner app routes/tool exposure on a selected non-alpha target, app activity/audit/storage growth, and bounded Factory jobs only after exact authority/paid approval. None is activated here.

Before production READY, separately qualify the real bootstrap/targets/role/signers/custody, authenticated live request-to-Result transport, budget admission and UNKNOWN/recovery, deployment packaging of UI assets, isolation under production credentials, backup/restore, rollout/rollback, monitoring and owner-visible error states. Source and deterministic success cannot satisfy those gates.

Monitoring plan for a future rollout: correlate owner/Work/version/generation/app/candidate/runtime/target/Result ids without secrets; watch denied stale/cross-owner grants, pending Inbox decisions, migration readiness, transaction failures, orphaned custody, lease/cleanup deadlines and UNKNOWN accounting. On isolation breach, signature/binding mismatch, unexpected paid admission or lost cleanup, disable admission immediately and reconcile original resources. Assign operator and validation window before activation.

References: local canonical source/tests at the pinned revisions; [Git tree-level rehearsal semantics](https://git-scm.com/docs/git-merge-tree); [PostgreSQL row-security role and FORCE behavior](https://www.postgresql.org/docs/17/ddl-rowsecurity.html). See the workspace Phase 3 report for final SHAs, test evidence, hosted runs and independent review.
