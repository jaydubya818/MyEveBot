# MyEve × Relay qualification

Final result: **MYEVE FEDERATION PASSED_LIVE** — isolated local qualification only.

Completed 2026-09-19T16:51:46.862Z. Implementation commit `2f41e52979b1056f339f217e40ae48f884aa1c18`.
The subsequent evidence commit contains this report and the runnable qualification harness;
its Git HEAD is the final integration branch HEAD, not a production release.

| Qualification boundary | Status | Evidence |
| --- | --- | --- |
| Relay federation protocol, previous disposable-platform mission | PASSED_LIVE | Relay `614c638d6fc4099db8064540326f5de4438e93a1`; 46 previous live checks |
| Automated MyEve qualification | PASSED | 130 Node tests; 437 Vitest tests (35 adapter); both workspace builds/typechecks; 25 migrations |
| MyEve adapter × independent disposable Ava | PASSED_LIVE | 42 final live assertions; real model execution; separate persistence containers |
| MyEve owner sharing UI | PASSED_LIVE | Actual Next production build; seven browser assertions against disposable MyEve PostgreSQL |
| Relay federation compatibility rerun | PASSED | 17 tests against separate disposable PostgreSQL |
| Production multi-platform deployment | NOT_RUN | No rollout, merge, default enablement, or release-tag changes |
| Independent security review | NOT_RUN | These implementation tests are not an independent review |

## Requested 25-point report

1. **Repository / branch / base / HEAD.** Canonical MyEve `/Users/jaywest/Myeve`,
   `codex/openbot`, base `74fee5b1fdc8ec7c705a9087d9bdf58992b8f27c`, was clean at initial inspection. This mission did not modify that checkout.
   Concurrent work later advanced it to `81979b6d367776366e930278fdad897d63956fc5`
   and left additional uncommitted changes; those were not incorporated or altered.
   Integration worktree `/Users/jaywest/Documents/ChatGPT/New project/myeve-relay-federation`,
   branch `feat/relay-federation-adapter`. Implementation HEAD `2f41e52979b1056f339f217e40ae48f884aa1c18`;
   final branch HEAD additionally commits qualification evidence.
2. **Relay source.** `/Users/jaywest/Documents/ChatGPT/New project/relay-federation`,
   `codex/relay-federation`, unchanged HEAD `614c638d6fc4099db8064540326f5de4438e93a1`. Prior federation
   baseline `194b3a074e85e8300d9d510b3016fb00290378cb`. No protocol modifications.
3. **Adapter architecture.** Transport-only contracts, pinned Ed25519 verification,
   separate encrypted owner-session and Agent credentials, durable inbox, explicit
   publication snapshots, constrained projection reader, independent MyEve authorization,
   source-owned artifacts, signed receipt verification, and an opt-in polling worker.
4. **Sofie registration.** Real canonical local Agent `agent_9069a813-756b-4652-b80f-5889638633ed`
   registered by authenticated Jay owner action. Durable address
   `relay://acct_9f5936e86d98465190c44d64f8176012/agt_7660351d4567421489410433a74f6b85`. Address survived credential rotation.
5. **Publication projection.** Owner-selected Fact and Insight copied only into a local
   MyEve publication projection. Relay received references, revisions, visibility/audience,
   and authorized bounded responses. PRIVATE is the default; SHARED, UNLISTED and PUBLIC
   remain explicit choices. PUBLIC visibility does not silently install anonymous/public
   query authority: the existing Relay grant/public-query policy still governs retrieval.
6. **Explicit publication UI.** Manage → Relay displays exact content, type, reference,
   revision, provenance, confidence, audience, expiry, count and exclusions. The browser
   selected only the public Atlas Fact, observed PRIVATE by default, previewed PUBLIC,
   then explicitly confirmed active version 1. Preview hashes expire and bind confirmation;
   canonical revisions are rechecked before publishing.
7. **knowledge.query.** Real HTTPS Relay delivery, target/issuer/key/expiry checks,
   exact-reference projection retrieval, typed records and owner-published provenance.
   ANSWER_QUERY is explicitly rejected; synthesis is not claimed.
8. **Private Knowledge isolation.** A denied query produced no MyEve inbox row. During
   authorized retrieval, traced SQL touched projection/adapter state, with no canonical
   Knowledge, Memory, Goals, conversations, Workspace or Run-table reads. The pure query
   function has no canonical repository/runtime imports and receives only a frozen reader.
9. **Prompt-injection fencing.** Three live private/context-override attacks returned
   only confirmed references. The retrieval query text cannot invoke tools, SQL, private
   repositories, or an unrestricted Agent runtime. This boundary is code-enforced.
10. **Disclosure receipts.** Actual Relay signed audit exports were verified with the
    pinned key, complete chain and manifest, then imported through MyEve's owner API.
    MyEve displays requester/target Agent, view/version, references/count, timestamp,
    grant and policy. Local activity is separately labeled; receipt content is metadata only.
    Relay currently has no remote audit-export API, so import is explicit rather than
    inventing a MyEve-specific protocol endpoint.
11. **Messaging.** Separate message grant required; authenticated incoming message,
    durable replay handling, bounded retention, conversation mapping and MyEve reply passed.
12. **External Inbox.** Incoming, outgoing, waiting/needs approval, completed and denied
    views; local Run correlation and exact work decisions. Receipt retry survives restart.
13. **work.request.** Research, analysis, summarization and artifact-generation requests
    use an independently configured accept/reject/approval policy, actual Agent capability
    checks, local budget limits and the existing ActionGateway. Default is owner approval.
14. **Local-authority refusal.** Relay admitted the email request; MyEve returned REJECTED
    with `MYEVE_LOCAL_POLICY_DENIED`, without creating a local execution Run or sending email.
    Both Relay lifecycle and MyEve decision evidence persisted.
15. **Safe execution.** Real MyEve Task `task_e1c329f3-5071-4e75-add0-56ca12bbab14` correlated to Relay request
    `frq_635b13c1487f408f8d3a45d93c4db169`. Exact local approval, ActionGateway and configured Sofie model
    produced a completed Run, evidence and provider receipt `aitxt-QgNZGB8EptjFrET3cHWVIx7B`;
    recorded model cost `0.006468`, one model step. This is a bounded MyEve AI SDK
    executor using real Agent identity/capabilities/model and canonical Runs, with only
    explicitly shared artifact context. It does not launch the unrestricted Eve chat/tool runtime.
16. **Artifacts.** Source-owned HTTPS retrieval required expiring source signature,
    pinned recipient proof, exact audience, byte size and SHA-256. No bearer URL alone
    sufficed. Full model output is encrypted in MyEve before the normal bounded action
    receipt is stored; the complete artifact, checksum and authorized transfer were verified.
17. **External Knowledge.** Ava's publication was queried over Relay and retained in
    `myeve_relay_external_context` with source owner/Agent, publication/version and expiry.
    Canonical MyEve Knowledge count remained unchanged; no automatic promotion.
18. **Restart/idempotency.** MyEve restarted after durable claim but before execution CAS;
    processing resumed once. Duplicate signed delivery did not execute again. Relay committed
    a completion and deliberately lost its HTTPS response; both services restarted, pending
    receipt retry recovered and the model action count stayed unchanged. Uncertain in-progress
    executions remain fenced for verification, not automatically rerun.
19. **Revocations.** Old Agent credential failed after rotation; address stayed stable.
    Credential revocation stopped subsequent polling. Revoked grants, revoked publications,
    and paused publications denied future query. Historical signed receipts remained.
20. **Persistence inspection.** 94 Relay tables and
    24 decrypted payload/results inspected.
    All five MyEve private domains were read back and hashed locally: Knowledge, Memory,
    Goals, private conversation and Workspace inventory. No private marker or canonical
    local Run ID/state appeared in Relay. Workspace proof used a disposable private file
    inventory marker, not access to an actual owner's cloud files. Relay and MyEve used
    different PostgreSQL containers/credentials; a cross-credential connection failed.
    Ava's separate container/private volume had zero monitored private-file accesses.
21. **Security tests.** Forged signature and caller identity; wrong owner/Agent/audience;
    expired request; replay/duplicate; revoked credential/grant/publication; private query;
    injection; local denial; offline delivery; both restarts; oversized request and durable
    rate limiting passed. Automated tests additionally cover credential owner binding,
    forged/truncated receipt chains, development auth bypass rejection and pinned-origin
    CSRF rejection. This is bounded qualification, not a general security certification.
22. **Regression.** 130/130 Node tests, 437/437 Vitest tests in 64 files (35 adapter),
    17/17 Relay compatibility tests, both workspace builds and typechecks, 25 migrations,
    132 capability definitions / 98 authored tools and builder manifest passed. Skill routing:
    93 existing checks, 50/57 rank one. The root strip-types test script has a pre-existing
    startup incompatibility; `node --import tsx --test apps/eve/test/*.test.mjs` runs all 130.
    Worktree dependency symlinks initially prevented Turbopack; isolated local copies resolved it.
23. **Defects / fixes / commits.** `595ea0e3a79f00b4d484d51f81809ea6d7397287` isolates a pre-existing owner Knowledge display
    constant from server imports, verified by the production build. `2f41e52979b1056f339f217e40ae48f884aa1c18` implements
    the adapter with regression coverage for completed-result retry, claim-before-CAS recovery,
    proxy owner-origin validation, full artifact retention and strict boundaries. Live fixture
    errors (Insight timestamp, schema fields, exact requested types) were corrected without
    changing canonical MyEve semantics. All are MYEVE_ADAPTER_DEFECT or qualification-fixture
    issues; no RELAY_PROTOCOL_DEFECT or required protocol extension was found.
24. **Remaining limits / cleanup.** No blocker remains for this bounded local qualification on the recorded base.
    **A future merge is blocked pending rebase/requalification:** concurrent canonical MyEve
    work now contains `0025_action_executor_enforcement.sql` and an uncommitted
    `0026_action_recovery_qualification.sql`. This branch’s `0025_relay_federation.sql`
    must be renumbered against the settled frontier and the newer authority paths requalified.
    No concurrent code was reset, overwritten, merged or silently claimed as tested.
    Production deployment, managed signing-key rotation, a second production Agent platform,
    independent security review and unrestricted Agent/tool execution are not qualified.
    General Eve chat was not launched during browser verification; its info endpoint and a
    new empty thread produced unrelated console errors, documented in browser evidence.
    All three final-run containers/volumes, platform/owner credentials, signing/encryption keys,
    temporary model-auth file and browser session data were destroyed. Federation remains
    disabled unless `MYEVE_RELAY_ENABLED=true`. No merge, rollout or tag changes.
25. **Final verdict. MYEVE FEDERATION PASSED_LIVE.**

## Evidence and reproduction

- [Final live assertions and persistence hashes](evidence/live/report.json)
- [Original signed Jay audit bundle](evidence/live/jay-audit.json)
- [Browser assertions](evidence/browser.json)
- [Browser run and its signed audit bundle](evidence/browser-live/report.json)
- [Reproduced claim-recovery failure](evidence/claim-recovery-reproduction.txt)
- [Owner UI screenshot](../../output/playwright/myeve-relay-owner.png)
- [Owner UI snapshot](../../output/playwright/owner-confirmed.txt)
- [Qualification runner](../../scripts/federation-qualification/run.mjs)
- [Deployment boundary and opt-in configuration](architecture.md)

The Relay qualification HTTP host invokes the unchanged production Agent REST handler.
Its owner hosting shim uses real Relay authentication/session/registry services, and trusted
qualification administration provisions Passports, budget and safety policy through existing
Relay services. MyEve uses actual repositories, owner APIs, local authorization and SQL against
isolated PostgreSQL; the Neon HTTP proxy changes database transport only. The browser uses
an actual production-built Next app. Neither hosting shim is a production deployment claim.

Run from the integration worktree with Docker, Node 24, installed dependencies, openssl,
the pinned local Relay checkout and fresh development model credentials in
`/private/tmp/myeve-relay-development.env`: `node --import tsx scripts/federation-qualification/run.mjs`.
The runner imports only model-auth fields, never the hosted DATABASE_URL from that file.
Use `--ui` after a production build for the bounded manual Playwright gate; it writes a temporary
signed browser state, waits for `/private/tmp/myeve-relay-ui-done`, and cleans those files up.
Delete the development model-auth file after qualification. Ports 55459/55460 and 58540–58544
must be free. Container and key cleanup runs on both success and assertion failure.
