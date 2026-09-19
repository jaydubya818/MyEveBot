# Rebased MyEve × Relay qualification — 2026-09-19

**MYEVE FEDERATION REBASED AND QUALIFIED — READY FOR MERGE**

This is local integration qualification. Federation remains disabled by default.
The original qualification is preserved verbatim below; its results and migration
number describe the old branch only.

| Boundary | Current result |
| --- | --- |
| Automated MyEve qualification | PASSED — 470 Vitest, 130 Node, current authority/database suites |
| Real MyEve × independent disposable Ava | PASSED_LIVE — 42 passed, 0 failed, newly executed after rebase |
| Pinned Relay protocol compatibility | PASSED — 17 tests; Relay unchanged |
| Historical generic disposable-platform protocol | PASSED_LIVE — earlier separate protocol qualification, not substituted for this run |
| Production Agent-platform deployment | NOT_RUN |
| Independent security review | NOT_RUN |

## Final integration report

1. **Canonical authority.** `/Users/jaywest/Myeve`, branch `codex/openbot`,
   original/current canonical HEAD `4d3f1eb685422fc77296cef245e84c5b09da6e91`.
   `git fetch origin --prune` completed before authority selection. Canonical
   checkout was clean. No remote `codex/openbot` existed at fetch; the exact
   canonical commit will be published as a new base ref for the PR, without rewriting it.
2. **Original federation.** `feat/relay-federation-adapter` at
   `c92fd204c690c68b067d58dd6380aa23f95130d1`; merge base
   `74fee5b1fdc8ec7c705a9087d9bdf58992b8f27c`.
   Three original commits preserved under `codex/preserve-relay-pre-rebase-c92fd20`.
   A preexisting untracked `node_modules 2` symlink was moved outside the checkout
   to `/private/tmp/myeve-relay-preserved-node-modules-link`; its target was untouched.
3. **New federation base.** `4d3f1eb685422fc77296cef245e84c5b09da6e91`.
   Canonical history is an ancestor of the rebased integration branch.
4. **New qualified federation HEAD.** `4c739436ce407f24a4159edfea603e393e08857e`.
   Live execution tested production implementation `cfb098e` (full SHA in the live
   report). The qualified HEAD adds formatted test/harness source and evidence only.
   Subsequent report/PR metadata commits do not change runtime implementation;
   final branch HEAD is recorded in the completion report and PR.
5. **Concurrent changes audited.** All 130 changed paths across `81979b6`,
   `d75b498`, and `4d3f1eb` are indexed with exact diff hashes in
   [authority-audit.json](evidence/rebased/authority-audit.json).
   Canonical authenticated identity, Agent status/capability/role binding, exact
   approvals, pre-transmission Run/Agent/lease checks, one-use expiring handles,
   read-only uncertain-result recovery, and owner action history are preserved.
   Unqualified email/card/phone/connected-app/Computer transports and delegated
   shell mutations remain blocked. Routine activation remains disabled.
   Canonical private Knowledge/Memory/Goals/Workspace stores and web authentication
   were not weakened or replaced. There was no architecture contradiction.
6. **Migration collision.** Reproduced the normal validator's duplicate `0025`
   failure. Canonical `0025_action_executor_enforcement.sql` and
   `0026_action_recovery_qualification.sql` remain byte-identical. Only the
   federation filename and latest-migration marker changed.
7. **Final migration.** `0027_relay_federation.sql`. Ten new adapter tables and
   their constraints/indexes remain additive. No canonical columns, enums, tables,
   or constraints are replaced. The new names do not collide with canonical
   recovery objects. Agent/Run references retain existing owner-scoped application
   validation; these single-column foreign keys are not a claim of database RLS.
8. **Fresh migration.** PASSED: unmodified repository migration runner applied all
   27 migrations through a local Neon HTTP transport proxy to disposable PostgreSQL.
9. **Existing schema/idempotency.** PASSED: the same normal runner built current
   canonical schema through `0026`, populated Agent/Run/action fixtures, then applied
   exactly `0027`; fixture data was byte-equivalent afterward. Fresh/upgraded schema
   columns, types, defaults and nullability match. Both reruns accepted all 27
   checksums and applied nothing. Constraints/indexes/checksums are recorded in
   [migrations.json](evidence/rebased/migrations.json). Canonical `0025→0026` upgrade
   and execution/recovery database suites also passed. No hosted data was used.
10. **Current authority compatibility.** PASSED: signed owner and origin checks,
    Agent ownership/status, independent local policy, exact approvals, Run budgets,
    revocation and expired/forged/replayed authority handles. The actual model
    adapter now consumes canonical authority before model invocation. Owner CRUD
    and signed federation transport remain separate from generic Agent execution.
11. **Federation regression.** 36/36 tests passed: original 35 plus a reproduced
    forged-handle bypass regression. Projection, signatures, target identity,
    receipts, encryption, context fencing and delivery recovery remained green.
12. **Live golden path.** 42 PASSED_LIVE / 0 failed. Real MyEve Jay/Sofie APIs,
    repositories, Task/Run, ActionGateway and model executor communicated over
    HTTPS with pinned Relay and an independently credentialed disposable Sarah/Ava.
    MyEve and Relay used separate PostgreSQL containers; Ava had its own private
    store. This is not production deployment acceptance. See
    [live report](evidence/rebased/live/report.json).
13. **Private Knowledge.** Authorized queries read only the local publication
    projection. Denied requests never reached the publisher. PRIVATE eligibility
    and three prompt-injection attempts could not escape the publication boundary.
14. **Local refusal.** Relay granted the work request, while MyEve independently
    rejected email work before creating a local Run. Safe analysis required MyEve
    approval, then executed a real model call and returned bounded evidence.
    Relay authorization plus MyEve local authorization remains mandatory.
15. **Restart/idempotency.** Crash-before-claim recovery, duplicate delivery, lost
    completion response, offline pending work and both service restarts passed.
    The completed model action executed once; uncertain execution is never blindly retried.
16. **Persistence boundaries.** Reinspected canonical Knowledge, Memory, Goals,
    conversations and Workspace canaries locally; local Run retained in MyEve.
    Inspected all 94 Relay tables plus 24 decrypted payloads/results: no canonical
    private canary or local Run state. Ava's independent private-store monitor
    reported no unauthorized reads. All three live containers/volumes/credentials
    were destroyed; migration and compatibility containers were also removed.
17. **Relay revision.** Exactly `614c638d6fc4099db8064540326f5de4438e93a1`.
    Harness now asserts this pin. Relay checkout stayed clean and unchanged.
    All 17 compatibility tests passed against another disposable database.
18. **Current MyEve regression.** 470 Vitest tests across 72 files and 130 Node
    contract tests passed using normal `npm test` commands. Current canonical
    execution/executor/recovery/coverage and migration integration suites passed.
    The latter report six capability matrices and race/recovery assertions as
    suites, not an invented individual-test count.
19. **Build/typecheck/lint.** Both workspace production builds and typechecks
    passed. Capability registry, skill routing, builder manifest and executor
    governance passed: 502 classified sources, UNKNOWN=0. Canonical repository
    defines no dedicated lint command in package scripts or CI; this is explicitly
    NOT_CONFIGURED. Adapter/new qualification Prettier checks and `git diff --check`
    passed. Initial sandbox-only tsx IPC denial was resolved by running the same
    typecheck with local IPC access; no code workaround was introduced.
20. **Disabled by default.** Owner route exits before authentication/storage when
    `MYEVE_RELAY_ENABLED` is absent or not exactly `true`; the worker also requires
    explicit opt-in. Migration creates empty adapter tables only. Connection,
    registration, publication confirmation and grants require separate owner
    actions. PRIVATE visibility and hidden discovery remain defaults. No existing
    owner, Agent or Knowledge is automatically enrolled, published or granted authority.
21. **Defects/fixes/commits.** `MIGRATION_DEFECT`: `7872004` renumbers only federation.
    `MYEVE_CONCURRENT_CHANGE_INCOMPATIBILITY`: `cfb098e` consumes canonical authority,
    adds a failing-before/passing-after regression, classifies adapter governance,
    and removes raw owner-operation diagnostic logging. Evidence commit `4c73943`
    records requalification. No Relay protocol defect or change. The migration
    fixture initially mishandled valid multi-statement DDL; its proxy now returns
    the final PostgreSQL result while executing all statements in the normal
    migration transaction. Historical SQL was not edited to accommodate the fixture.
22. **PR status.** Local merge-readiness gates passed. Publish the qualified branch
    and exact canonical base, open a PR targeting `codex/openbot`, and wait for
    repository checks. No automatic merge, branch-protection bypass, deployment,
    production migration or default enablement is authorized by this result.
23. **Production gates.** Independent security review and production/multiple-real-
    platform acceptance remain NOT_RUN. Existing canonical blocked transports and
    routine release restrictions remain separate gates. Historical browser evidence
    is preserved; this rebase reran the complete network golden path and builds,
    not the prior seven browser interactions.
24. **Verdict.** **MYEVE FEDERATION REBASED AND QUALIFIED — READY FOR MERGE**,
    subject to the PR's required checks/review. This does not mean merged or production-ready.

## Preserved original qualification

Original base `74fee5b1fdc8ec7c705a9087d9bdf58992b8f27c`; original final HEAD
`c92fd204c690c68b067d58dd6380aa23f95130d1`; 42 live checks, 437 Vitest,
130 Node, 17 Relay compatibility checks, and 25 migrations. The following original
report is historical; its drift warning is resolved by the new report above.

---

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
