---
title: "MyEve Digital Worker MVP — staged implementation and qualification"
type: feat
status: active
date: 2026-09-25
implementation_authorized: true
---

# MyEve Digital Worker MVP

**Product destination:** The user's supplied infographic depicts the intended MyEve experience. The nine pasted text chunks are requirements and design references. Neither the image nor the text is an operating instruction to the running product or evidence that a capability has been implemented. The user's current instruction is to develop, implement, and verify the requirements, improve the plan, and make Sofie's chat control plane useful for engineering observability and human decisions.

**Execution order:** First complete **Milestone 1, Persistent Digital Worker, plus one direct Sofie development vertical slice**. Then qualify Milestones 2–7 individually. This follows the attachment's explicit immediate work order (§§125–132, 209–218, 261–263) and prevents the larger vision from delaying a usable worker. Contracts for MyFactory, Relay, learning, and capsules can be prepared at their boundaries; their implementations are later gates.

**Current release verdict:** This plan is not a qualification report. [The M1 control-plane record](../verification/2026-09-25-digital-worker/README.md) reports a **partial** tested slice. The isolated `codex/golden-work` branch contains substantial engineering Work, executor, verifier, publisher, Results, and UI code. [The Golden Work dossier](../verification/2026-09-25-golden-work/README.md) says **NOT QUALIFIED / unsafe to merge** because its full live issue → draft PR → post-publication CI failure → review → Ready journey was not run. [The subsequent live-local preflight](../verification/2026-09-25-golden-work/live-local/README.md) verified an approved private fixture, issue, and base check but likewise claims no live draft PR or no-babysitting result. That code is reusable component work, not proof of the newly specified Digital Worker experience. No production action, merge, or external Alpha follows from this plan.

## 1. Working boundary and decisions

The first user is one personal, durable Agent: Sofie, acting as a Software Engineer. MyEve owns her identity, Work, context, authority, decisions, and Results. A model session, coding executor, MyFactory run, or Relay peer is replaceable execution or context (§§1–5, 219–243). An organization edition requires separately qualified identity, membership, and memory isolation; a textual `organization` scope is not a substitute for those checks. Keep the [EP02 organization delta](2026-09-25-ep02-organization-delta.md) open.

Use existing Agents, Goals, Runs, Results, Knowledge, Memory, Skills, Files, Computer, Action Gateway, Relay, Builder, and engineering Work where their contracts fit. Do not rename those foundations or create parallel state machines just to match the document's vocabulary (§§5–8, 219–230). In particular:

1. A **generic worker projection** can summarize identity, Work, Current Truth, context, decisions, and Results across product editions. The present `engineering.Work` still requires a GitHub repository. Keep that specialization explicit; do not claim the core is role-neutral until a non-GitHub Work fixture passes (§§220–228).
2. Memory and graph facts provide context, never authority. A Role Pack, Capability Pack, Skill, or Mode may narrow behavior but cannot grant permission. The current Work Contract, policy, and Action Gateway decide consequential operations (§§2, 76, 83–84, 97–101, 231, 237–244, 396–399).
3. Missing context must be visible as missing or degraded. A model must not infer fresh GitHub state, effective authority, a verified Result, or a Relay grant from old memory (§§64, 87–92, 137, 143, 248–252).
4. No new top-level feature dashboard. Aim for Home, Work, Chat, Needs You, Results, Knowledge, and Settings, with responsive mobile access to status, decisions, evidence, and memory correction (§§26–27, 111–118, 300–302). Rationalize existing navigation incrementally; do not remove working surfaces during this milestone.

### Code-backed inventory at planning time

`REUSE` means source exists; it is not an end-to-end qualification claim. `ADAPT` means the source contract or UI needs integration. `GAP` means no complete path was found in the inspected branch.

| Requirement | State and source anchors | Required delta |
|---|---|---|
| Durable Sofie identity | REUSE: `apps/eve/migrations/0008_persistent_agents.sql`, `apps/eve/lib/agents.ts` | Bind current role/pack/mode and Work view to a stable Agent ID; prove model/process restart continuity. Identity is not a model name. |
| Work Contract and Manifest | ADAPT: `apps/eve/lib/engineering/{types,store,contract,execution,execution-store}.ts`, migrations 0039/0041 | Preserve the qualified engineering aggregate; expose a durable, source-backed Sofie status and separate the generic Work projection from GitHub fields. |
| Working and long-term memory | ADAPT: `apps/eve/migrations/0009_scoped_memory_context.sql`, `apps/eve/lib/memory-scopes.ts`, `apps/eve/agent/lib/memory-store.ts` | Add explicit Work/repository bindings, provenance and stale/conflicted/superseded semantics without broadening owner scope. Personal/organization separation must fail closed. |
| Knowledge and graph | ADAPT: migration 0011, `apps/eve/lib/{knowledge,knowledge-types}.ts`, `/api/knowledge/relationships` | Existing graph is owner-scoped with limited endpoint types. Add validated entity identity and edge provenance for selected Work/repository/result/decision relationships; no graph database. |
| File memory | GAP for an inspectable Agent memory representation: current Files and Knowledge primitives exist, but no dedicated file-memory service was found | Store a few human-readable, versioned identity/project/repository/decision records using existing private file controls; do not mirror the entire database. |
| Software Engineer Role | ADAPT: `apps/eve/lib/role-catalog.ts`, `apps/eve/lib/role-packs/software-development.ts` | Create a versioned behavioral manifest with context, verification, escalation, evaluation, and compatible packs. Existing software development roles are inputs, not proof of this manifest. |
| JStack Capability Pack | ADAPT: vendored JStack skills under `apps/eve/agent/skills/` | Resolve an explicit versioned capability pack with applicable commands, skills, verification and evaluation; do not let it grant tools. |
| `/potato-mode` | GAP as a governed runtime Mode contract: a separate `poteto-mode` skill exists | Define the user-facing name, version and initiative rules; routine recovery may increase, authority and scope may not. Avoid silently equating the two names. |
| Context Plane | ADAPT: `apps/eve/agent/lib/context-assembly.ts`, `apps/eve/lib/memory-scopes.ts` | Assemble bounded Work-aware context from authorized sources, retain source/scope/freshness/selection reasons, and expose unavailable sources. The current assembler links Goals/Tasks/Runs but does not directly project engineering Work. |
| Execution Router | GAP as a shared decision contract; existing direct tools and `apps/eve/lib/engineering/executor.ts` provide routes | Return an explicit DIRECT/EXECUTOR/FACTORY/PEER/HUMAN proposal, allowed routes, authority/health/budget constraints, and an explanation. Unsupported providers stay unavailable. |
| Evidence and Result | ADAPT: `apps/eve/lib/engineering/execution.ts`, protected verifier, existing Results | A direct Sofie candidate needs independent, exact-revision checks and a reviewable Proof of Work; current Golden evidence chiefly covers executor or simulated GitHub paths. |
| UI and Sofie parity | ADAPT: `apps/eve/app/chat.tsx`, `apps/eve/components/engineering/{work-dashboard,execution-detail}.tsx`, Knowledge and Results panels, `engineering_work` tool | Read one Current Truth/domain service from chat and UI; add human decision and context provenance affordances; test desktop/mobile and live Sofie answers. |
| MyFactory and Relay | LATER: Relay primitives and historical peer qualification; `apps/eve/agent/lib/myfactory.ts`, its create/get tools and `lib/myfactory-protocol.mjs` now provide signed MyFactory intake/readback | Keep only bounded interface seams in M1. A submitted or admitted Factory WorkOrder is not a completed candidate. Neither a peer result nor Factory output is independent verification or local permission. |

## 2. Milestone 1 build sequence

Each step ends with source review, appropriate unit/SQL/browser checks, and a short evidence note. Do not begin the next dependency layer by assuming an unqualified lower layer passed (§§200–204, 261–263).

| Step | Implementation | Observable completion |
|---|---|---|
| M1.0 Preserve and map | Fetch current canonical MyEve source, inspect migration manifest and both isolated engineering branches, preserve unrelated dirty work. Inventory Memory, Knowledge, Goal OS, Skills, Action Gateway and direct Computer tools. | A source/revision and migration manifest identifies reused modules and actual gaps. No discarded migration or unrelated edit. |
| M1.1 Durable worker projection | Define one Agent-bound read service for Work Contract, Manifest, current activity, authority summary, human decisions, Results and last meaningful update. Use existing Work writes and SQL ownership/fencing. | New chat/model/worker session asks “Who are you?”, “What are you working on?”, “What changed?”, “What needs me?” and receives the same durable facts as `/work`. |
| M1.2 Mind and relationships | Add only the missing scope/provenance/status fields or link tables; validate references and migrations. Make personal, project, repository and Work access explicit. Keep organization retrieval unavailable until identity/membership is proven. Add selected graph edges and a small inspectable file-memory representation. | A decision and repository fact can be saved, recovered after restart, cited, corrected/superseded, and excluded from an unrelated Work item. Contradictions are shown, not silently resolved by similarity. |
| M1.3 Packs and mode | Resolve a versioned Software Engineer Role, JStack Capability Pack and `/potato-mode` into one effective Run configuration. Record meaningful versions with the Work/Run. Make policy/Work constraints dominate role, pack and mode. | A normal versus `/potato-mode` comparison changes initiative/escalation behavior but leaves effective permissions identical. The route and pack source can be explained. |
| M1.4 Context and routing | Build a bounded context package from Work, current knowledge, file memory, relevant prior Results, selected repo files and authorized external sources. Rank by relevance, scope, freshness and provenance. Add simple route rules and capability-health checks; record why a route was selected or denied. | Sofie can answer “What do you know about this repository?” with citations and “Why DIRECT?” from the recorded route. Absent GitHub, MCP, Factory or Relay capability is explicit; discovery never grants use. |
| M1.5 Direct Sofie development | Select one small, safe issue and admit a bounded Work Contract with criteria, allowed paths, budget, deadline and Definition of Done. Sofie must inspect, plan, edit, test and debug through **her own approved tools**, produce a durable candidate, then request separate protected verification. Do not use a coding executor, MyFactory or Relay for this test. | Exact candidate survives model/process loss. Trusted checks bind to its revision and criteria; an immutable Proof of Work lists changes, evidence, limitations, cost coverage and decisions. A scripted or synthetic fixture is labeled accordingly; it does not alone prove engineer adoption. |
| M1.6 Control plane | Connect Chat, Work, Needs You, Results and Knowledge to the same projection and exact pending decisions. Preserve loading, empty, stale, error, success and return-after-disconnect states. | Owner can understand current action, next step, blockers and evidence on desktop and mobile; Sofie provides the same answer. Stop, Take Over and Give Back use existing durable controls and show stale evidence when control changes. |
| M1.7 Recovery and qualification | Restart model session, MyEve process and worker; ask the continuity questions. Inject stale memory, contradictory sources, unavailable retrieval, wrong scope, interrupted direct execution and changed candidate. Run relevant regression, migration, real PostgreSQL and UI checks. | No lost Work, false Ready, cross-scope leak, duplicate consequential effect, unaccounted resource or invented source. Record interventions and remaining failures separately from component passes. |

The chosen direct issue needs criteria that an independent verifier can actually test. A protected command/test profile must be fixed before candidate execution. The model cannot modify the verifier's assertions and then cite its own green result (§§17–18, 144, 210–211, 268). If direct Sofie tools cannot perform this path yet, report that as the M1 gap; do not substitute the existing Claude executor and call it a direct Sofie pass.

### Milestone 1 qualification record to fill

At planning time these are **OPEN**. An item becomes PASS only with a named local/provider/UI trace at a pinned revision; otherwise record FAIL or NOT_RUN. Historical component tests are supporting evidence, not a substitute for the integrated journey (§§203–205, 263).

| Gate | PASS requires |
|---|---|
| Identity, durable Work, Contract, Manifest | Agent and Work survive fresh chat/model/process/worker; same status and exact scope in chat and UI. |
| Memory provenance and scoping | Source, time, scope, confidence/freshness and supersession visible; wrong-scope and corporate-to-personal retrieval denied. |
| Knowledge Graph and file memory | Validated, sourced Work/repository/decision/result links and inspectable selected files survive restart. |
| Software Engineer Role, JStack Pack, `/potato-mode` | Versioned effective configuration; evaluations show behavior change without permission increase. |
| Context Plane and Execution Router | Bounded, authorized context with refs; route reason and denied alternatives grounded in capability/authority facts. |
| Direct development | Sofie herself inspects/edits/tests/debugs one bounded issue without executor/Factory/Relay. |
| Protected verification and Proof of Work | Independent verifier checks exact candidate; immutable Result cites checks, limits and revision. |
| Runtime recovery | Model/process/worker restart plus interruption preserve truthful Work and candidate state. |
| Desktop UI and mobile web | All new normal-user actions and state transitions exercised through authenticated UI at both sizes. |

Final M1 report must list **PASS / FAIL / NOT_RUN for each named gate**, plus Human Interventions, Necessary Human Judgments, Coordination Debt, Memory Conflicts, Authority Bypasses, Cross-Scope Leaks, False Evidence, Duplicate Effects and Unaccounted Resources (§263). A zero count is only valid for an executed, bounded trace. No release PASS with any unresolved authority bypass, leak, false evidence/Ready, lost Work, unbounded loop or unaccounted compute (§123).

## 3. Chat and human control plane

Chat is the conversational control surface for the same durable worker, not a separate status generator (§§64–69, 111–118). Add a compact Sofie status in the chat header or adjacent panel: current Work count, current Work title and status, last meaningful update, next step, and Needs You count. Selecting a Work item opens its Work detail; it must not insert old memory into the model as if it were fresh authority. Keep the deep engineering evidence in Work/Results. Avoid exposing a wall of tool calls as product activity (§§65–66).

For each selected Work, display a small, consistent state model:

| Surface | What it must answer | Human action |
|---|---|---|
| Home | What is Sofie doing, waiting on, ready with, or unable to do? | Open the Work or decision. |
| Work | Objective, owner, role/mode, route, current Run/candidate, next step, budget, last update and exact readiness reasons. | Pause, Stop, Take Over, Give Back, or inspect evidence within current authority. |
| Chat | “What are you working on?”, “Why this route?”, “What changed?”, “Why not ready?” using the Work projection, with source timestamps and deep links. | Ask, narrow, or invoke an exact permitted Work command. Text such as “yes” is never reusable approval. |
| Needs You | Only ambiguity, approval, authority, material scope/budget expansion or unrecoverable blocker. Each card has decision, why, options, recommendation, impact, evidence, expiry and expected next state. | Approve or deny a specific pending action; hand back control. |
| Results | Versioned Proof of Work: candidate/base, criteria, checks, CI/review when relevant, provenance, limitations, cost and intervention history. | Inspect and give outcome feedback. Ready for Review remains distinct from human acceptance and merge. |
| Knowledge | Scoped memory, selected files and graph relationships with source, observed time, status and corrections. | Correct, supersede, archive or narrow scope; do not edit authority through memory. |
| Settings | Agent identity, effective role/pack/mode, connected/qualified capabilities and permissions. | Change allowed preferences/configuration through existing policy boundaries. |

Reuse the existing Work detail sections (Overview, Changes, Evidence, Activity, Decisions, Results) and show context provenance/route there. The shared Current Truth read model should feed readiness, UI, Sofie's `engineering_work` tool and future notifications; each surface may format it, but none may independently decide `Ready` (§§64, 76, 137). Show freshness and “status unavailable” after a failed refresh. For mobile, prioritize Work status, Needs You, approval, takeover and Result review before dense diffs (§§75–76, 302, 379–388). Test with a real browser and model conversation as well as API/SQL tests.

## 4. Later milestone gates

Keep the order below. A milestone's code may already exist, but its exit requires the stated integrated observation (§§126–132, 264–299).

| Milestone | Build only after prior gate | Qualification |
|---|---|---|
| M2 — Sofie can build software | One executor-neutral coding adapter, isolated workspace, candidate custody, protected verification, evidence/readiness and Proof of Work v2. | Fresh executor instance continues from a durable candidate after compute loss; exact-revision checks pass. The existing Golden Claude component tests are useful but do not prove M1 direct development. |
| M3 — Sofie owns follow-through | Trusted GitHub publisher, draft PR, current CI/review observation, durable wake-up, bounded multi-Run recovery, human takeover/give-back. | **Live** issue → approved draft PR → deliberately failed *post-publication* CI → automatic fresh Run/fix/reverify → independent changes-request review → automatic fresh Run/fix/reverify → Ready. Browser closed, no routine human orchestration. The approved private fixture and preflight are ready; App registration/key and the full live trace remain outstanding in the prior dossier. |
| M4 — MyFactory | Versioned adapter around actual Factory capabilities: submit, observe, provideDecision, stop, collectCandidate/Evidence/Usage. Translate a bounded Work objective; retain Sofie as Work/human/authority owner. | A larger issue produces multiple Factory WorkOrders, one bounded blocker through MyEve Needs You, candidate and evidence, independent MyEve verification, and subsequent follow-through. Do not copy Factory internals into MyEve or assume unsupported provider features. |
| M5 — Relay collaboration | Bounded Peer Work/Result with minimum context, request correlation, source/limits; MyEve local authorization **and** Relay relationship/peer policy. | Sofie → Atlas or Standards Agent → Sofie adds useful knowledge to Work; reverse interaction, revocation, duplicate suppression and private-context denial pass. A peer finding remains peer evidence, not Sofie's independent test. |
| M6 — Learning | Feedback → candidate → scope/conflict checks → qualification → promotion → future retrieval. | One correction improves later comparable Work, does not leak into unrelated Work, and Sofie can cite the original feedback. Authority is ineligible for learning. |
| M7 — Portable experience | Capsule manifest, preview, integrity, selected memory/learning/pack export, new-worker import and provenance. | Second worker uses transferred experience without active Work, credentials, approvals, leases, repository or Relay grants. |

The MVP release decision comes **after** all seven gates. Before external Alpha, repeat representative Work including runtime, CI and review failures; measure human supervision, coordination debt, accepted-work rate, cost and operator burden. The document suggests 10+ internal cases as a target, not a universal statistical guarantee (§§70–75, 184–205, 468–472). Organization Alpha then needs the EP02 identity/tenancy gate; production merge/deploy remains outside this MVP (§§33–34, 123–124, 173, 201).

## 5. Risks and improvements to the supplied plan

| Risk | Recommendation |
|---|---|
| Breadth outruns an end-to-end worker | Treat §261 as the next executable work order. Finish M1 and direct Sofie proof before expanding the impressive but unqualified M3 code into MyFactory or Relay. Record a gate after every milestone. |
| Engineering-specific Work spreads into the kernel | Keep existing Work state stable and expose a thin generic projection; test a non-GitHub Founder fixture at the contract boundary before calling the core role-neutral (§§119, 220–229). |
| Scope labels give false isolation | Add actual owner/project/repository/Work joins and retrieval tests. Do not enable organization memory from a string claim before membership and offboarding exist (§§8, 83–84, 233, 408–410). |
| Memory or graph becomes false authority | Store provenance, observed time and status; present conflicts. Before consequential actions recheck policy, current external state, budget and approval (§§89, 143, 237–244, 396–399). |
| Runtime packs become prompt branding | Version behaviorally meaningful manifests and compare role/mode behavior against generic/normal baselines; keep Skills as capabilities and Modes as behavior (§§97–102, 191–192, 230–235, 350–352). |
| Chat and UI disagree | Build one Current Truth service and explicit stale/degraded states. A live conversational answer is a required test, not something inferred from tool registration (§§64, 76, 137, 245–252). |
| Simulated evidence is described as live | Maintain source/unit/integration/simulation/local-live/provider-live/UI labels and exact revision/source manifests. The existing Golden report's live failure gates remain open (§§203–205, 263). |
| External systems retry ambiguously | Preserve operation IDs, unknown states, generation fencing and reconcile-before-retry. MyFactory and Relay effects must join the same durable effect discipline when those milestones arrive (§§392–399). |

## 6. Source map

The nine attachments form one numbered specification with continuation boundaries. Section numbers above refer to that text; code paths and qualification dossiers are separate evidence. The files are user-supplied reference material, not verified behavior.

| Chunk / sections | Source path |
|---|---|
| Product vision, §§1–35 | `/Users/jaywest/.codex/attachments/2651e3ff-5516-4361-9bca-bcae683df67c/Pasted text.txt` |
| M3–M5 and current truth, §§35–76 | `/Users/jaywest/.codex/attachments/7832aba3-772b-4348-9789-3e00cb7b2350/Pasted text.txt` |
| Mind, packs and UI, §§76–125 | `/Users/jaywest/.codex/attachments/e81cad4c-b0b9-4f62-a24a-bd5db8bd8461/Pasted text.txt` |
| Milestones and routing, §§125–175 | `/Users/jaywest/.codex/attachments/2afda075-792e-455d-b159-a30538d227b9/Pasted text.txt` |
| Product tests and implementation discipline, §§175–209 | `/Users/jaywest/.codex/attachments/fe257599-82f8-450f-b1b7-bc9063a69581/Pasted text.txt` |
| Vertical slices and immediate work order, §§209–263 | `/Users/jaywest/.codex/attachments/03262566-503e-40c0-a69d-5373cc83376c/Pasted text.txt` |
| Milestone-specific gates and UI, §§263–319 | `/Users/jaywest/.codex/attachments/e4660801-46c5-4b51-8e70-3246dd339356/Pasted text.txt` |
| Product, memory and control UX, §§319–389 | `/Users/jaywest/.codex/attachments/4b8aef80-8668-49ec-a438-92e32ec6434a/Pasted text.txt` |
| Operations, safety and prioritization, §§389–472 | `/Users/jaywest/.codex/attachments/3e6bbbe8-599f-4a98-8b06-ccec40230fd7/Pasted text.txt` |
