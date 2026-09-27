# Q37 remaining P0 work

Inspection date: 2026-09-27 UTC. **Q37 BLOCKED / NOT QUALIFIED.** This is an ownership and implementation assessment, not a new master plan or a change to the frozen release gates.

## Baseline and ownership

`origin` was fetched in canonical `/Users/jaywest/Myeve`. Remote main is `c8c160a`; local main is `a793689`, one commit ahead and 43 behind, with unrelated tracked and untracked changes. It was not checked out, reset, stashed, or edited.

Required implementation is absent from origin/main. Q37 branches from **`1d736975019965864880252219973d096de0288a`**, the committed `codex/p0-gap2b-qualification` snapshot. Its ancestry contains Golden Work `0a74624`, native host `3dfee3e`, conversation budget `4ad2b79`, common ledger `27f760c`/`f3a5de8`, Digital Worker `acfe498`, and completion qualification `f4d25fe`. `1d73697` records the later failed live admission and revocation; the local completion PASS does not supersede that live blocker. No uncommitted owner changes were copied. No merge or cherry-pick was performed.

Branch: `codex/q37-integration`. Worktree: `/Users/jaywest/.codex/worktrees/q37-integration/Myeve`.

**Integration debt:** origin/main and this baseline diverge at `08d3d24`. Current main includes scoped Relay message delegations (`3b50014`/`c8c160a`) and later beta changes absent here. The new pure contract is deliberately not attached to the older live Relay adapter. Reconcile the current transport/delegation implementation before enabling it. This branch is not a current-main release candidate.

The following MyEve worktrees were inspected and remain independently owned:

| Worktree | Observed HEAD | State |
|---|---|---|
| canonical Myeve | `a793689` | Dirty, preserved |
| `/private/tmp/knowledge-production-source` | `47aa6ff` | Clean |
| `/private/tmp/myfactory-myeve-main-merge` | `f6c6458` | Clean, detached |
| `digital-worker-mvp/Myeve` | `acfe498` | Dirty native/completion tranche, preserved |
| `gap2-common-ledger/Myeve` | `f3a5de8` | Clean |
| `gap2b-projection/Myeve` | `55544fb` | Clean |
| `gap2b-qualification/Myeve` | `1d73697` | Active dirty admission/projection/tests, preserved |
| `sofie-chat-mainline/Myeve` | `6ed3137` | Clean |
| `sofie-thread-owner-conflict/Myeve` | `fc31671` | Clean |
| MyFactory `data/hosted-myeve` | `cab819b` | Status timed out after 8 seconds; protected, not assumed clean |

Paths abbreviated above under `~/.codex/worktrees` unless otherwise stated. Golden Work `codex/golden-work` remains at `0a74624`; retained fixtures were not read for authority or run.

MyEve [PR #34](https://github.com/jaydubya818/MyEveBot/pull/34), `codex/managed-eve-beta`, and Relay [PR #27](https://github.com/jaydubya818/relay/pull/27), `codex/relay-beta-identity-lifecycle`, are OPEN/DRAFT. They were not merged or modified. No open Digital Worker PR was returned in the explicit canonical MyEve PR listing. The local `gh` default targets an upstream fork, so PR inspection used explicit repository names.

Protected M1/ER1 contracts: `engineering_direct.ts`; native admission/API/input/routing/model/completion/results; conversation-model/budget; common ledger and schema; route-admission; direct-development; runtime; worker-projection/current-truth-lines; Work dashboard; native/completion/conversation/ledger integration fixtures. Existing source and dirty-file lists establish material overlap; none were edited.

Migration ownership: 0039–0050 already belong to the inherited Digital Worker lineage. 0051, 0052 and 0053 belong to Gap #2/M1/ER1; 0053 exists both in the preserved dirty original tranche and committed qualification lineage. **No migration allocated or modified.** No shared database accessed.

Safe Q37-owned files: new `apps/eve/lib/engineering/relay-collaboration.ts`, its synthetic test, and this evidence directory. Existing Relay result projection is imported without edits. Existing dependencies are linked read-only for tests; no env files or credentials are copied.

## Workstream assessment

| Workstream | Status | Independent work / boundary |
|---|---|---|
| Relay | PARTIAL | Selected-text request and exact Work/peer/grant/reply contract is independently testable. Durable attachment, current-main delegation adapter, reciprocal provider qualification and polling remain open. No private grants inspected. |
| MyFactory | PARTIAL | Signed deterministic intake and exact receipt readback exist. Current Factory `543906d` implements internal WorkOrders and hosted polling; hosted receipts contain identity/state/updatedAt, not candidate/evidence/artifact returns. MyEve `factory-observation.ts` recognizes queued intake only. Define return custody and writer-handoff interfaces before enabling production dispatch. |
| GitHub publication | BLOCKED live / PARTIAL local | `github-app.ts`, `github.ts` and executor worker provide scoped token minting, candidate identity, head checks, draft PR/readback. Native/Factory candidate join remains missing. Last dossier reports missing App key; no credential access attempted here. Live prerequisite: approved repository App installation, configured appId/installationId, private key in the configured Keychain service/account, and exact publication approval/readback. Runtime also has a token fallback; Q37 must explicitly select the App path and must not qualify using personal CLI credentials. |
| CI/review follow-through | PARTIAL | Existing executor worker observes checks and review and can request repair. Native/Factory continuation must consume the owner-defined writer/candidate contract. Hosted autonomous observation and closure of UI/chat are not qualified. |
| Learning | PARTIAL | Pure evaluation contracts and `EngineeringLearningDraftStore` persist advisory unverified drafts. Authenticated feedback provenance, explicit durable promotion/correction, scoped later-Work retrieval and useful reuse remain missing. Do not equate drafts or unit tests with this loop. |
| Capsules | CONDITIONAL | Frozen manifest calls stages 16–17 conditional, scope unsealed. G12 is additional portable-experience qualification, outside the core L1 gate list. Left unchanged, not waived. |
| Routing/composite | BLOCKED | Native admission and route contracts exist but live M1/ER1 remains unqualified; Relay/Factory/candidate joins are incomplete. One qualified native harness suffices; ER2 is not added as a blocker. |

Source anchors: inherited `docs/plans/2026-09-25-digital-worker-mvp.md`; canonical untracked frozen `docs/verification/digital-worker/{release-manifest.yaml,release-gates.yaml,audit-2026-09-26/q37-readiness.md}` (read-only, hashes in manifest); MyFactory `apps/supervisor/src/hosted-intake.ts`, `packages/hosted-routing/src/index.mjs`, `packages/contracts/src/index.ts`; MyEve `lib/engineering/{factory-observation,github,github-app,worker,learning-drafts}.ts` and `agent/lib/myfactory.ts`.

## Selected bounded implementation

Implement and locally test the Work-level Relay collaboration boundary first. It precedes Factory handoff in the requested dependency order, requires no shared schema/native changes, and makes exact provenance and denial conditions reviewable. The module is not registered as a model tool or transport and makes no provider calls.

The future trusted adapter must load current owner/Work and qualified peer state, obtain current grant readback, bind exact approved text through Action Gateway, persist request identity before dispatch, and reconcile the same request after UNKNOWN. It must atomically insert a single receipt while rechecking current Work/grant state; the pure duplicate decision does not itself supply database uniqueness or concurrent safety. Remote text remains advisory and cannot become a writer lease, approval, policy or verification result.

MyFactory dependency interface remains: quiesce/reconcile the current writer; obtain an owner-defined durable fence for exact Work revision/generation, route run, request and candidate parent; dispatch bounded production; receive exact request/WorkOrder/candidate/evidence/artifact identities; store in MyEve custody; independently verify; release/restore writer through the same owner service. No fabricated handoff token or second lease implementation is introduced.

Necessary Human Judgment: peer/disclosure permission, publication approval where required, learning promotion and unresolved Capsule release scope. Coordination Debt: autonomous Relay status observation, Factory return observation, CI/review continuation and recovery are still unqualified. No-babysitting is **not** claimed; live counts/minutes remain UNKNOWN. The contract enables future automatic receipt consumption but does not eliminate polling work yet.
