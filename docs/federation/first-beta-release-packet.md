# Relay + MyEve + MyFactory first beta

Status: **NOT READY TO SEND** (September 26, 2026). This is a guided, invitation-only pilot for one external owner. Do not replace the missing Builder URL with Sofie's personal Agent URL or treat the local MyFactory desk as a public service.

| First-user gate | Evidence now | Release decision |
| --- | --- | --- |
| Relay invitation and separate owner | Invitation code is merged into Relay main; a synthetic signup created a separate account and denied replay. PR #24 keeps the token out of the URL query. Production migration lineage and deployment remain unverified | Blocked |
| Public Relay trust endpoint | The intended Relay alias redirects unauthenticated requests to Vercel SSO; Builder cannot verify a signing key through it | Blocked |
| Relay ↔ MyEve messages and Knowledge | Local isolated 18-checkpoint simulation passes; no fresh external hosted owner exchange | Blocked |
| MyEve Builder | Current main plus PR #32 passes pairing tests, typecheck, manifest and build; public Builder deployment absent. The former hardcoded Relay origin returns 404 | Blocked |
| MyEve Agent dependency review | High-severity transitive `langsmith` audit finding in Agent telemetry dependency tree; runtime exposure unresolved | Blocked |
| MyFactory on tester's host | Fresh checkout tests, typecheck and build pass with the test-only fix in PR #1; no external host or disposable coding-to-draft-PR run | Blocked |
| Copy-ready invitation | Draft below is complete; one-use link and verified Builder URL do not exist yet | Do not send |

## What the tester gets

- A separate Relay owner account created from a one-use invitation sent to their exact email.
- Their own MyEve Agent, database, and Vercel project. The Agent connects to Relay only after its owner verifies Relay's pinned signing identity and registers it.
- A MyFactory supervisor on an approved Mac, bound to an approved Git repository and Linear team. The tester requests Factory work from their MyEve Agent, then the local host admits it. A signed receipt confirms admission; coding, draft PR publication, merge, and deployment are later owner decisions.

The first pilot should use the tester's Mac and repository for isolation. If Jay hosts the pilot instead, record the approved repository, its access, and the trusted host operator before issuing any factory credential. MyFactory is not a multi-tenant hosted service or part of Builder's automatic setup. Relay's current Factory route is additionally restricted to one configured Relay account (`MYFACTORY_RELAY_ACCOUNT_ID`) and one host route. Do not promise that a tester can create Factory work from Relay's `/factory` page. The three-product pilot uses Relay for Agent communication and MyEve for Factory requests; multi-owner Relay-to-Factory routing is a separate release.

## Production release order and stop gates

1. Freeze exact Relay and MyEve/Builder release SHAs against the deployed baselines. Do not deploy either entire development worktree: both include unrelated changes beyond the production line. Relay main contains the beta invitation implementation; [PR #24](https://github.com/jaydubya818/relay/pull/24) improves token handling. Relay PR #20's Factory routing patch was closed without merging and is a separate release decision.
2. Back up the production Relay database, inventory its applied migrations, and rehearse the migration from that exact state. Current Relay main adds `drizzle/0024_beta_invites.sql`; never assume intervening migrations are already live. Keep `RELAY_ALLOW_SIGNUP=false`. Set `RELAY_BETA_INVITER_EMAILS` to the exact pilot operator email and confirm the existing owner can still sign in while unauthorized owners cannot issue invitations. The old `RELAY_REQUIRE_INVITE` and `RELAY_TESTER_INVITE_ISSUER_EMAIL` settings from a different local branch do not control current main.
3. Deploy MyEve Builder from the monorepo root with a Builder-only build and `apps/builder/.next` output. The separate `jaydubya818/myeve-builder` Vercel project has these settings, but **no live deployment**. Vercel twice labeled CLI deployments production, including one sent with `--target=preview`; both were removed and the alias has no deployment. Verify the next target in the deployment result before sharing it. [Builder PR #32](https://github.com/jaydubya818/MyEveBot/pull/32) makes `BUILDER_RELAY_ORIGIN` an exact operator-configured HTTPS origin; current main's hardcoded origin returns 404. Make Relay's `/api/federation/trust` publicly reachable without Vercel SSO, supply its signing-key fingerprint to the tester through an independent trusted channel, and have Builder verify that fingerprint before creating the tester's project. The intended Relay alias currently redirects unauthenticated requests to Vercel SSO. Verify `/api/template-version` from the hosted Builder and complete a fresh account's deployment before trusting the URL.
4. Keep Relay's `NEXT_PUBLIC_RELAY_URL` on the verified production HTTPS origin. Deploy the reviewed Relay main invitation code and PR #24 after migration rehearsal, then issue one synthetic invitation. In a clean browser, redeem it once, verify the URL fragment is removed, the separate account is empty, and replay fails. The current merged Relay UI has no `/setup` page or `RELAY_TESTER_BUILDER_URL`; the guided invitation email must include the separately verified Builder URL.
5. Provision the tester's MyFactory host: Node 24, Docker Desktop, logged-in Codex CLI, approved repository and checks, a private host client token, receipt signing key, Linear connection, and `FACTORY_HOSTED_INTAKE=true`. Keep the supervisor on loopback and start its login service. Register the tester's `myeve` client with only needed actions and the approved repository route. The tester's MyEve Vercel project needs its own authorized Linear connector and server-side `MYFACTORY_*` settings; attaching Jay's connector to Jay's project does not authorize a tester's project. Verify the host's exact Linear team before creating any issue.
6. Run hosted acceptance on the release SHAs: MyEve chat reply; Relay Agent connection; exact peer message and model-authored reply in each direction; one explicitly published harmless Knowledge record in each direction; private marker denial; grant revocation; then one MyFactory request from the tester's MyEve. Compare the Linear issue, local WorkOrder, request ID, and verified signed receipt; retry the same ID and confirm no duplicate. Complete one bounded coding attempt and reviewable draft PR on a disposable repository before claiming the full Factory journey. The owner reviews publication; no automatic merge or deployment. Jay's existing Relay `/factory` acceptance is separate and does not authorize a new Relay owner.
7. Have a person other than the operator follow the invitation in a fresh account and report confusing steps. Record deployment IDs, test accounts, receipts, failures, and rollback triggers without putting credentials or one-use links in Git. Only then mark this packet ready to send.

The current local three-component federation simulation passed 18 checkpoints, including both reply directions, published Knowledge, private exclusion, revocation, and replay handling. It substituted a local model provider and did not close hosted or independent security gates. MyFactory's existing hosted Sofie and Relay tests proved routing through Linear to a local WorkOrder and signed receipt; they did not exercise a coding-to-draft-PR journey. These limits remain release blockers for a promise of full three-product use.

Current MyEve main plus Builder PR #32 passed five pairing tests, typecheck, the release manifest, and a webpack production build. The Builder Vercel project still has no hosted deployment. MyFactory's hydrated checkout passed its full test suite, typecheck, and production build after increasing a process-start fixture's timeout from 200 ms to three seconds; [MyFactory PR #1](https://github.com/jaydubya818/MyFactory/pull/1) carries that test-only fix for review. The Builder dependency audit reported a transitive high-severity `langsmith` advisory via `raindrop-ai` in the Agent workspace. The package did not appear in the built Builder server/static JavaScript, but the Agent may load it through telemetry; review the Agent runtime path and patch or document a scoped exception before inviting a user. These checks do not replace hosted acceptance.

## Message to send after all gates pass

Subject: Your Relay + MyEve + MyFactory beta invitation

Hi,

You're invited to a guided beta. Start with your personal, one-use Relay link: **[insert the invitation issued for this exact email]**. Please do not forward it. The link expires seven days after it is issued.

Create your Relay account, then open **[insert the verified MyEve Builder URL]** to build your own Agent in your Vercel account. You will need a Vercel account and a database for your Agent. Builder asks for a Vercel token during setup; create it in your Vercel account and enter it only in Builder, never send it to us. In Builder, choose **Connect to Relay beta** and enter the signing-key fingerprint we provide separately. After your Agent answers a harmless chat message, open **Manage → Relay** and register it with your Relay account. Creating an account or discovering another Agent does not grant it access to your data.

We'll walk you through installing [MyFactory](https://github.com/jaydubya818/MyFactory) on your Mac and registering one approved test repository. Before that session, please have Node 24, Docker Desktop, a logged-in Codex CLI, a Git repository you can safely use for testing, and access to the agreed Linear team. MyFactory stays local; your MyEve Agent sends signed requests through Linear. A factory receipt means the request arrived, not that code is finished. You decide whether to start a coding run and whether to publish any draft PR.

For the first shared-memory exercise, create a harmless test Knowledge record, choose the exact other Agent that may query it, and approve an expiring grant. Keep personal memories and real customer data private. We'll verify a message and reply in each direction, then revoke the test grant together.

Reply here when your Relay account and MyEve Agent are ready, or if any setup step is unclear. Please don't send passwords, Vercel tokens, Linear tokens, or private keys in email or chat.

## Operator handoff fields (fill per user; never publish tokens)

| Field | Required value |
| --- | --- |
| Invited email | Exact external tester email, recorded outside Git |
| Relay URL | `https://relay-jaydubya818.vercel.app` after the invitation release is verified there |
| One-use invitation | Issued in Relay Settings for that email after the production gate; send privately |
| Builder origin | Verified deployed origin; **currently absent** |
| Tester MyEve project | Name, deployment ID, database migration status, Relay pin and Agent registration receipt |
| Factory host | Tester Mac/operator, approved repository, team, service health, `myeve` client registration and receipt public key |
| Acceptance evidence | Message/reply receipts, published Knowledge query, private denial, revocation, MyEve factory receipt and one reviewed draft PR |

Never put the one-use invitation, host client token, production environment file, Vercel token, or private signing material in this packet.
