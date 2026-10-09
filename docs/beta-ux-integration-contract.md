# Beta UX integration contract / crosswalk

**READY FOR INTEGRATION — UI/API-contract qualified**

**LIVE DESIGN-PARTNER E2E — NOT YET QUALIFIED**

Accepted candidate: `ed0f6b5dad0e3a131a9f5332139e627245cbd4e8`, branch
`codex/beta-product-experience`, baseline `d64f2f9`. The original dossier and
27 screenshots remain evidence for that candidate. This preparation pass is
additive; it does not qualify a backend, merge a workstream, or authorize execution.
See the [acceptance checklist](beta-ux-integration-checklist.md).

## Contract status and source ownership

Paths below are repository-relative. `owner/` means
`apps/eve/components/owner/`; `lib/` means `apps/eve/lib/`.
Required fields below are the minimum information needed for the stated UI claim,
not a new wire schema. Existing source types remain authoritative. Nullable or
optional information must remain unknown when absent; adapters must not fabricate
required provenance. Unmerged sources were inspected read-only on 2026-09-27.
Their presence does not establish integration or production readiness.

| Key | Canonical owner / observed branch | Source and integration boundary |
| --- | --- | --- |
| S | Stable baseline `d64f2f9` | `lib/goal-types.ts`, `task-types.ts`, `outcome-types.ts`, `approvals.ts`, `review-types.ts`; existing authenticated APIs listed below |
| E | `codex/digital-worker-integration` at `21973e5bf646ceec4c68dc90625ff020d405d7a9` (clean when inspected) | `lib/engineering/worker-projection.ts`, `types.ts`, `execution.ts`, `api.ts`; `GET /api/engineering/work` returns `work`, `manifests`, `projections`, execution availability; `GET /api/engineering/work/:id` returns Work, events, criteria history, execution, manifest, projection, execution history and routing. Dogfood/auth gates remain owned here |
| T | `codex/p0-gap-02-common-ledger`, `codex/p0-gap2b-projection`, `codex/p0-gap2b-qualification` | Common accounting and Current Truth; `lib/engineering/run-truth.ts`, `current-truth-lines.ts`, `worker-projection.ts`. Projection branch inspected at `55544fb`; consume the reconciled E projection after backend integration, not competing client truth calculations |
| G | `codex/goals-proactive-work` at `b9b46c41480f0859d44683346bd24d7ce9f2b7c9` | `lib/goal-work/projections.ts` (`GoalWorkQueries`), `contracts.ts`, `service.ts`, `attention-adapter.ts`; `docs/goal-work-product-contracts.md`. Server-only v1 projections; existing `/api/goals` still returns S. Authenticated HTTP adapters and actual Work/Reminder/NeedsYou ports are integration dependencies |
| I | `codex/universal-inbox` at `36675bd5c64fa848b32f7dfbbb349957b5853498` | `lib/universal-inbox/contracts.ts`, `api.ts`, `service.ts`, `approval-consumer.ts`; `myeve.attention.v1`. API factory deliberately unmounted pending persistence and Work ownership; no public URL is assumed |
| L | `codex/total-recall-learning` at `4b31ddebe8235fc1efca154d41ee37061be2a444` | `lib/total-recall/learning.ts`, `api.ts`, `owner-knowledge.ts`, `owner-knowledge-types.ts`; candidate `/api/learning` and `/api/owner-knowledge`. Governed learning and recall correction are distinct from S outcome ratings |
| F | E Factory integration + `codex/myfactory-hosted-routing` | `lib/engineering/factory-routing.ts`, `factory-writer.ts`, `factory-observation.ts`, `factory-authenticated-result.ts`, `factory-result-consumer.ts`; MyFactory producer/host transport supplies authenticated receipts. UI consumes E readback; it never calls the producer directly |
| R | E Relay seam + existing scoped Relay messaging | `lib/engineering/relay-collaboration.ts`, `lib/relay/message-result.ts`, `lib/relay/inbox.ts`. Binding/receipt validation exists; durable attachment, authenticated transport and owner-facing projection remain dependencies. See existing Orchis/Sofie live qualification record; reciprocal messaging is not an E2E pass |
| V | E protected execution/verification + `codex/q37-integration` continuation | `lib/engineering/execution.ts`, `docker-executor.ts`, `direct-verification-driver.ts`, `native-results.ts`, `native-execution-controller.ts`. Source-bound checks, frozen candidates, publication/CI/review continuation; no verification performed in this UI pass |

## Six partial surfaces

### Daily Brief

- **Current:** `owner/data.ts` reads `GET /api/reviews?kind=daily` →
  `DailyBriefView`; `owner/preview.ts` supplies the same shape in explicit sample
  mode. Results are separately filtered by the brief window from `OutcomeView[]`.
  Checkpoint/delivery metadata returned by the API is not consumed.
- **Canonical:** G `GoalWorkQueries.brief(since, until, cursor)` plus its current
  Today page; S review recommendations may coexist only as a labeled separate
  projection. Knowledge changes require L's source-owned feed/aggregation;
  scheduled dependencies in G are not confirmation of routine execution times.
- **Required:** S `kind`, `generatedAt`, `periodStart`, `periodEnd`, `completed`,
  `recommendations`, `blocked`, `atRisk`, `approaching`, and linked goal/task IDs.
  G `contractVersion`, `since`, `until`, `changes`, `completed`, `results`,
  `progressChanges`, `newlyEligible`, `newBlockers`, `needsYou`, `current`,
  `upcoming`, `upcomingTruncated`, `nextCursor`; preserve each event's ID, type,
  time and references. Page `current.nextCursor` independently.
- **Optional/nullable:** task title/reference and commitment time; recommendation
  goal/task link; L change summary and authoritative next routine run until an
  aggregation contract exists. Do not invent field names for those missing feeds.
- **States:** loaded empty window → no recorded changes; nonempty → recorded
  changes; pending read → loading; failed read → unavailable. G `newBlockers`
  currently includes `RESULT_RECEIVED` events: inspect source Result/blocker
  semantics before labeling an event as a new blocker.
- **Fallback:** retain Knowledge/routines links and explicit missing-feed copy;
  never generate a substitute brief or report an unread list as empty. Counts
  remain bounded unless all cursors have been read.
- **Dependency/files:** G owns projection/HTTP and Reminder port; L owns recall
  changes; S review delivery owns timezone/scheduling. Integrate `owner/data.ts`,
  `projection.ts`, `experience.tsx` (Today/Brief/Activity), preview fixtures and tests.

### Work UX

- **Current:** `projectWork(OwnerSnapshot)` combines S `GoalSummaryView[]` and
  orphan `TaskRunView[]`; goal detail uses `GET /api/goals/:id`. A new assignment
  uses `POST /api/goals` with a retained idempotency key and `status: draft`.
  The preview uses `exampleGoal`, `exampleSnapshot` and tab-local `details`.
- **Canonical:** E `EngineeringWorkerProjection` + Work detail for engineering;
  G `goal`, `task`, `today` for parent objectives/dependencies. These are separate
  entities. Preserve explicit Goal → Task → Work → Run → Result references.
- **Required:** S IDs, title/objective, status, timestamps, criteria, counts and
  detail arrays. E `workId`, `workVersion`, `workGeneration`, `criteriaVersion`,
  title/objective, lifecycle/control, status/activity/nextStep, `runTruth`,
  readiness, qualification mode, source/readAt/references; Work criteria from
  detail. G `contractVersion`, ID/objective/status, criteria, progress counts,
  tasks/dependencies/waiting/blocker/nextAction, currentWork, activeWork,
  recentResults, needsYou, history, truncation/cursors.
- **Optional/nullable:** plan, target date, next action, current Work/run, route,
  candidate/result, agent attribution and budget observations. No percentage for
  an engineering Work or a G outcome without an authoritative denominator.
- **States:** S maps remain in `projection.ts`. Future mapping: active agent Work
  is Working only with matching current activity; proposed route/no admission →
  Waiting; human control → Needs you; paused → Waiting; stopping remains explicitly
  Stopping in detail. Verification → Verifying; reconciliation/failure → Recovery;
  accepted → Complete (owner acceptance only); cancelled/superseded → Stopped.
  Ready for Review/verified candidate/local workflow complete must keep those
  qualifiers and must not become final accepted success. Unknown values → Unknown
  with source detail. G owner wait → Needs you; schedule/work/external wait →
  Waiting; capability/blocker → Blocked. Never derive aggregate success from runs.
- **Fallback:** show source limitation or unavailable state; no sample substitution,
  synthetic run, fabricated percentage or automatic admission. Preserve history
  when `runTruth.activeRun` is null and respect `latestOrderCertain`.
- **Dependency/files:** E/T current projection + G authenticated adapters and Work
  port. `owner/data.ts`, `projection.ts`, `experience.tsx`, `new-work.tsx`,
  `app/work/page.tsx`, `app/chat.tsx`, `app/sofie/page.tsx`; reconcile the other
  branch's Work dashboard/Chat changes deliberately. Engineering Work creation
  must use its owner's existing validation and admission boundary, not S draft POST.

### Proof of Work

- **Current:** `owner/proof.tsx` uses S Outcome evidence refs and the exact
  `result.runId`'s checks/artifacts. It reads `/api/task-runs/:id` when the run is
  outside the recent list; artifact downloads use its owner-checked artifact route.
  Preview checks/artifacts are sample data, with no live artifact link.
- **Canonical:** V/E `ResultVersion.verification`, manifest verification and
  `nativeResult.proof` (`lib/digital-worker/contracts.ts`, ProofOfWork v2).
  `projection.verification` is a summary, not a replacement for evidence content.
- **Required:** S result/run identity, evidence type/ID, check ID/label/required/
  status, artifact ID/hash. Engineering evidence: Work/candidate/base,
  criteriaVersion, profileHash, producer, check, attemptId, observedAt,
  result, artifact/hash. Portable proof: contractVersion, workId/workVersion,
  criteriaVersion, outcome, nullable resultRevision, createdAt, evidence,
  artifactRefs, limitations. Each evidence entry carries criterionId,
  resultRevision, state, producer, sourceRef, contentHash, observedAt.
- **Optional/nullable:** producer display name, check explanation/time, result
  revision when not complete, downloadable content if no reader is exposed.
  Absent provenance can never support an independent verification claim.
- **States:** PASS → recorded passing evidence only when backend binding/currentness
  agrees; FAIL → failed; UNKNOWN → unconfirmed; STALE → prior revision; NOT_RUN →
  not checked. Proof COMPLETED/PARTIAL/BLOCKED/FAILED/CANCELLED/SUPERSEDED remain
  distinct. Acceptance, local checks, independent verification and publication
  are separate facts; portable proof producer `trusted-verifier` and engineering
  producer `protected-supervisor` are separate schema vocabularies.
- **Fallback:** loading/retry for exact evidence read; missing refs → unavailable;
  references without content readers stay non-clickable. Never borrow newer-run
  evidence or treat a count/hash alone as independent proof.
- **Dependency/files:** V/E supplies bound evidence and authorized content readers;
  F supplies candidate receipt, not verifier authority. `owner/proof.tsx`,
  `projection.ts`, `data.ts`, `experience.tsx` and proof tests need adapters.

### Delegation

- **Current:** S task milestones/status reason and Outcome `agentName` identify
  recorded activity/producer only. `exampleSnapshot` includes an illustrative
  MyFactory milestone. No stable route contract is consumed.
- **Canonical:** E `routing` and `runTruth`, F `factoryPreparation`/`factoryWriter`
  and candidate `factoryProvenance`; direct `nativeExecution`/native runtime;
  R request binding and advisory receipt. v2 route vocabulary is DIRECT,
  DEEP_AGENT, EXECUTOR, MYFACTORY, RELAY, HUMAN. Internal `NATIVE` execution is not
  itself a portable route value; use admitted routing, never a string guess.
- **Required:** Work version/generation, route decision ID/status/selectedRoute,
  current run identity/currentness and observed source time. To claim Factory
  custody/production, use authenticated request/dispatch/remoteRun identity,
  writerGeneration/state and receipt/candidate binding. To attach a Relay reply,
  use owner/agent/Work version/generation, requestId, peer, grantId/revision,
  disclosureHash, deadline, receipt bodyHash/receivedAt and `ADVISORY_ONLY` trust.
- **Optional/nullable:** routing providerId/reason details, Factory version,
  WorkOrder/attempt/receipt before delivery, candidate producer before custody;
  direct writer session when not admitted. Show absent fields as unknown, never
  fill them with fixture identities.
- **States:** PROPOSED → proposed, ADMITTED → admitted (not necessarily running),
  STALE → rerouting needed. Preparation/dispatch is not receipt or completion.
  R WAITING/UNKNOWN/DENIED remain explicit; ATTACH is an advisory response,
  DUPLICATE is not new progress. Terminal Factory receipts remain history even
  after fencing; they do not restore productive writer authority.
- **Fallback:** provider/route not supplied; show recorded milestones only. Never
  infer MyFactory from `delegated_work`, or Relay from a peer name or message.
- **Dependency/files:** E/F/R and T currentness. R durable store/read endpoint is
  still a gap. `owner/experience.tsx`, `projection.ts`, `data.ts`, `proof.tsx`
  provenance, preview samples and tests. Existing layouts can display these facts.

### Failure / Recovery

- **Current:** S failed/paused run + `statusReason`, generic `recoveryMessage`;
  `ownerRequest` handles timeout/network, 401/403, 404, 409 and service failures.
  Resource reads fail independently. Retrying a read never retries execution.
- **Canonical:** E `attention`, `pendingDecisions`, readiness/reasons, nextStep,
  manifest reconciliation, F writer observation/stopReason, T effective run truth
  and common accounting, V controller phase/recovery. I presents source-bound
  actions once mounted; it does not grant source execution authority.
- **Required:** exact Work/run/attention identity and revisions, observed status,
  reason, source timestamp, permitted next step; for reconciliation, effect IDs,
  status/candidate/expected head, repository observation and blockers. Any write
  uses the backend's exact current action binding and concurrency tokens.
- **Optional/nullable:** structured custody details, PR URL, spend observations,
  recovery operation. Missing operation means inspection/discussion only.
- **States:** failed → Recovery; unconfirmed side effect/usage/custody → needs
  reconciliation; paused → Waiting; stopping stays unresolved until confirmed;
  expired/stale run → historical/non-executable; required judgment → Needs you.
  Read failure does not establish execution failure, cancellation or safe retry.
- **Fallback:** keep available independent sections, clear actionable stale reads,
  explain unavailable source, allow refresh/sign-in/contextual discussion only.
  No automatic retry, pause, repair, duplicate-prevention or budget-refund claim.
- **Dependency/files:** E/F/T/V recovery truth, I response plumbing; exact owner
  boundaries above. `owner/data.ts`, `projection.ts`, `experience.tsx`,
  `decisions.tsx` and failure/decision tests.

### Feedback

- **Current:** S `PATCH /api/outcomes/:id` saves `ownerFeedback: helpful|unhelpful`;
  preview writes only the tab snapshot. Correct this and Work discussion place
  referenced context into an unsent Sofie composer. Neither promotes learning.
- **Canonical:** S ratings remain Result annotations; L `/api/learning` owns
  scoped governed feedback. E `EngineeringLearningDraftStore` and
  `lib/digital-worker/learning.ts` are a separate DRAFT_UNVERIFIED / ADVISORY_ONLY
  staging path. Owners must reconcile these before a single unified learning UI;
  they are not interchangeable endpoints. L `/api/owner-knowledge` owns corrections.
- **Required:** S outcome ID and confirmed returned Outcome. L feedbackInput:
  eventId, workId/workVersion, workType, type, target/targetRef, note, behavior,
  scope (WORK or REPOSITORY); server owns authenticated owner/repository binding.
  Learning readback requires family ID/revision/scope and version/status/hash,
  evidence/provenance, evaluation and event history. E WorkFeedback additionally
  requires source actor/ref/time, evidence hashes, supervision and recordedAt;
  existing schemas, not an outcome-rating conversion, define these requirements.
- **Optional/nullable:** L `correctionOf`, evaluation before evaluation runs, reason
  before review; no rich-feedback fields are silently synthesized from a thumb.
- **States:** saving → saved only after confirmation; failure → retained retryable
  intent. Learning CANDIDATE/EVALUATING/PROMOTED/REJECTED/SUPERSEDED/ROLLED_BACK
  remains separate from rating and Result acceptance. E draft is unverified,
  never promoted. A positive rating must not alter memory, route, policy or grants.
- **Fallback:** existing result rating and unsent contextual correction; explicit
  learning unavailable. No “Sofie learned this” confirmation without canonical
  promotion/consumer evidence.
- **Dependency/files:** L governed feedback/recall, E staging reconciliation and
  authenticated source ownership. `owner/proof.tsx`, `experience.tsx`, `data.ts`,
  `projection.ts`, `app/sofie/page.tsx`, `app/chat.tsx`, fixtures and feedback tests.

## Explicit future-source map

| UI concept | Canonical future source and required separation |
| --- | --- |
| Engineering Work | E Work + EngineeringWorkerProjection, never a Goal renamed to an engineering Work |
| MyFactory route / provenance | E admitted routing + F writer observation, authenticated receipt and candidate provenance; candidate author is not independent verifier |
| Sofie direct route | E admitted DIRECT routing + nativeExecution/controller/runtime/current run; chat response alone is not an admitted Work run |
| Relay collaboration | R exact scoped request/receipt; advisory only, with durable projection still required; not writer custody |
| Protected verification | V manifest bound checks + frozen candidate evidence; retain candidate/base/profile/criteria identity and limitations |
| Result | E `execution.results: ResultVersion[]` and `latestResult` reference, or current `nativeResult`; S Outcome remains a distinct legacy result type. Use source-qualified IDs, exact candidate/revision and retained history |
| Proof of Work | E/V source evidence + ProofOfWork v2, not result status or owner rating |
| Needs You | S exact approval binding today; E attention for exact Work/candidate/revision; G attentionSnapshot/goalAttentionEvent into I AttentionView. I requires item/action binding, expectedRevision and idempotencyKey; a text entry in pendingDecisions is not an approval token |
| Daily Brief | G fixed-window brief + current Today pages; S recommendations/review delivery; L knowledge changes and Reminder-owned schedule observations require explicit aggregation |
| Goal / Task progress | G outcome counts, task counts, blockers, current-generation evidence and truncation; S progress is task completion only. G deliberately supplies no overall percent |
| Feedback / learning | S rating; L authenticated feedback, scoped evaluated/promotion history and recall correction; E advisory learning drafts remain separate until owner reconciliation |

## Adapter isolation audit

**Sufficient separation to retain the page layouts; not a drop-in canonical API
replacement.** `preview.ts` alone constructs the sample snapshot;
`useOwnerData(preview)` chooses explicit sample or live reads. Live errors never
load samples. However `OwnerSnapshot`, `WorkItem.source`, component props and
inline mutations still depend on S concrete types. `Proof` reads evidence itself;
`DecisionCard`, `ResultCard` and `new-work.tsx` own API writes and preview branches;
`experience.tsx` fetches goal detail and creates chat context. Static sample imports
also remain in the browser bundle. There is no single interchangeable backend port.

Integration should add source-specific read/write adapters at these seams, validate
versions/required fields before rendering, and wire presentation props/actions to
those adapters. Retain Card/State/navigation/layout primitives. Do not coerce
canonical Work, Result or Attention into legacy task/approval types, fabricate a
TaskRun merely to render proof, or move backend authority into a UI adapter.
Some detail-card prop/composition changes are expected; a page redesign is not.

Two local assumptions were corrected in this pass: preview execution no longer
universally claims a MyFactory handoff; an unread Daily Brief no longer reports
zero upcoming commitments. No backend shape was invented. Remaining integration
constraints are explicit: source-qualified IDs for links/selection; version-aware
parsing (current reads validate only list envelopes); explicit pagination and
truncation; separate aggregate status from run activity; nullable cost/authority
observations instead of fixture-zero budgets. These are checklist gates, not claims
that the accepted UI already consumes unmerged types.
