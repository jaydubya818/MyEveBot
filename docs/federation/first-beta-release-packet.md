# Relay + managed MyEve + MyFactory first beta

Status: **PRIVATE INVITATION ISSUED; GUIDED HANDOFF AND HOSTED ACCEPTANCE PENDING** (September 26, 2026). MyEve operates an isolated Eve for the first tester. The exact tester email and one-use invitation belong only in the protected operator handoff, never this Git packet. BYO Vercel remains an advanced option. The managed lifecycle contract and acceptance gates are in [managed-eve-first-beta.md](managed-eve-first-beta.md).

| First-user gate | Evidence now | Decision |
| --- | --- | --- |
| Relay invitation and separate owner | PR #24 merged as `aa76782`. Production deployment `dpl_CGwEMMhCx5jkgWbrFxJPuSmcdTu2` is ready. Production backup preceded migration `0024`; 25 migrations now exist, with 3 accounts, 3 users, and 2 agents unchanged. Local synthetic signup and replay denial passed; fresh hosted redemption has not | Hosted acceptance pending |
| Public Relay trust endpoint | `https://relay-jaydubya818.vercel.app/api/federation/trust` and `/api/health/ready` return 200 without Vercel SSO. Production uses Standard Protection; previews remain protected | Passed for public access |
| Managed Eve Control Plane | Operator-only registry and exact-ID provisioning, $1 rehearsal budget, archive export/verification, monitor, pause/resume, and two backed-up Orchis upgrades passed. A second disposable Eve on release 262 passed the general owner-authorized delete path: fresh 38-file export, exact permit, Relay retirement, project and Neon removal, tombstone, and public 404. Orchis is on release 262 with a dedicated project/database and $20/month AI Gateway project budget. Paired hosted Relay retirement remains untested | Guided beta; paired retirement check pending |
| Hosted Relay ↔ Eve exchange | Local isolated 18-checkpoint simulation passes both reply directions, shared Knowledge, private exclusion, revocation, and replay; no fresh external hosted owner exchange | Blocked |
| MyFactory on tester's Mac | [PR #1](https://github.com/jaydubya818/MyFactory/pull/1) merged as `1015367`. A fresh-cache preview initially failed; one-time `npm run preview:prepare` primed the pinned starter, after which the preview and full tests, typecheck, and build passed. No external host or disposable coding-to-draft-PR run | Tester-Mac gate pending |
| Invitation | Orchis Eve is live at `https://orchis-eve-beta.vercel.app`; sign-in, one model reply, owner archive validation, and Relay setup page passed. A one-use, seven-day Relay link was issued for the exact tester email and stored in the protected handoff. It has not been redeemed | Send private handoff; hosted signup acceptance pending |

The Agent dependency tree includes `langsmith@0.3.87` with a high public-prompt advisory. Its vulnerable prompt-pull calls are absent from Agent source, and the optional `RAINDROP_WRITE_KEY` is not provisioned by Builder. This is a scoped exception for one guided beta with that key absent, not a dependency fix. Reopen the gate if telemetry is enabled or before broad rollout.

## Tester experience

The tester receives one private Relay invitation bound to their exact email, then a MyEve-managed Eve URL and sign-in. They do not need a Vercel account or token. Their Eve has a dedicated Vercel project, database, secrets, and Agent identity; Blob storage is not created because this beta enables Knowledge and receipts, not file features. Relay is shared, but discovery and message or Knowledge access require explicit per-Eve grants. The owner can use **Manage → Your data → Backup & recovery** to download and verify a checksummed archive from day one. The archive reports which domains are complete or portable; credential secrets and some referenced file contents are excluded. Do not promise import until restore is implemented and tested. Long-term personal Memory is not enabled without a dedicated Supermemory credential; the first shared-data test uses owner-published Knowledge.

MyFactory runs on the tester's Mac against one approved disposable Git repository and Linear team. It is not part of automatic Eve setup. The tester requests Factory work through MyEve; a signed receipt confirms admission, not completed code. Coding, draft PR publication, merge, and deployment remain separately governed. Relay's current `/factory` route is restricted to one configured Relay account and host route, so do not promise that page to the tester.

## Release order

1. Completed: operator-only Control Plane and disposable provision/retry/monitor/export/pause/resume/cleanup rehearsal. A second disposable Eve was exported, verified, and fully deleted through the general exact-ID path; its public URL returned 404. A live Orchis upgrade from pinned source `fcce658` to `e6c0d7d` took a verified PostgreSQL backup, applied the additive migration, deployed `dpl_GS3AmP6d3jN4QuHF1cT5B5krJA76`, and passed owner readiness. Release 262's paired Relay retirement has focused tests but no hosted paired test. Failure rollback has code but has not been exercised. Keep operator review of platform spend; the $20 project AI Gateway budget is soft.
2. Completed: Orchis's isolated Eve is at `https://orchis-eve-beta.vercel.app` on release 262. The backed-up upgrade deployed `dpl_5JdJXTMLQvKTozBbJ2JCxbHfgHCP`; the public alias, owner sign-in, model reply, archive validation (38 files), Relay setup form, safe unpaired-retirement response, and post-upgrade monitor passed. Full resource IDs, export hashes, and credentials are in protected operator files.
3. Completed: create a one-use Relay invitation for the exact tester email only after step 2 and store it in the protected handoff. During the guided tester session, redeem it once in a clean browser, verify the fragment disappears, the separate account starts empty, and replay fails. Verify that an unauthorized owner cannot issue more invitations.
4. Connect the tester Eve to Relay after verifying the production signing-key fingerprint through an independent channel. Test messages and model-authored replies in both directions, one deliberately published harmless Knowledge record each way, private marker denial, and grant revocation. Do not treat the local simulation as hosted acceptance.
5. On the tester's Mac, install Node 24, Docker Desktop, and a logged-in Codex CLI. Clone MyFactory main, run `npm ci`, `npm run preview:prepare`, `npm test`, `npm run typecheck`, and `npm run build`; the prepare step fetches pinned starter dependencies once so later previews remain offline. Register one approved disposable repository and exact Linear team; give that Eve only its own host client identity and needed actions. Keep the MyFactory supervisor on loopback. Test one signed request, matching Linear issue and WorkOrder, verified receipt, retry without duplicate, and one reviewed draft PR. Do not issue Factory credentials until the host/repository/team are known.
6. Have the tester follow the actual invitation and Eve handoff. Record confusing steps, failures, rollback triggers, and signed receipts outside Git. Owner deletion is an operator-assisted, exact-permit procedure; do not claim self-service deletion or a hosted paired-retirement result yet.

Relay production is already at `aa76782`. A PostgreSQL 18 custom-format backup was made before its invitation migration. Its production health reports database, migrations, events, and federation ready. The existing BYO Builder's Relay-origin fix [PR #32](https://github.com/jaydubya818/MyEveBot/pull/32) is merged, but the Builder production alias is still protected by Vercel SSO and its deployed source SHA is unverified. Do not use it as the managed-beta handoff. Jay's earlier Relay-to-local-Factory signed receipt does not prove the tester's coding-to-draft-PR journey.

## Message for guided tester handoff

Subject: Your Relay + MyEve beta invitation

Hi,

You're invited to our guided beta. Start with your personal, one-use Relay link: **[insert the invitation issued for this exact email]**. Please do not forward it. It expires seven days after issue.

Your Eve is already set up for you at **https://orchis-eve-beta.vercel.app**. Sign in using the private setup details we provide separately. You do not need a Vercel account. Once Eve answers a harmless chat message, open **Manage → Relay** and connect your new Relay account; we'll help register its Agent with only the permissions you choose. Creating an account or discovering another Agent does not share your data. In Eve, **Manage → Your data → Backup & recovery** lets you download a copy of your exportable data at any time.

For the first shared Knowledge exercise, create a harmless test record, choose the exact other Agent that may query it, and approve an expiring grant. Keep personal memories and customer data private. We'll verify a reply in each direction, then revoke the test grant together. Long-term personal Memory is not enabled in this pilot.

We'll also walk you through installing [MyFactory](https://github.com/jaydubya818/MyFactory) on your Mac with one disposable Git repository. Please have Node 24, Docker Desktop, a logged-in Codex CLI, and access to the agreed Linear team for that session. Setup includes one `npm run preview:prepare` step while online; local previews then use the pinned offline cache. A Factory receipt confirms arrival; you decide whether to run code work and publish a draft PR.

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
