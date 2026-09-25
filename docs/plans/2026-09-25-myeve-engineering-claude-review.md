# Review of Claude's MyEve Engineering recommendations

Date: 2026-09-25. Companion to the [implementation plan](2026-09-25-feat-myeve-engineering-plan.md).

## Verdict

**Pursue the bounded engineering pilot. Do not treat the entire catalogue as the build scope.** The strongest idea is persistent responsibility: a user delegates work, MyEve maintains the objective and authority across interrupted Runs, and the user receives a current, inspectable review package. That is a coherent product hypothesis. Whether it reduces supervision enough to justify another product remains unproven.

Claude's material is strong on product principles and failure awareness. It is not yet an executable implementation plan: it repeats related concepts across 916 numbered recommendations, mixes launch requirements with conditional enterprise/network ideas, and leaves several technical enforcement mechanisms unspecified. The master plan translates it into 18 work packages with dependencies, decisions and acceptance gates. These are not 916 separately authorized features.

The final supplied recommendation, #916, ends mid-sentence. Its visible text establishes an internal-strategy/public-roadmap distinction; no missing ending has been inferred. The [source ledger](2026-09-25-myeve-engineering-source-ledger.md) preserves that limitation and all continuation boundaries.

## What to keep

| Recommendation family | Why it matters | Implementation consequence |
|---|---|---|
| Durable Work above Runs (#1–6, #186–209, #608–610) | Responsibility must survive runtime changes and waiting. | Thin aggregate linked to existing Goals, Runs, Actions and outcomes; no replacement agent engine. |
| Criteria, provenance and evidence (#7–19, #89–98, #223–257) | A polished summary is insufficient for a review decision. | Versioned criteria, exact revision, protected observations, explicit uncertainty and readiness evaluator. |
| Attention and human control (#20–27, #52–56, #429–451, #527–550) | Necessary judgment should be easy; avoidable coordination should disappear. | Reuse Needs You/approval services; durable decisions, explicit takeover, current next step and bounded retries. |
| Organizational ownership (#61–79, #371–400, #460–468) | Company work and personal memory cannot be interchangeable. | Organization-only alpha with individual identities, repository grants and offboarding. |
| Executor neutrality (#28–45, #171–181, #201–222) | MyEve's value cannot depend on exposing one coding tool's session model. | One real adapter first, durable candidate/context custody, later adapters proven against the same contract. |
| Provider truth and durable recovery (#46–51, #287–320, #416–440) | External systems can change without a timely event. | Authenticated inbox, deduplicated effects, reconciliation, receipts and visible unknown outcomes. |
| Optional Relay (#128–135, #401–428, #666–670) | A useful specialist should improve an already useful workflow. | Query-only Standards Agent after core qualification; local execution controls always apply. |
| Supervision and accepted-output measurement (#136–161, #485–503, #611–618, #787–809) | More generated code or fewer clicks do not prove value. | Compare against the team's real agent-assisted baseline; count support and human correction costs. |
| Reuse and explicit gaps (#508–526, #677–726) | Existing MyEve has substantial durable-control infrastructure. | Preserve Action Gateway, Run, resource lifecycle, exports and migration lineage; extend only the missing engineering surfaces. |

## Changes I recommend before implementation

### 1. Treat identity as a release boundary

The current deployment-owner login is not a business membership system. Dedicated deployment per organization lowers the initial cross-tenant risk but does not solve employee identity or repository access. An Engineer must not automatically receive every repository connected by an Admin. Background jobs, artifacts, memory, support tools and exports must enforce the same scope as the UI.

This is a major dependency, not a small settings feature. Recommended alpha: managed isolated organization environments and individual login; preserve the personal edition. Shared multitenancy and personal/corporate switching remain later decisions. This resolves tension between early cross-life identity recommendations and the later advice to begin organization-only (#460–468).

### 2. Split readiness, acceptance and merge

Claude's human-facing states are a useful starting point, but DONE is ambiguous. Use separate lifecycle, control and presentation fields with explicit invariants. READY_FOR_REVIEW means required current evidence is present; ACCEPTED means an authorized human accepted a particular Result; MERGED is a GitHub fact.

Keep candidate publication eligibility separate from final readiness, because some checks run only after a PR exists. Do not make human review both a prerequisite to offering work for review and its intended next step. Stop must show pending external termination; manual takeover must establish a single writer.

### 3. Secure who produces evidence

Recording a hash does not make a test trustworthy. Candidate code can alter scripts, test configuration, reports or the environment. The supervisor must own the verifier, expected commands and producer identity; run the candidate in a separate constrained verification environment. Bind observations to exact candidate/base, profile, tool versions and criteria.

Separate observations from semantic assessments. Green tests can support a criterion, but cannot establish an arbitrary business requirement. Unknown or human-only criteria remain explicit. Baseline comparison helps diagnosis; it cannot automatically waive a failing requirement.

### 4. Include the effects of branch publication

"Draft PR only" is insufficient as a production-safety boundary. Pushing a branch can trigger customer workflows with credentials or deployment access. Qualify the repository's CI lane before write mode. Unsafe repositories receive investigation/patch mode until a safe lane exists.

Executors receive no GitHub publication token. Trusted adapters fetch and publish under narrow current grants. Publication requires exact target/revision, concurrent-writer protection, provider readback and a recovery identity. No force-push shortcut when a human changes the branch.

### 5. Replace impossible guarantees with enforceable contracts

| Oversimplified promise | Enforceable replacement |
|---|---|
| Exactly-once remote execution | Durable operation identity, fenced dispatch, duplicate suppression and provider reconciliation; unresolved ambiguity blocks retry. |
| Immediate stop everywhere | Immediate local admission/fencing, bounded remote stop attempt, verified termination and visible cleanup status. |
| Exact hard dollar cap | Atomic reservations and bounded admitted exposure; disclose delayed/unknown provider billing and measured overshoot limits. |
| Deterministically correct output | Deterministic admissibility/readiness rules, reproducible inputs where possible, and separately assessed semantic correctness. |
| Revocation instantly undoes writes | Block new actions, revoke credentials, stop active attempts, reconcile already accepted effects and preserve audit. |
| Signature proves trusted advice | Signature establishes authenticated provenance under a selected protocol; local authority, freshness and content assessment remain required. |

### 6. Correct the launch priorities

Claude's #504–507 sequencing puts parts of repository profiles, Definition of Done, costs and follow-up too late. Their **minimal versions are prerequisites** for the alpha promise. Advanced editors, analytics, rich templates and cross-team reporting can wait.

The first complete workflow must include a later CI failure and human review request. A single successful issue-to-PR run proves code generation plus integration; it does not test durable responsibility. Conversely, a large template library, marketplace, graph infrastructure and desktop client do not help establish this first hypothesis.

### 7. Reuse current foundations without inheriting historical release claims

MyEve now contains current V2 federation verification and Eve 0.66.3 multi-Run work. The earlier signature mismatch is stale. Existing qualified primitives reduce work; historical passing reports do not qualify new organization paths, a new executor, GitHub mutation or a different deployment.

Do not activate global routines or blocked Composio integrations to obtain engineering features. Add scoped adapters with their own admission checks. Preserve immutable migration history, personal functionality and Builder output. The source SHAs and actual gaps are recorded in the master plan.

## Additional features worth including now

These additions support the same workflow rather than expanding into another product:

1. **Repository readiness card:** explain whether a repository supports investigation, patch or draft-PR mode; identify missing setup, unsafe CI and the responsible person.
2. **Currentness banner:** clearly identify when a Result became stale because the commit, base, criteria, profile, required check or policy changed.
3. **Visible recovery status:** distinguish waiting, provider unavailable, external outcome unknown, stopping and cleanup failed; show the next permitted action.
4. **One-click human takeover and explicit return:** preserve candidate custody and fence the old writer; returning work creates a fresh authority check.
5. **Evidence coverage and cost coverage:** show what was verified, what requires human judgment, and whether reported costs are complete or estimated.
6. **Operator recovery controls:** audited retry/reconcile/stop through domain commands, with no routine database surgery and no broad support access.
7. **Admission explanation:** show why work cannot start and how to resolve it without asking the model to guess permission or provider state.

These belong to EP02–EP11 and the normal Work/Needs You/Result surfaces. They do not need separate products or dashboards for every internal subsystem.

## Defer unless real pilot evidence justifies them

| Capability | Trigger for reconsidering |
|---|---|
| Daily Brief, richer templates, Work-derived Knowledge | Repeated coordination or context recovery accounts for material supervision time. |
| Additional executor | Qualified primary executor blocks an important task class or has unacceptable measured reliability/cost. |
| Shared multitenant hosting | Dedicated organization operations become the demonstrated scaling/cost bottleneck. |
| SSO/SCIM, advanced policies and audit export | A committed enterprise buyer requires them and core usage already repeats. |
| Local/VPN execution and desktop | Valuable work cannot run in the approved cloud environment. |
| Native mobile | Responsive web cannot support a measured recurring approval/review need. |
| General specialist delegation, agent directory, marketplace, reputation | A narrow specialist proves value and cross-boundary authority/data contracts are qualified. |
| Pricing automation and elaborate analytics | Commercial model and useful decision metrics are validated manually first. |

Do not add autonomous merge/deploy, silent learned authority, employee productivity rankings, automatic unqualified failover or corporate-to-personal memory copying as conveniences.

## Highest-risk assumptions to test first

| Assumption | Cheapest credible test | Failure response |
|---|---|---|
| The executor can operate within the required isolation and stop contract. | EP01 real sandbox fixture, attempted credential access, cancellation and checkpoint recovery. | Reduce to investigation/patch mode or select another qualified executor. |
| MyEve can materially reduce supervision over current coding tools. | Representative internal cases, then matched customer baseline; include later review/CI. | Narrow workflow or stop expansion. |
| Repository setup is repeatable. | Onboard a second supported repository without hidden bespoke shell work. | Document supported envelope and improve bootstrap before more partners. |
| Organization scope can cover reused personal services safely. | Route/tool/store inventory plus two-member, two-repository, two-organization tests. | Disable unconverted surfaces; do not rely on hidden navigation. |
| Managed dedicated hosting is economical to operate. | Measure compute, model, support, recovery and onboarding per accepted Work. | Revisit price/scope/hosting based on measurements. |
| Relay adds useful specialist context. | Optional Standards query with provenance, freshness and outage tests, compared to local approved context. | Keep core local; defer more federation work. |

## Recommended next decision

Review D1–D9 in the master plan, especially the engineering edition, organization-only managed alpha, first executor candidate and GitHub ownership. Then authorize EP00/EP01 as the first bounded work order. Use their evidence to estimate the rest. Do not commit the entire roadmap or a release date before executor, identity, CI and operating assumptions are tested.

This review is grounded in the supplied recommendations and inspected source, not a claim of market validation or a passing implementation. Source coverage is recorded in the ledger; release proof is defined in the verification matrix.
