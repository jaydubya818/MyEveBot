# Relay + managed MyEve + MyFactory first beta

Status: **NOT READY TO SEND** (September 26, 2026). This is a guided, invitation-only pilot for one external owner. MyEve operates an isolated Eve for each tester. The existing BYO Vercel Builder stays available as an advanced option, not the first-beta onboarding route. The managed lifecycle contract and acceptance gates are in [managed-eve-first-beta.md](managed-eve-first-beta.md).

| First-user gate | Evidence now | Decision |
| --- | --- | --- |
| Relay invitation and separate owner | PR #24 merged as `aa76782`. Production deployment `dpl_CGwEMMhCx5jkgWbrFxJPuSmcdTu2` is ready. Production backup preceded migration `0024`; 25 migrations now exist, with 3 accounts, 3 users, and 2 agents unchanged. Local synthetic signup and replay denial passed; fresh hosted redemption has not | Hosted acceptance pending |
| Public Relay trust endpoint | `https://relay-jaydubya818.vercel.app/api/federation/trust` and `/api/health/ready` return 200 without Vercel SSO. Production uses Standard Protection; previews remain protected | Passed for public access |
| Managed Eve Control Plane | No durable operator registry or tested provision, upgrade, monitor, budget, export, and delete lifecycle exists. Current Builder requires the tester's Vercel token and stores no deployment record | **Launch blocker** |
| Hosted Relay ↔ Eve exchange | Local isolated 18-checkpoint simulation passes both reply directions, shared Knowledge, private exclusion, revocation, and replay; no fresh external hosted owner exchange | Blocked |
| MyFactory on tester's Mac | Fresh checkout tests, typecheck, and build pass with test-only PR #1; no external host or disposable coding-to-draft-PR run | Blocked |
| Invitation | No one-use link has been issued; no managed tester Eve URL exists | Do not send |

The Agent dependency tree includes `langsmith@0.3.87` with a high public-prompt advisory. Its vulnerable prompt-pull calls are absent from Agent source, and the optional `RAINDROP_WRITE_KEY` is not provisioned by Builder. This is a scoped exception for one guided beta with that key absent, not a dependency fix. Reopen the gate if telemetry is enabled or before broad rollout.

## Tester experience

The tester receives one private Relay invitation bound to their exact email, then a MyEve-managed Eve URL and sign-in. They do not need a Vercel account or token. Their Eve has a dedicated Vercel project, database, storage, secrets, and Agent identity. Relay is a shared service, but discovery and message or Knowledge access require explicit per-Eve grants. The owner can use **Manage → Data → Backup & recovery** to download and verify a checksummed archive from day one. The archive reports which domains are complete or portable; credential secrets and some referenced file contents are excluded. Do not promise import until restore is implemented and tested.

MyFactory runs on the tester's Mac against one approved disposable Git repository and Linear team. It is not part of automatic Eve setup. The tester requests Factory work through MyEve; a signed receipt confirms admission, not completed code. Coding, draft PR publication, merge, and deployment remain separately governed. Relay's current `/factory` route is restricted to one configured Relay account and host route, so do not promise that page to the tester.

## Release order

1. Build and test the operator-only managed Eve Control Plane against a disposable environment. Record the exact tester-to-project/database/storage mapping without secrets in Git. Rehearse provision retry, one upgrade with backup and rollback, health checks, a project pause, owner export and archive verification, and complete deletion of a disposable Eve and its dedicated storage. Set and verify a per-project AI Gateway budget and operator platform-spend pause threshold.
2. Deploy the Control Plane and managed Eve template from pinned, reviewed source. Provision the first tester Eve under MyEve's Vercel scope. Verify project, database, storage, credential, and Agent isolation. Keep its Relay grants empty until the owner acts. Verify owner sign-in and an actual archive download. Record release SHA, deployment IDs, health, model budget, and export hash in the protected registry.
3. Create a one-use Relay invitation for the exact tester email only after step 2. In a clean browser, redeem it once, verify the fragment disappears, the separate account starts empty, and replay fails. Verify that an unauthorized owner cannot issue more invitations.
4. Connect the tester Eve to Relay after verifying the production signing-key fingerprint through an independent channel. Test messages and model-authored replies in both directions, one deliberately published harmless Knowledge record each way, private marker denial, and grant revocation. Do not treat the local simulation as hosted acceptance.
5. On the tester's Mac, install Node 24, Docker Desktop, and a logged-in Codex CLI. Register one approved disposable repository and exact Linear team; give that Eve only its own host client identity and needed actions. Keep the MyFactory supervisor on loopback. Test one signed request, matching Linear issue and WorkOrder, verified receipt, retry without duplicate, and one reviewed draft PR. Do not issue Factory credentials until the host/repository/team are known.
6. Have someone other than the operator follow the actual invitation and Eve handoff. Record confusing steps, failures, rollback triggers, and signed receipts outside Git. Only then mark this packet ready and send it.

Relay production is already at `aa76782`. A PostgreSQL 18 custom-format backup was made before its invitation migration. Its production health reports database, migrations, events, and federation ready. The existing BYO Builder's Relay-origin fix [PR #32](https://github.com/jaydubya818/MyEveBot/pull/32) is merged, but the Builder production alias is still protected by Vercel SSO and its deployed source SHA is unverified. Do not use it as the managed-beta handoff. Jay's earlier Relay-to-local-Factory signed receipt does not prove the tester's coding-to-draft-PR journey.

## Message to send after all gates pass

Subject: Your Relay + MyEve beta invitation

Hi,

You're invited to our guided beta. Start with your personal, one-use Relay link: **[insert the invitation issued for this exact email]**. Please do not forward it. It expires seven days after issue.

Your Eve is already set up for you at **[insert the verified, isolated Eve URL]**. Sign in using the private setup details we provide separately. You do not need a Vercel account. Once Eve answers a harmless chat message, we'll help connect its Agent to Relay with only the permissions you choose. Creating an account or discovering another Agent does not share your data. In Eve, **Manage → Data → Backup & recovery** lets you download a copy of your exportable data at any time.

For the first shared-memory exercise, create a harmless test Knowledge record, choose the exact other Agent that may query it, and approve an expiring grant. Keep personal memories and customer data private. We'll verify a reply in each direction, then revoke the test grant together.

We'll also walk you through installing [MyFactory](https://github.com/jaydubya818/MyFactory) on your Mac with one disposable Git repository. Please have Node 24, Docker Desktop, a logged-in Codex CLI, and access to the agreed Linear team for that session. A Factory receipt confirms arrival; you decide whether to run code work and publish a draft PR.

Reply when your Relay account and Eve sign-in work, or if any step is unclear. Please don't send passwords, Linear tokens, or private keys in email or chat.

## Operator handoff (protected registry; never publish tokens)

| Field | Required value |
| --- | --- |
| Tester | Exact invited email and Relay account ID, stored outside Git |
| Relay | `https://relay-jaydubya818.vercel.app`; one-use invitation issued only after managed Eve acceptance |
| Eve | Environment ID, owner ID, dedicated Vercel project, deployment, database, Blob store, release SHA, Relay Agent identity/key, sign-in handoff |
| Operations | Last health check, backup/export hash and completeness, AI Gateway project budget, platform-spend pause threshold, deletion/retention state |
| Factory | Tester Mac/operator, approved disposable repository, exact Linear team, host identity, signing key fingerprint, signed receipt |
| Acceptance | Owner export, message/reply receipts, published Knowledge, private denial, revocation, Factory receipt, and reviewed draft PR |

Never put the invitation, passwords, host client token, production environment file, Vercel token, database URL, or private signing material in this packet.
