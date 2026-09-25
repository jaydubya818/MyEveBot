# MyEve Engineering — source coverage ledger

Date: 2026-09-25. Companion to the [implementation plan](2026-09-25-feat-myeve-engineering-plan.md) and [Claude review](2026-09-25-myeve-engineering-claude-review.md).

## Coverage and interpretation

All **916 distinct numbered recommendations** in the ten supplied parts are indexed below. Continuation headings are merged with the original recommendation, not counted twice. Numbered examples inside recommendation bodies are excluded from the heading inventory. The original attachments remain the source of full wording; this ledger does not replace their bodies.

Workstream routing records where a recommendation is considered. It does **not** authorize every feature in that range or imply each title is accepted unchanged. Follow the range scope rule, the review corrections, the master release boundaries and D1–D9. Broad recommendations can span multiple packages. Later ideas remain conditional even when adjacent items are core.

The final source ends after “Public positioning should remain much” in #916. Its missing ending is not reconstructed. Continued IDs: 63, 143, 231, 321, 421, 508, 702, 802.

## Source manifest

Byte counts and SHA-256 hashes refer to the exact local attachment bytes read for this plan. Links point to originals, not externally hosted copies.

| Source | Recommendations / original file | Bytes | SHA-256 |
|---|---|---:|---|
| C01 | [1–63](</Users/jaywest/.codex/attachments/16ec37ff-93a2-417f-bfca-6cfb20bb9b4e/Pasted text.txt>) | 15175 | `40170eafeaa6d469f67f8a0dae2868cdc2a9ced47e51daa7d649d07145640209` |
| C02 | [63–143](</Users/jaywest/.codex/attachments/8be096ef-ecd2-4299-9cdd-81ea6b3107a9/Pasted text.txt>) | 16795 | `441400536c7585c315474c321902f656d6c462f64b1ba816ff35ac882ffa8983` |
| C03 | [143–231](</Users/jaywest/.codex/attachments/269f215e-4104-4db9-9c66-eab9b2d66c7e/Pasted text.txt>) | 16956 | `b153d3d75c5a4f14ab4aa3228f5c2c2971fb0133fa1d493c93505b0cf1444e32` |
| C04 | [231–321](</Users/jaywest/.codex/attachments/3a156c22-6339-4751-99c5-2486d70ab13c/Pasted text.txt>) | 17224 | `43ec1b9e9d267fa06a8374dfc0cffd6e403c3562ec2ae7f9fd99a5e749fd8330` |
| C05 | [321–421](</Users/jaywest/.codex/attachments/0559adab-eff8-4870-ab87-52b9d9f879e2/Pasted text.txt>) | 17460 | `409481d86116da66fd8a55b06cfa771cbaa30847fa5badfdff7891568111fcf6` |
| C06 | [421–508](</Users/jaywest/.codex/attachments/c2ed60d3-90b5-4833-b8f4-f29005fdc137/Pasted text.txt>) | 17854 | `4fdf24763c25c7c2452c658dfc10cadf6c392c647311a6e9177dee3d7732beda` |
| C07 | [508–610](</Users/jaywest/.codex/attachments/23efdbb0-52df-403f-839b-8ac02061a0ea/Pasted text.txt>) | 16677 | `926bcce3302126cde8ad73891ce95346fc46a0cd3e030c3d1109fe162c3bb6b2` |
| C08 | [611–702](</Users/jaywest/.codex/attachments/b3305ce2-2654-4ae4-adfc-234143a16424/Pasted text.txt>) | 17440 | `ed8378d2057579fc12f0424a2e86571aaa9f31c0b40370ffb107998455364f28` |
| C09 | [702–802](</Users/jaywest/.codex/attachments/300b4cab-daed-46ce-b4b0-b3da7ab77197/Pasted text.txt>) | 17481 | `1747fe45d6ff4f0d6ee88387e9e2560c6242e43aa0482aac037ea52fb69b8bd6` |
| C10 | [802–916](</Users/jaywest/.codex/attachments/be9143c3-32fa-477a-9b29-075841dcf896/Pasted text.txt>) | 18303 | `b4338e359b49cf609c5b35d4bd58f620cd08aed8d7b4f4903f4dc770bf087a70` |

Earlier supplied inputs, outside the 1–916 numbering:

| Source | Original file | SHA-256 |
|---|---|---|
| V01 | [Original product vision](</Users/jaywest/.codex/attachments/95079ffa-673e-48e5-8e0e-c608daf97423/Pasted text.txt>) | `41f3351b7a03cd8360218ff3badff85e16beff36a6ae88bbc4c9a67e89a1bed7` |
| V02 | [Sol assessment](</Users/jaywest/.codex/attachments/cef4874f-fb02-4825-b753-1094271dd21c/Pasted text.txt>) | `cba0b080b17c896bfeaa1084bdf3e6a4979eedad77e0d9f071f65c71d478e81c` |

The earlier conversation also established the separation between MyEve product orchestration and Relay governed relationships, and discussed branch/worktree isolation rather than immediately forking. No repository fork or implementation branch was created by this planning task. Current source revisions and changes since the earlier review are recorded in the master plan.

## Workstream routing and scope rules

| Route | Source range | Topic | Work packages | Scope / disposition |
|---|---|---|---|---|
| R01 | 1–19 | Work, criteria and evidence | EP04/07 | Core thin Work aggregate; existing primitives reused. |
| R02 | 20–27 | Decisions and attention | EP04/10 | Core pending decision and blocker experience. |
| R03 | 28–45 | Executor and recovery | EP01/05/06 | One qualified executor; no universal failover system. |
| R04 | 46–60 | GitHub, results and intake | EP03/08/09/10/15 | Core GitHub loop and current Work status; richer Brief later. |
| R05 | 61–79 | Ownership and repository readiness | EP02/03 | Organization-only core; personal/corporate switching deferred. |
| R06 | 80–88 | Templates and executor model | EP04/06/15/17 | One template/adapter now; catalogs and broader handoff later. |
| R07 | 89–104 | Revisions, policy and approvals | EP04/07/08 | Core versioning/admission; policy cannot learn new authority. |
| R08 | 105–127 | Scheduling, dependencies and teams | EP06/09/15/16 | Bounded single-Work wakeup core; multi-Work orchestration/analytics later. |
| R09 | 128–135 | Relay specialist | EP14 | Optional separate gate after core value. |
| R10 | 136–161 | Pilot design and evaluation | EP12/13 | Core selection, baseline, supervision and operator measurements. |
| R11 | 162–185 | Positioning and integrations | EP00/03/13/17 | GitHub first; no general integration/network platform in alpha. |
| R12 | 186–200 | Work authority and handoff | EP02/04/06/10 | Core durable responsibility, current authority and one writer. |
| R13 | 201–222 | Executor context and workspace | EP01/05/06 | Core isolation/custody; portable handoff is later qualification. |
| R14 | 223–240 | Verification and baseline | EP07 | Core protected evidence; baseline diagnostic, not automatic waiver. |
| R15 | 241–257 | Risk, exceptions and review | EP07/10 | Core enforceable gates and honest review UX; extra specialist reviewers later. |
| R16 | 258–271 | Knowledge and analytics | EP02/15 | Scope/provenance now; advanced retrieval and analytics later. |
| R17 | 272–286 | Failures, scheduling and metrics | EP06/09/11/13 | Core finite recovery and measurement; advanced scheduling later. |
| R18 | 287–304 | Events and effect safety | EP08/09/11 | Core dedupe/fencing/reconciliation; no universal exactly-once promise. |
| R19 | 305–320 | GitHub credentials and privacy | EP02/03/11 | Core token boundaries/retention; sophisticated DLP later. |
| R20 | 321–337 | Deployment and execution | EP01/05/11/16/17 | Managed isolated organization alpha; customer cloud/desktop deferred. |
| R21 | 338–354 | Workspace and context lifecycle | EP05/06 | Core replaceable compute and durable candidate/context. |
| R22 | 355–370 | Operations and recovery | EP09/11 | Core operator visibility/recovery; no forced event-sourcing rewrite. |
| R23 | 371–400 | Authority and organization controls | EP02/08/11/16 | Minimum membership/scope/audit now; enterprise controls later. |
| R24 | 401–420 | Interoperability and provenance | EP14/17 | Relay query first; arbitrary MCP/A2A and public directory deferred. |
| R25 | 421–440 | Receipts and external drift | EP08/09/14 | Core local effect recovery; Relay receipts scoped to optional integration. |
| R26 | 441–451 | Review and friction | EP09/10/13/15 | Core follow-up and human cost; aggregate analytics later. |
| R27 | 452–468 | Extensions and identity direction | EP02/14/17 | Org-only alpha; public SDK and cross-life/network scope later. |
| R28 | 469–484 | Pricing and commercial model | EP13 | Validate simple manual pilot terms; no billing platform commitment. |
| R29 | 485–503 | Evaluation and principles | EP07/12/13 | Core golden cases, bounded authority and measured value. |
| R30 | 504–507 | Claude priority ordering | EP00–13 | Revised: basic profile, criteria, costs and follow-through move into core. |
| R31 | 508–526 | Reuse and Work model | EP00/04 | Adapt existing foundations; no parallel agent engine or graph database. |
| R32 | 527–550 | Result and decision UX | EP07/10 | Core responsive review/handoff; native mobile deferred. |
| R33 | 551–570 | Provider integration and differentiation | EP01/03/07/13/17 | One provider path; qualify evidence; demand-gated expansion. |
| R34 | 571–590 | Dogfood and authority ladder | EP08/12/13 | Progressive modes and explicit grants; no automatic authority promotion. |
| R35 | 591–610 | Domain semantics and evaluation | EP04/07/13 | Core exact definitions and immutable Result versions. |
| R36 | 611–630 | Supervision and release controls | EP11/12/13 | Core support/cost/safety; broader release machinery only as needed. |
| R37 | 631–650 | Limits, health and supported modes | EP03/06/11 | Core admission and finite exposure; advanced fleet controls later. |
| R38 | 651–676 | Advisory role, Relay and product claims | EP03/10/13/14 | Truthful modes; optional specialist never grants authority. |
| R39 | 677–703 | Instructions for code-grounded planning | EP00 | Addressed by this plan; no invented reuse percentage or implementation authorization. |
| R40 | 704–726 | Inventory and golden workflow | EP00/01/12 | Inventory plus whole-lifecycle verification, not isolated endpoint demos. |
| R41 | 727–743 | Executor, ownership and product decisions | EP00/01/02/14 | D1–D9 remain recommendations pending owner decision. |
| R42 | 744–765 | UX, setup and runtime reliability | EP03/10/11 | Core responsive flow and measured onboarding; do not promise unmeasured setup time. |
| R43 | 766–786 | Security and test strategy | EP02/05/07/11/12 | Core threat model, adversarial and recovery tests. |
| R44 | 787–801 | Pilot operating and decision gates | EP13 | Pre-register evidence and expand/refine/pivot/stop thresholds. |
| R45 | 802–820 | Prioritization and product experience | EP04/10/13/15 | Current decision needs first; later surfaces justified by observed burden. |
| R46 | 821–838 | Provider/catalog boundaries | EP03/06/15/17 | One qualified path and useful defaults; no catalogue platform in alpha. |
| R47 | 839–847 | Versioning and cost uncertainty | EP06/07/11 | Core reproducibility metadata and honest unknown costs. |
| R48 | 848–862 | Metrics and analytics | EP13/15 | Consent-aware work metrics now; broader team analytics later, no employee ranking. |
| R49 | 863–875 | Service agents and networks | EP14/17 | Selected specialist only after value; broad network/reputation deferred. |
| R50 | 876–891 | Risks and discovery | EP00/01/13 | Core explicit assumptions, real workflows and buyer validation. |
| R51 | 892–907 | Scope and onboarding | EP03/13/15/16 | Supported envelope now; self-service breadth follows repeatable managed setup. |
| R52 | 908–916 | Commercial readiness and roadmap | EP13/16 | Conditional enterprise/commercial preparation; #916 ending missing. |

## Individual recommendation index

Titles below reproduce the supplied heading for navigation. A title is not an implementation specification or evidence that a capability exists. Source IDs resolve through the manifest; route IDs resolve through the preceding table.

| # | Supplied recommendation heading | Source part(s) | Route |
|---:|---|---|---|
| 1 | Introduce a First-Class Work Object | C01 | R01 |
| 2 | Work State Machine | C01 | R01 |
| 3 | Work Ownership | C01 | R01 |
| 4 | Work Handoff | C01 | R01 |
| 5 | Acceptance Criteria | C01 | R01 |
| 6 | Acceptance Criteria Provenance | C01 | R01 |
| 7 | Criteria Confirmation | C01 | R01 |
| 8 | Criteria Versioning | C01 | R01 |
| 9 | Definition of Done | C01 | R01 |
| 10 | Readiness Engine | C01 | R01 |
| 11 | Core Principle | C01 | R01 |
| 12 | Evidence Graph | C01 | R01 |
| 13 | Revision-Bound Evidence | C01 | R01 |
| 14 | Evidence Invalidation | C01 | R01 |
| 15 | Evidence Freshness | C01 | R01 |
| 16 | Evidence Coverage | C01 | R01 |
| 17 | Evidence Quality | C01 | R01 |
| 18 | Engineering Result | C01 | R01 |
| 19 | Result Confidence vs Evidence | C01 | R01 |
| 20 | Known Limitations | C01 | R02 |
| 21 | Assumption Ledger | C01 | R02 |
| 22 | Decision Ledger | C01 | R02 |
| 23 | Blocker Model | C01 | R02 |
| 24 | Needs You | C01 | R02 |
| 25 | Escalation Packet | C01 | R02 |
| 26 | Attention Budget | C01 | R02 |
| 27 | Human Supervision Cost | C01 | R02 |
| 28 | Executor Abstraction | C01 | R03 |
| 29 | Executor Adapter | C01 | R03 |
| 30 | Do Not Hide Executor Differences | C01 | R03 |
| 31 | Executor Selection | C01 | R03 |
| 32 | Executor Portability | C01 | R03 |
| 33 | Work Continuity | C01 | R03 |
| 34 | Recovery | C01 | R03 |
| 35 | Checkpoints | C01 | R03 |
| 36 | Branch Ownership | C01 | R03 |
| 37 | Concurrent Modification | C01 | R03 |
| 38 | Repository Isolation | C01 | R03 |
| 39 | Installation Policy | C01 | R03 |
| 40 | Secret Broker | C01 | R03 |
| 41 | Network Policy | C01 | R03 |
| 42 | Resource Limits | C01 | R03 |
| 43 | Cancellation | C01 | R03 |
| 44 | Pause vs Cancel | C01 | R03 |
| 45 | Retry Semantics | C01 | R03 |
| 46 | GitHub Integration as a Lifecycle | C01 | R04 |
| 47 | CI Monitoring | C01 | R04 |
| 48 | Review Feedback Loop | C01 | R04 |
| 49 | Review Classification | C01 | R04 |
| 50 | Human Review Boundary | C01 | R04 |
| 51 | Work Timeline | C01 | R04 |
| 52 | Work Cost | C01 | R04 |
| 53 | Cost Guardrails | C01 | R04 |
| 54 | Engineering Daily Brief | C01 | R04 |
| 55 | Work Inbox | C01 | R04 |
| 56 | Assignment | C01 | R04 |
| 57 | GitHub Label | C01 | R04 |
| 58 | Issue Readiness | C01 | R04 |
| 59 | Issue Readiness Result | C01 | R04 |
| 60 | Clarification Before Execution | C01 | R04 |
| 61 | Organization Scope | C01 | R05 |
| 62 | Corporate Workspace | C01 | R05 |
| 63 | Corporate Ownership | C01, C02 | R05 |
| 64 | Personal Ownership | C02 | R05 |
| 65 | Employee Departure | C02 | R05 |
| 66 | Workspace Context Boundary | C02 | R05 |
| 67 | Context Classification | C02 | R05 |
| 68 | No Silent Cross-Scope Memory | C02 | R05 |
| 69 | Organization Policy Ceiling | C02 | R05 |
| 70 | Repository Policy | C02 | R05 |
| 71 | Repository Profile | C02 | R05 |
| 72 | Repository Knowledge | C02 | R05 |
| 73 | Repository Bootstrap | C02 | R05 |
| 74 | Repository Health for Agents | C02 | R05 |
| 75 | Agent Readiness Recommendations | C02 | R05 |
| 76 | Agent Experience (AX) | C02 | R05 |
| 77 | AX Report | C02 | R05 |
| 78 | Executor Qualification Per Repository | C02 | R05 |
| 79 | Executor Qualification Evidence | C02 | R05 |
| 80 | Work Templates | C02 | R06 |
| 81 | Templates Are Not Agents | C02 | R06 |
| 82 | Skills vs Agents vs Executors | C02 | R06 |
| 83 | Human as Executor | C02 | R06 |
| 84 | Hybrid Work | C02 | R06 |
| 85 | Work Resume | C02 | R06 |
| 86 | Requirement Change Detection | C02 | R06 |
| 87 | Base Branch Drift | C02 | R06 |
| 88 | PR Drift | C02 | R06 |
| 89 | Ownership Attribution | C02 | R07 |
| 90 | Change Graph | C02 | R07 |
| 91 | Review Coverage | C02 | R07 |
| 92 | Review Independence | C02 | R07 |
| 93 | Verification Agent | C02 | R07 |
| 94 | Hidden Holdouts | C02 | R07 |
| 95 | Quality Gates | C02 | R07 |
| 96 | Gate Evidence | C02 | R07 |
| 97 | Gate Override | C02 | R07 |
| 98 | Exceptions | C02 | R07 |
| 99 | Engineering Policy Packs | C02 | R07 |
| 100 | Work Policy Snapshot | C02 | R07 |
| 101 | Agent Action Preview | C02 | R07 |
| 102 | Batch Approval Carefully | C02 | R07 |
| 103 | Approval Fatigue | C02 | R07 |
| 104 | No Learned Authority | C02 | R07 |
| 105 | Work SLA | C02 | R08 |
| 106 | Work Priority | C02 | R08 |
| 107 | Work Queue | C02 | R08 |
| 108 | Concurrency Policy | C02 | R08 |
| 109 | Priority Scheduling | C02 | R08 |
| 110 | Work Dependencies | C02 | R08 |
| 111 | External Dependencies | C02 | R08 |
| 112 | Watchers as Work Infrastructure | C02 | R08 |
| 113 | Event-Driven Resume | C02 | R08 |
| 114 | No Polling Explosion | C02 | R08 |
| 115 | Engineering Notifications | C02 | R08 |
| 116 | Quiet Background Work | C02 | R08 |
| 117 | Work Summary | C02 | R08 |
| 118 | Explain Current State | C02 | R08 |
| 119 | “Why Are You Waiting?” | C02 | R08 |
| 120 | “What Do You Need From Me?” | C02 | R08 |
| 121 | “What Changed?” | C02 | R08 |
| 122 | Engineering Brief by Exception | C02 | R08 |
| 123 | Team Work View | C02 | R08 |
| 124 | Do Not Turn It Into Employee Surveillance | C02 | R08 |
| 125 | Work Attribution for Managers | C02 | R08 |
| 126 | Team Capacity | C02 | R08 |
| 127 | Agent Fleet Operations | C02 | R08 |
| 128 | Organization Agent Directory | C02 | R09 |
| 129 | First Relay Specialist Recommendation | C02 | R09 |
| 130 | Engineering Standards Agent | C02 | R09 |
| 131 | Why Relay Matters Here | C02 | R09 |
| 132 | Relay Should Remain Optional for V1 Core | C02 | R09 |
| 133 | Relay Failure Semantics | C02 | R09 |
| 134 | Specialist Result Provenance | C02 | R09 |
| 135 | Agent Recommendation vs Policy | C02 | R09 |
| 136 | Pilot Feature Flags | C02 | R10 |
| 137 | Pilot Safety Ceiling | C02 | R10 |
| 138 | Pilot Repository Allowlist | C02 | R10 |
| 139 | Pilot Issue Allowlist | C02 | R10 |
| 140 | Design Partner Control | C02 | R10 |
| 141 | Pilot Audit | C02 | R10 |
| 142 | Pilot Comparison | C02 | R10 |
| 143 | Pilot Experiment | C02, C03 | R10 |
| 144 | Primary Pilot Metric | C03 | R10 |
| 145 | Human Supervision Time | C03 | R10 |
| 146 | Time to Review-Ready | C03 | R10 |
| 147 | Review Rework | C03 | R10 |
| 148 | Intervention Rate | C03 | R10 |
| 149 | Recovery Rate | C03 | R10 |
| 150 | Evidence Accuracy | C03 | R10 |
| 151 | Duplicate Consequential Effects | C03 | R10 |
| 152 | Authority Bypass | C03 | R10 |
| 153 | Cost per Accepted Work Item | C03 | R10 |
| 154 | Pilot Cohort | C03 | R10 |
| 155 | Pilot Work Types | C03 | R10 |
| 156 | Pilot Success Thresholds | C03 | R10 |
| 157 | Repeat Usage Is Critical | C03 | R10 |
| 158 | User Pull | C03 | R10 |
| 159 | Design Partner Interviews | C03 | R10 |
| 160 | Buyer Validation | C03 | R10 |
| 161 | Buyer Hypothesis | C03 | R10 |
| 162 | User vs Buyer | C03 | R11 |
| 163 | Engineer Value | C03 | R11 |
| 164 | Platform Value | C03 | R11 |
| 165 | Leadership Value | C03 | R11 |
| 166 | Security Value | C03 | R11 |
| 167 | Avoid Selling “Digital Workers” Initially | C03 | R11 |
| 168 | Avoid “Replace Engineers” | C03 | R11 |
| 169 | Product Category | C03 | R11 |
| 170 | Supporting Positioning | C03 | R11 |
| 171 | Alternative Positioning | C03 | R11 |
| 172 | Executor-Neutral Messaging | C03 | R11 |
| 173 | “Bring Your Own Coding Agent” | C03 | R11 |
| 174 | Executor Marketplace — Defer | C03 | R11 |
| 175 | Executor Qualification | C03 | R11 |
| 176 | Executor Failover — Future | C03 | R11 |
| 177 | Work Portability | C03 | R11 |
| 178 | Engineering System of Record | C03 | R11 |
| 179 | GitHub Remains Source of Code Truth | C03 | R11 |
| 180 | Issue Tracker Remains Work Intake Source | C03 | R11 |
| 181 | MyEve Adds Delegation State | C03 | R11 |
| 182 | Deep Links | C03 | R11 |
| 183 | GitHub-Native Entry Points | C03 | R11 |
| 184 | Slack Entry Point — Later | C03 | R11 |
| 185 | API Entry Point | C03 | R11 |
| 186 | Work Identity | C03 | R12 |
| 187 | Conversation Attachment | C03 | R12 |
| 188 | Conversation Reset Safety | C03 | R12 |
| 189 | Multi-Run Work | C03 | R12 |
| 190 | Run Is Not Work | C03 | R12 |
| 191 | Task Is Not Work | C03 | R12 |
| 192 | Goal Is Not Work | C03 | R12 |
| 193 | Result Is Not Work | C03 | R12 |
| 194 | Agent Is Not Work | C03 | R12 |
| 195 | Executor Is Not Agent Identity | C03 | R12 |
| 196 | Human Can Take Back Work | C03 | R12 |
| 197 | Human Can Give Back Work | C03 | R12 |
| 198 | Human Modification Detection | C03 | R12 |
| 199 | Shared Branch Policy | C03 | R12 |
| 200 | Branch Lease | C03 | R12 |
| 201 | PR Ownership | C03 | R13 |
| 202 | Ready for Review Contract | C03 | R13 |
| 203 | Ready Is Repository-Specific | C03 | R13 |
| 204 | Human Review Result | C03 | R13 |
| 205 | Return to MyEve | C03 | R13 |
| 206 | Scope Expansion Detection | C03 | R13 |
| 207 | Work Scope Budget | C03 | R13 |
| 208 | File Scope — Optional | C03 | R13 |
| 209 | Repository Scope | C03 | R13 |
| 210 | Cross-Repository Work — Future | C03 | R13 |
| 211 | Monorepo Support | C03 | R13 |
| 212 | Large Repository Context | C03 | R13 |
| 213 | Context Snapshot | C03 | R13 |
| 214 | Reproducibility | C03 | R13 |
| 215 | Environment Profile | C03 | R13 |
| 216 | Environment Drift | C03 | R13 |
| 217 | Dependency Cache | C03 | R13 |
| 218 | Workspace Cleanup | C03 | R13 |
| 219 | Workspace Rehydration | C03 | R13 |
| 220 | Durable Work, Ephemeral Compute | C03 | R13 |
| 221 | Persistent Agent, Replaceable Runtime | C03 | R13 |
| 222 | Engineering Provenance | C03 | R13 |
| 223 | AI Authorship | C03 | R14 |
| 224 | Commit Strategy | C03 | R14 |
| 225 | PR Description Generation | C03 | R14 |
| 226 | PR Evidence Link | C03 | R14 |
| 227 | CI Evidence Import | C03 | R14 |
| 228 | Test Failure Classification | C03 | R14 |
| 229 | Flaky Test Memory | C03 | R14 |
| 230 | Regression Baseline | C03 | R14 |
| 231 | Base vs Candidate Evidence | C03, C04 | R14 |
| 232 | Differential Verification | C04 | R14 |
| 233 | Verification Strategy | C04 | R14 |
| 234 | Risk-Based Verification | C04 | R14 |
| 235 | Verification Plan Preview | C04 | R14 |
| 236 | Verification Cost Estimate | C04 | R14 |
| 237 | Verification Completeness | C04 | R14 |
| 238 | Verification Exception | C04 | R14 |
| 239 | “Ready With Exception” | C04 | R14 |
| 240 | Work Risk Level | C04 | R14 |
| 241 | Risk-Based Authority | C04 | R15 |
| 242 | Sensitive Path Rules | C04 | R15 |
| 243 | CODEOWNERS Integration | C04 | R15 |
| 244 | Review Routing | C04 | R15 |
| 245 | Specialist Review Only When Needed | C04 | R15 |
| 246 | Specialist Trigger Policy | C04 | R15 |
| 247 | Engineering Standards Agent | C04 | R15 |
| 248 | Future Verification Agent | C04 | R15 |
| 249 | Verification Agent Boundary | C04 | R15 |
| 250 | Readiness Challenge | C04 | R15 |
| 251 | Human Review Still Wins | C04 | R15 |
| 252 | Review-Ready Package | C04 | R15 |
| 253 | “Show Me the Evidence” | C04 | R15 |
| 254 | Evidence UX | C04 | R15 |
| 255 | Raw Logs Remain Available | C04 | R15 |
| 256 | Agent Transcript Is Secondary | C04 | R15 |
| 257 | Explainability Through State | C04 | R15 |
| 258 | Work Search | C04 | R16 |
| 259 | Work History | C04 | R16 |
| 260 | Similar Work Retrieval | C04 | R16 |
| 261 | Prior Result Freshness | C04 | R16 |
| 262 | Knowledge Promotion | C04 | R16 |
| 263 | Knowledge Expiration | C04 | R16 |
| 264 | Contradiction Detection | C04 | R16 |
| 265 | Knowledge Correction | C04 | R16 |
| 266 | Work Feedback | C04 | R16 |
| 267 | Learning Boundary | C04 | R16 |
| 268 | No Self-Modifying Production Policy | C04 | R16 |
| 269 | Workflow Improvement Suggestions | C04 | R16 |
| 270 | Engineering Friction Analytics | C04 | R16 |
| 271 | Avoid Employee Scoring | C04 | R16 |
| 272 | Agent Failure Taxonomy | C04 | R17 |
| 273 | Failure Recovery Playbooks | C04 | R17 |
| 274 | No Infinite Agent Loops | C04 | R17 |
| 275 | Progress Detection | C04 | R17 |
| 276 | Stuck Detection | C04 | R17 |
| 277 | Work Health | C04 | R17 |
| 278 | Estimated Completion | C04 | R17 |
| 279 | Human Deadline | C04 | R17 |
| 280 | Deadline Escalation | C04 | R17 |
| 281 | Work Scheduling | C04 | R17 |
| 282 | Background Work Windows | C04 | R17 |
| 283 | Engineering Daily Brief Improvements | C04 | R17 |
| 284 | Weekly Engineering Agent Report | C04 | R17 |
| 285 | Product Analytics | C04 | R17 |
| 286 | Funnel | C04 | R17 |
| 287 | Retention | C04 | R18 |
| 288 | North-Star Metric Candidate | C04 | R18 |
| 289 | Reliability SLOs | C04 | R18 |
| 290 | Exactly-Once External Effects | C04 | R18 |
| 291 | Idempotency Everywhere | C04 | R18 |
| 292 | Effect Ledger | C04 | R18 |
| 293 | Uncertain Effects | C04 | R18 |
| 294 | Reconciliation | C04 | R18 |
| 295 | External Effect Receipts | C04 | R18 |
| 296 | Work Recovery After Restart | C04 | R18 |
| 297 | Disaster Recovery | C04 | R18 |
| 298 | Event Deduplication | C04 | R18 |
| 299 | Event Ordering | C04 | R18 |
| 300 | Event Provenance | C04 | R18 |
| 301 | Integration Health | C04 | R18 |
| 302 | Credential Health | C04 | R18 |
| 303 | Credential Expiry Before Work | C04 | R18 |
| 304 | Credential Expiry Mid-Work | C04 | R18 |
| 305 | Least Privilege | C04 | R19 |
| 306 | GitHub App | C04 | R19 |
| 307 | Organization Installation | C04 | R19 |
| 308 | Repository Access Removal | C04 | R19 |
| 309 | Data Retention | C04 | R19 |
| 310 | Evidence Retention | C04 | R19 |
| 311 | Model Trace vs Product Evidence | C04 | R19 |
| 312 | Privacy | C04 | R19 |
| 313 | Data Classification | C04 | R19 |
| 314 | Model Data Policy | C04 | R19 |
| 315 | Egress Policy | C04 | R19 |
| 316 | Artifact Scanning | C04 | R19 |
| 317 | Secret Detection | C04 | R19 |
| 318 | Sensitive Data Detection | C04 | R19 |
| 319 | Security Agent vs Security Policy | C04 | R19 |
| 320 | Human Security Override | C04 | R19 |
| 321 | Enterprise Deployment Strategy | C04, C05 | R20 |
| 322 | SaaS Control Plane | C05 | R20 |
| 323 | Customer Execution Plane — Future | C05 | R20 |
| 324 | Control Plane / Execution Plane Trust | C05 | R20 |
| 325 | Agent Runtime Provider Interface | C05 | R20 |
| 326 | Production Isolation | C05 | R20 |
| 327 | Ephemeral Workspace Credentials | C05 | R20 |
| 328 | Environment Templates | C05 | R20 |
| 329 | Template Qualification | C05 | R20 |
| 330 | Template Versioning | C05 | R20 |
| 331 | Workspace Preparation | C05 | R20 |
| 332 | Workspace Health Check | C05 | R20 |
| 333 | Warm Pools — Later | C05 | R20 |
| 334 | Workspace Lifecycle | C05 | R20 |
| 335 | Workspace Evidence | C05 | R20 |
| 336 | Work Rehydration | C05 | R20 |
| 337 | Durable State vs Compute State | C05 | R20 |
| 338 | Work Snapshot | C05 | R21 |
| 339 | Executor Context Package | C05 | R21 |
| 340 | Context Compression | C05 | R21 |
| 341 | Context Integrity | C05 | R21 |
| 342 | Work State Authority | C05 | R21 |
| 343 | Work Event Log | C05 | R21 |
| 344 | Derived Read Model | C05 | R21 |
| 345 | Event Replay — Future | C05 | R21 |
| 346 | Work Correlation ID | C05 | R21 |
| 347 | Distributed Trace | C05 | R21 |
| 348 | Observability | C05 | R21 |
| 349 | Customer-Facing Activity vs Internal Telemetry | C05 | R21 |
| 350 | Operational Console | C05 | R21 |
| 351 | Support Bundle | C05 | R21 |
| 352 | Customer Debug View | C05 | R21 |
| 353 | Failure Transparency | C05 | R21 |
| 354 | Recovery Button | C05 | R21 |
| 355 | Retry Preview | C05 | R22 |
| 356 | Work Clone | C05 | R22 |
| 357 | Alternative Implementations | C05 | R22 |
| 358 | Comparison Result | C05 | R22 |
| 359 | Experiment Mode | C05 | R22 |
| 360 | Work Modes | C05 | R22 |
| 361 | Authority by Stage | C05 | R22 |
| 362 | Just-in-Time Authority | C05 | R22 |
| 363 | Authority Expiration | C05 | R22 |
| 364 | Approval at Boundary | C05 | R22 |
| 365 | Approval Binding | C05 | R22 |
| 366 | Changed Action Requires New Approval | C05 | R22 |
| 367 | Approval Summary | C05 | R22 |
| 368 | Policy vs Approval | C05 | R22 |
| 369 | Repository Permission UX | C05 | R22 |
| 370 | Organization Default Policy | C05 | R22 |
| 371 | Pilot Policy Preset | C05 | R23 |
| 372 | Audit-Friendly Defaults | C05 | R23 |
| 373 | No Hidden Permissions | C05 | R23 |
| 374 | GitHub App Permission Review | C05 | R23 |
| 375 | Repository Selection | C05 | R23 |
| 376 | New Repository | C05 | R23 |
| 377 | Organization Offboarding | C05 | R23 |
| 378 | Team Offboarding | C05 | R23 |
| 379 | Agent Offboarding | C05 | R23 |
| 380 | Agent Replacement | C05 | R23 |
| 381 | Work Reassignment | C05 | R23 |
| 382 | Human Reassignment | C05 | R23 |
| 383 | Work Continuity Beyond Employee | C05 | R23 |
| 384 | Personal Agent Continuity | C05 | R23 |
| 385 | Minimal Roles | C05 | R23 |
| 386 | Team Concept — Minimal | C05 | R23 |
| 387 | Workspace Ownership | C05 | R23 |
| 388 | Corporate Results Sharing | C05 | R23 |
| 389 | Corporate Evidence Visibility | C05 | R23 |
| 390 | Audit Visibility | C05 | R23 |
| 391 | Privacy by Architecture | C05 | R23 |
| 392 | Data Minimization | C05 | R23 |
| 393 | Model Trace Retention | C05 | R23 |
| 394 | Evidence Retention Policy | C05 | R23 |
| 395 | Delete Work | C05 | R23 |
| 396 | Export Work | C05 | R23 |
| 397 | Vendor Lock-In Reduction | C05 | R23 |
| 398 | Open Executor Interface | C05 | R23 |
| 399 | Open Relay Interface | C05 | R23 |
| 400 | Keep Protocols Separate | C05 | R23 |
| 401 | MCP | C05 | R24 |
| 402 | A2A / External Agent Interoperability | C05 | R24 |
| 403 | Relay as Trust Overlay | C05 | R24 |
| 404 | Relay Must Not Become MyEve 2 | C05 | R24 |
| 405 | MyEve Must Not Become Relay 2 | C05 | R24 |
| 406 | Double Authorization | C05 | R24 |
| 407 | Specialist Work Evidence | C05 | R24 |
| 408 | Trust But Verify | C05 | R24 |
| 409 | Cross-Agent Cost | C05 | R24 |
| 410 | Cross-Agent SLA | C05 | R24 |
| 411 | Specialist Failure | C05 | R24 |
| 412 | Specialist Required Gate | C05 | R24 |
| 413 | Published Knowledge vs Work Request | C05 | R24 |
| 414 | Messaging | C05 | R24 |
| 415 | Artifact Exchange | C05 | R24 |
| 416 | Cross-Agent Work Contract | C05 | R24 |
| 417 | Cross-Agent Cancellation | C05 | R24 |
| 418 | Cross-Agent Revocation | C05 | R24 |
| 419 | Cross-Agent Result | C05 | R24 |
| 420 | Human Review of Peer Result | C05 | R24 |
| 421 | Relay Receipts | C05, C06 | R25 |
| 422 | Cross-Agent State Reconciliation | C06 | R25 |
| 423 | Cross-Agent Duplicate Suppression | C06 | R25 |
| 424 | Peer Result Revision | C06 | R25 |
| 425 | Peer Review Revision Binding | C06 | R25 |
| 426 | Cross-Agent Evidence Invalidation | C06 | R25 |
| 427 | Selective Re-Review | C06 | R25 |
| 428 | Review Dependency Graph | C06 | R25 |
| 429 | Work Graph | C06 | R25 |
| 430 | Automatic Parallelism | C06 | R25 |
| 431 | Parallelism Budget | C06 | R25 |
| 432 | Dependency-Aware Scheduling | C06 | R25 |
| 433 | Stale Work Detection | C06 | R25 |
| 434 | Resume Validation | C06 | R25 |
| 435 | Work Expiration | C06 | R25 |
| 436 | Issue Closed Externally | C06 | R25 |
| 437 | PR Closed Externally | C06 | R25 |
| 438 | PR Merged Externally | C06 | R25 |
| 439 | External Source of Truth | C06 | R25 |
| 440 | Human Changes Are First-Class Events | C06 | R25 |
| 441 | Human Override | C06 | R26 |
| 442 | Human Decision Provenance | C06 | R26 |
| 443 | Decision Scope | C06 | R26 |
| 444 | Suggest Policy | C06 | R26 |
| 445 | Organizational Learning | C06 | R26 |
| 446 | Engineering Improvement Backlog | C06 | R26 |
| 447 | Developer Experience Insights | C06 | R26 |
| 448 | Agent Experience Insights | C06 | R26 |
| 449 | Agent-Ready Repository Standard | C06 | R26 |
| 450 | Repository Improvement Suggestions | C06 | R26 |
| 451 | Do Not Auto-Modify Repositories for Agent Readiness | C06 | R26 |
| 452 | Engineering Agent SDK — Later | C06 | R27 |
| 453 | Evidence Provider Interface | C06 | R27 |
| 454 | Gate Provider Interface | C06 | R27 |
| 455 | Policy Provider Interface — Future | C06 | R27 |
| 456 | Secret Manager Integration | C06 | R27 |
| 457 | Identity Provider Integration | C06 | R27 |
| 458 | Minimal Organization Model First | C06 | R27 |
| 459 | Organization Creation | C06 | R27 |
| 460 | Member Invite | C06 | R27 |
| 461 | GitHub Organization Connection | C06 | R27 |
| 462 | Agent Assignment | C06 | R27 |
| 463 | Organization Workspace | C06 | R27 |
| 464 | Personal Workspace | C06 | R27 |
| 465 | Enterprise Pilot Simplification | C06 | R27 |
| 466 | Important Product Decision | C06 | R27 |
| 467 | Recommendation for Pilot | C06 | R27 |
| 468 | Example | C06 | R27 |
| 469 | Later Personal Federation | C06 | R28 |
| 470 | Business Data Boundary | C06 | R28 |
| 471 | Branding | C06 | R28 |
| 472 | Relay Branding | C06 | R28 |
| 473 | Relay Enterprise Later | C06 | R28 |
| 474 | Product Packaging — Initial | C06 | R28 |
| 475 | Pricing Hypothesis | C06 | R28 |
| 476 | Avoid Pure Token Markup | C06 | R28 |
| 477 | Value Metric | C06 | R28 |
| 478 | Design Partner Pricing | C06 | R28 |
| 479 | Buyer ROI Story | C06 | R28 |
| 480 | Security Story | C06 | R28 |
| 481 | Reliability Story | C06 | R28 |
| 482 | Interoperability Story | C06 | R28 |
| 483 | Product Moat — Revised | C06 | R28 |
| 484 | Network Effects — Later | C06 | R28 |
| 485 | Data Advantage — Carefully | C06 | R29 |
| 486 | Customer-Specific Learning | C06 | R29 |
| 487 | Benchmark Corpus | C06 | R29 |
| 488 | Golden Work Cases | C06 | R29 |
| 489 | Release Qualification | C06 | R29 |
| 490 | Shadow Evaluation | C06 | R29 |
| 491 | No Automatic Production Learning | C06 | R29 |
| 492 | Improvement Loop | C06 | R29 |
| 493 | MyEve Dogfooding | C06 | R29 |
| 494 | Relay Dogfooding | C06 | R29 |
| 495 | Internal Golden Workflow | C06 | R29 |
| 496 | Dogfood Failure Review | C06 | R29 |
| 497 | Human Intervention Taxonomy | C06 | R29 |
| 498 | Automate Only Appropriate Intervention | C06 | R29 |
| 499 | Good Human Intervention | C06 | R29 |
| 500 | Bad Human Intervention | C06 | R29 |
| 501 | Product Success Definition | C06 | R29 |
| 502 | Core Differentiation Statement | C06 | R29 |
| 503 | Core Product Principles | C06 | R29 |
| 504 | V1 Feature Priority — P0 | C06 | R30 |
| 505 | V1 Feature Priority — P1 | C06 | R30 |
| 506 | V1 Feature Priority — P2 | C06 | R30 |
| 507 | Explicitly Defer | C06 | R30 |
| 508 | Implementation Philosophy | C06, C07 | R31 |
| 509 | Work as a Product Projection | C07 | R31 |
| 510 | Avoid Parallel State Machines | C07 | R31 |
| 511 | Recommended State Ownership | C07 | R31 |
| 512 | Work State Derivation | C07 | R31 |
| 513 | Work State Override | C07 | R31 |
| 514 | Readiness Explanation | C07 | R31 |
| 515 | Readiness API | C07 | R31 |
| 516 | Readiness UI | C07 | R31 |
| 517 | Work Header | C07 | R31 |
| 518 | Work Page | C07 | R31 |
| 519 | Overview | C07 | R31 |
| 520 | Changes | C07 | R31 |
| 521 | Evidence | C07 | R31 |
| 522 | Activity | C07 | R31 |
| 523 | Decisions | C07 | R31 |
| 524 | Needs You Queue | C07 | R31 |
| 525 | One-Click Decisions | C07 | R31 |
| 526 | Discuss | C07 | R31 |
| 527 | Approval Context Stability | C07 | R32 |
| 528 | Mobile-Ready Web | C07 | R32 |
| 529 | PWA — Consider Later | C07 | R32 |
| 530 | Desktop — Trigger-Based Decision | C07 | R32 |
| 531 | Desktop as Device Gateway | C07 | R32 |
| 532 | Device Presence | C07 | R32 |
| 533 | Local Work Handoff | C07 | R32 |
| 534 | Local Evidence | C07 | R32 |
| 535 | No Local Trust Shortcut | C07 | R32 |
| 536 | Product Notifications | C07 | R32 |
| 537 | Notification Summary | C07 | R32 |
| 538 | Notification Action | C07 | R32 |
| 539 | Daily Brief — P1 | C07 | R32 |
| 540 | Weekly Brief — Buyer Tool | C07 | R32 |
| 541 | Search — P1/P2 | C07 | R32 |
| 542 | Command Palette | C07 | R32 |
| 543 | GitHub Comment Integration | C07 | R32 |
| 544 | GitHub Checks Integration | C07 | R32 |
| 545 | Do Not Replace GitHub Review | C07 | R32 |
| 546 | PR Comment | C07 | R32 |
| 547 | Bot Noise Policy | C07 | R32 |
| 548 | Human-Facing Language | C07 | R32 |
| 549 | Advanced Diagnostics | C07 | R32 |
| 550 | Developer-Friendly Transparency | C07 | R32 |
| 551 | “Show Commands” | C07 | R33 |
| 552 | “Show Environment” | C07 | R33 |
| 553 | “Show Agent Activity” | C07 | R33 |
| 554 | “Download Evidence” | C07 | R33 |
| 555 | Evidence Bundle | C07 | R33 |
| 556 | Signed Evidence — Future | C07 | R33 |
| 557 | Supply Chain Integration — Future | C07 | R33 |
| 558 | Security Scanning — Integrate, Don’t Rebuild | C07 | R33 |
| 559 | Code Review — Integrate, Don’t Rebuild Initially | C07 | R33 |
| 560 | CI — Integrate | C07 | R33 |
| 561 | Issue Tracker — Integrate | C07 | R33 |
| 562 | IDE — Integrate | C07 | R33 |
| 563 | Coding Model — Integrate | C07 | R33 |
| 564 | MyEve’s Product Layer | C07 | R33 |
| 565 | Competitive Defense | C07 | R33 |
| 566 | Competitive Risk | C07 | R33 |
| 567 | Speed Matters | C07 | R33 |
| 568 | Build vs Validate Rule | C07 | R33 |
| 569 | First External Milestone | C07 | R33 |
| 570 | Alpha Exit Criteria | C07 | R33 |
| 571 | Beta Scope | C07 | R34 |
| 572 | Enterprise Preview | C07 | R34 |
| 573 | Avoid Premature Enterprise Theater | C07 | R34 |
| 574 | Security Cannot Be Deferred | C07 | R34 |
| 575 | Product Security Principle | C07 | R34 |
| 576 | Dogfood Before External Alpha | C07 | R34 |
| 577 | Dogfood Metrics | C07 | R34 |
| 578 | Dogfood Challenge | C07 | R34 |
| 579 | Dogfood Overnight | C07 | R34 |
| 580 | Dogfood Failure Injection | C07 | R34 |
| 581 | Dogfood Human Handoff | C07 | R34 |
| 582 | Dogfood Multi-Run | C07 | R34 |
| 583 | Dogfood Relay Later | C07 | R34 |
| 584 | Do Not Measure Agent Count | C07 | R34 |
| 585 | Do Not Measure Autonomy for Its Own Sake | C07 | R34 |
| 586 | Autonomy Ladder | C07 | R34 |
| 587 | Repository-Specific Autonomy | C07 | R34 |
| 588 | Human Can Lower Autonomy | C07 | R34 |
| 589 | Organization Sets Ceiling | C07 | R34 |
| 590 | Autonomy Is Not Trust Score | C07 | R34 |
| 591 | Autonomy Promotion | C07 | R35 |
| 592 | Safe Default | C07 | R35 |
| 593 | Product Education | C07 | R35 |
| 594 | “What Can You Do?” | C07 | R35 |
| 595 | “Why Can’t You?” | C07 | R35 |
| 596 | “What Are You Doing?” | C07 | R35 |
| 597 | “Stop” | C07 | R35 |
| 598 | “Take Over” | C07 | R35 |
| 599 | “Continue” | C07 | R35 |
| 600 | “Try Another Approach” | C07 | R35 |
| 601 | Product Personality | C07 | R35 |
| 602 | Avoid Anthropomorphic Authority | C07 | R35 |
| 603 | Agent Recommendations | C07 | R35 |
| 604 | UI Semantics | C07 | R35 |
| 605 | Result Integrity | C07 | R35 |
| 606 | Accepted Result | C07 | R35 |
| 607 | Rejected Result | C07 | R35 |
| 608 | Evaluation Corpus | C07 | R35 |
| 609 | Offline Evaluation | C07 | R35 |
| 610 | Evaluation Dimensions | C07 | R35 |
| 611 | Evaluation Must Include Supervision Cost | C08 | R36 |
| 612 | Regression Qualification | C08 | R36 |
| 613 | Security Gates Are Non-Negotiable | C08 | R36 |
| 614 | Release Qualification | C08 | R36 |
| 615 | Canary Rollout | C08 | R36 |
| 616 | Per-Organization Version Control | C08 | R36 |
| 617 | Kill Switch | C08 | R36 |
| 618 | Emergency Organization Stop | C08 | R36 |
| 619 | Federation Stop | C08 | R36 |
| 620 | Executor Stop | C08 | R36 |
| 621 | Integration Stop | C08 | R36 |
| 622 | Graceful Degradation | C08 | R36 |
| 623 | No False Completion Under Degradation | C08 | R36 |
| 624 | Service Health Awareness | C08 | R36 |
| 625 | Provider Status | C08 | R36 |
| 626 | Work Admission Control | C08 | R36 |
| 627 | Do Not Accept Impossible Work | C08 | R36 |
| 628 | Capability Disclosure | C08 | R36 |
| 629 | Unsupported Work | C08 | R36 |
| 630 | Scope Expansion Roadmap Driven by Evidence | C08 | R36 |
| 631 | Incident Response Should Remain Separate Initially | C08 | R37 |
| 632 | Research Workflow Can Remain Secondary | C08 | R37 |
| 633 | Daily Brief Depends on Durable Work | C08 | R37 |
| 634 | Universal Inbox Depends on Durable Work | C08 | R37 |
| 635 | Goal OS Relationship | C08 | R37 |
| 636 | Automatic Goal Association | C08 | R37 |
| 637 | Goal Progress | C08 | R37 |
| 638 | No Fake “72% Complete” | C08 | R37 |
| 639 | Decision Intelligence | C08 | R37 |
| 640 | Jev Must Not Determine Authority | C08 | R37 |
| 641 | Jev Must Not Determine Readiness Alone | C08 | R37 |
| 642 | Decision Intelligence Opportunity | C08 | R37 |
| 643 | Issue Readiness Explanation | C08 | R37 |
| 644 | Product Opportunity: Better Engineering Inputs | C08 | R37 |
| 645 | “Prepare for MyEve” | C08 | R37 |
| 646 | Planning Without Execution | C08 | R37 |
| 647 | Investigation Only | C08 | R37 |
| 648 | Graduated Adoption | C08 | R37 |
| 649 | Repository Autonomy Level | C08 | R37 |
| 650 | Autonomy Level Is a UX Abstraction | C08 | R37 |
| 651 | Organization Can Cap Level | C08 | R38 |
| 652 | Repository Can Differ | C08 | R38 |
| 653 | Progressive Trust | C08 | R38 |
| 654 | First-Time Experience | C08 | R38 |
| 655 | Permission Upsell Through Value | C08 | R38 |
| 656 | GitHub Permission Escalation | C08 | R38 |
| 657 | Product-Led Security | C08 | R38 |
| 658 | Sandbox Demonstration | C08 | R38 |
| 659 | Work Security Summary | C08 | R38 |
| 660 | Security Buyer Demo | C08 | R38 |
| 661 | Platform Buyer Demo | C08 | R38 |
| 662 | Engineer Demo | C08 | R38 |
| 663 | Executive Demo | C08 | R38 |
| 664 | Demo Story | C08 | R38 |
| 665 | Relay Demo — Separate | C08 | R38 |
| 666 | Do Not Lead With Relay | C08 | R38 |
| 667 | Do Not Lead With “Multi-Agent” | C08 | R38 |
| 668 | Do Not Lead With “Autonomous” | C08 | R38 |
| 669 | Product Vocabulary | C08 | R38 |
| 670 | Avoid Vocabulary | C08 | R38 |
| 671 | Product Tagline Recommendation | C08 | R38 |
| 672 | Alternative Tagline | C08 | R38 |
| 673 | Enterprise Tagline | C08 | R38 |
| 674 | Relay Tagline | C08 | R38 |
| 675 | North Star | C08 | R38 |
| 676 | Near-Term Mission | C08 | R38 |
| 677 | Recommended Next Artifact | C08 | R39 |
| 678 | Gap Analysis — Repository Inventory | C08 | R39 |
| 679 | Gap Analysis — Golden Workflow | C08 | R39 |
| 680 | Gap Analysis — Work Model | C08 | R39 |
| 681 | Gap Analysis — Existing Goal OS | C08 | R39 |
| 682 | Gap Analysis — Execution | C08 | R39 |
| 683 | Gap Analysis — Evidence | C08 | R39 |
| 684 | Gap Analysis — GitHub | C08 | R39 |
| 685 | Gap Analysis — Organization | C08 | R39 |
| 686 | Gap Analysis — Relay | C08 | R39 |
| 687 | Gap Analysis — UX | C08 | R39 |
| 688 | Gap Analysis — Mobile/Desktop | C08 | R39 |
| 689 | Gap Analysis — Security | C08 | R39 |
| 690 | Gap Analysis — Production Readiness | C08 | R39 |
| 691 | Gap Analysis — Competitive Overlap | C08 | R39 |
| 692 | Gap Analysis — Differentiation | C08 | R39 |
| 693 | Gap Analysis — Implementation Sequence | C08 | R39 |
| 694 | Gap Analysis — Complexity | C08 | R39 |
| 695 | Gap Analysis — Reuse Percentage | C08 | R39 |
| 696 | Gap Analysis — Deletion/De-emphasis | C08 | R39 |
| 697 | Gap Analysis — Pilot Plan | C08 | R39 |
| 698 | Gap Analysis — Risks | C08 | R39 |
| 699 | Gap Analysis — Open Decisions | C08 | R39 |
| 700 | Final Recommendation | C08 | R39 |
| 701 | Final Product Principles | C08 | R39 |
| 702 | Final Instruction to Codex | C08, C09 | R39 |
| 703 | Required Next Deliverable | C09 | R39 |
| 704 | Inspect Before Designing | C09 | R40 |
| 705 | Preserve Qualified Foundations | C09 | R40 |
| 706 | Identify Existing Strengths | C09 | R40 |
| 707 | Identify Product-Layer Problems | C09 | R40 |
| 708 | Identify Unnecessary V1 Features | C09 | R40 |
| 709 | Golden Workflow Analysis | C09 | R40 |
| 710 | Failure Lifecycle Analysis | C09 | R40 |
| 711 | Human Attention Analysis | C09 | R40 |
| 712 | Current Human-Orchestration Burden | C09 | R40 |
| 713 | Competitive Build-vs-Integrate Review | C09 | R40 |
| 714 | Do Not Rebuild Coding Agents | C09 | R40 |
| 715 | Do Not Rebuild GitHub | C09 | R40 |
| 716 | Do Not Rebuild CI | C09 | R40 |
| 717 | Do Not Rebuild Issue Tracking | C09 | R40 |
| 718 | Do Not Rebuild Security Scanners | C09 | R40 |
| 719 | Build the Missing Coordination Layer | C09 | R40 |
| 720 | Work Domain Model Proposal | C09 | R40 |
| 721 | Acceptance Criteria Model Proposal | C09 | R40 |
| 722 | Evidence Model Proposal | C09 | R40 |
| 723 | Readiness Model Proposal | C09 | R40 |
| 724 | GitHub Adapter Proposal | C09 | R40 |
| 725 | Executor Adapter Proposal | C09 | R40 |
| 726 | First Executor Recommendation | C09 | R40 |
| 727 | Engineering Workspace Proposal | C09 | R41 |
| 728 | Organization Boundary Proposal | C09 | R41 |
| 729 | Organization Questions | C09 | R41 |
| 730 | Agent Identity Recommendation | C09 | R41 |
| 731 | Relay Scope Proposal | C09 | R41 |
| 732 | Relay Optionality | C09 | R41 |
| 733 | UI Gap Analysis | C09 | R41 |
| 734 | Home Proposal | C09 | R41 |
| 735 | Work List Proposal | C09 | R41 |
| 736 | Work Detail Proposal | C09 | R41 |
| 737 | Needs You Proposal | C09 | R41 |
| 738 | Result Proposal | C09 | R41 |
| 739 | Settings Proposal | C09 | R41 |
| 740 | Advanced Diagnostics | C09 | R41 |
| 741 | Responsive Web | C09 | R41 |
| 742 | Design System | C09 | R41 |
| 743 | Agent-Native UI | C09 | R41 |
| 744 | Work Deep Links | C09 | R42 |
| 745 | GitHub Deep Links | C09 | R42 |
| 746 | Notifications | C09 | R42 |
| 747 | Daily Brief — After Alpha Core | C09 | R42 |
| 748 | Desktop — Explicitly Deferred | C09 | R42 |
| 749 | Native Mobile — Explicitly Deferred | C09 | R42 |
| 750 | Incident Workflow — Deferred | C09 | R42 |
| 751 | Autonomous Merge — Deferred | C09 | R42 |
| 752 | Deployment — Deferred | C09 | R42 |
| 753 | Broad Agent Network — Deferred | C09 | R42 |
| 754 | Consumer Features — De-emphasized | C09 | R42 |
| 755 | Alpha Security Model | C09 | R42 |
| 756 | Alpha Autonomy Ceiling | C09 | R42 |
| 757 | Alpha Read-Only Mode | C09 | R42 |
| 758 | Alpha Proposed-Patch Mode | C09 | R42 |
| 759 | Alpha Draft-PR Mode | C09 | R42 |
| 760 | Alpha Policy Presets | C09 | R42 |
| 761 | Design Partner Onboarding | C09 | R42 |
| 762 | No Vercel Knowledge Required | C09 | R42 |
| 763 | Hosted Alpha | C09 | R42 |
| 764 | Operator Responsibility | C09 | R42 |
| 765 | Upgrade Responsibility | C09 | R42 |
| 766 | Support Responsibility | C09 | R43 |
| 767 | Alpha Reliability Bar | C09 | R43 |
| 768 | Alpha Security Review | C09 | R43 |
| 769 | Alpha Threat Model | C09 | R43 |
| 770 | Repository Content Is Untrusted | C09 | R43 |
| 771 | Prompt Injection Boundary | C09 | R43 |
| 772 | Tool Output Is Untrusted Data | C09 | R43 |
| 773 | Secret Exfiltration Defense | C09 | R43 |
| 774 | Output Scanning | C09 | R43 |
| 775 | Organization Isolation Tests | C09 | R43 |
| 776 | Repository Isolation Tests | C09 | R43 |
| 777 | Workspace Isolation Tests | C09 | R43 |
| 778 | Executor Isolation Tests | C09 | R43 |
| 779 | Action Authority Tests | C09 | R43 |
| 780 | Evidence Integrity Tests | C09 | R43 |
| 781 | Readiness Integrity Tests | C09 | R43 |
| 782 | Human Override Tests | C09 | R43 |
| 783 | Recovery Integrity Tests | C09 | R43 |
| 784 | GitHub Reconciliation Tests | C09 | R43 |
| 785 | CI Event Tests | C09 | R43 |
| 786 | Review Event Tests | C09 | R43 |
| 787 | Cost Guardrail Tests | C09 | R44 |
| 788 | Work Loop Tests | C09 | R44 |
| 789 | Pilot Observability | C09 | R44 |
| 790 | Pilot Support Tooling | C09 | R44 |
| 791 | Customer-Safe Support | C09 | R44 |
| 792 | Pilot Data Policy | C09 | R44 |
| 793 | Provider Disclosure | C09 | R44 |
| 794 | Customer Model Credentials — Later | C09 | R44 |
| 795 | Pilot Terms | C09 | R44 |
| 796 | External Alpha Exit Decision | C09 | R44 |
| 797 | Expansion Criteria | C09 | R44 |
| 798 | Relay Expansion Criteria | C09 | R44 |
| 799 | Desktop Expansion Criteria | C09 | R44 |
| 800 | Mobile Expansion Criteria | C09 | R44 |
| 801 | Enterprise Governance Expansion Criteria | C09 | R44 |
| 802 | Product Decision Framework | C09, C10 | R45 |
| 803 | Second Decision Question | C10 | R45 |
| 804 | Third Decision Question | C10 | R45 |
| 805 | Fourth Decision Question | C10 | R45 |
| 806 | Fifth Decision Question | C10 | R45 |
| 807 | Human Attention SLO | C10 | R45 |
| 808 | Time-to-Decision | C10 | R45 |
| 809 | Decision Quality | C10 | R45 |
| 810 | Decision Preview | C10 | R45 |
| 811 | “Approve Recommended” | C10 | R45 |
| 812 | Recommendation Does Not Create Authority | C10 | R45 |
| 813 | Owner Feedback on Recommendations | C10 | R45 |
| 814 | Decision History | C10 | R45 |
| 815 | Decision Consistency | C10 | R45 |
| 816 | Repository Decision Records | C10 | R45 |
| 817 | Architecture Decision Integration | C10 | R45 |
| 818 | Code Ownership Context | C10 | R45 |
| 819 | Service Catalog Integration — Later | C10 | R45 |
| 820 | Dependency Graph | C10 | R45 |
| 821 | Change Impact | C10 | R46 |
| 822 | Change Risk Explanation | C10 | R46 |
| 823 | No Arbitrary Risk Scores | C10 | R46 |
| 824 | Work Classification | C10 | R46 |
| 825 | Workflow Template Selection | C10 | R46 |
| 826 | Template Evolution | C10 | R46 |
| 827 | Template Version | C10 | R46 |
| 828 | Skill Version | C10 | R46 |
| 829 | Executor Version | C10 | R46 |
| 830 | Model Configuration Provenance | C10 | R46 |
| 831 | Prompt Provenance | C10 | R46 |
| 832 | Reproducible Agent Behavior | C10 | R46 |
| 833 | Result Reproduction | C10 | R46 |
| 834 | Verification Independence | C10 | R46 |
| 835 | Model Failure Does Not Erase Work | C10 | R46 |
| 836 | Model Switching | C10 | R46 |
| 837 | Executor Switching | C10 | R46 |
| 838 | Model Cost Optimization | C10 | R46 |
| 839 | Cost Breakdown | C10 | R47 |
| 840 | Unknown Cost | C10 | R47 |
| 841 | Budget Reservation | C10 | R47 |
| 842 | Budget Escalation | C10 | R47 |
| 843 | Organization Budget | C10 | R47 |
| 844 | Cost Does Not Override Security | C10 | R47 |
| 845 | Work Quality vs Cost | C10 | R47 |
| 846 | Total Cost of Work | C10 | R47 |
| 847 | Optimize for Total Effort | C10 | R47 |
| 848 | Time Saved Claims | C10 | R48 |
| 849 | ROI Evidence | C10 | R48 |
| 850 | Product Analytics Privacy | C10 | R48 |
| 851 | Telemetry Boundary | C10 | R48 |
| 852 | Organization Analytics | C10 | R48 |
| 853 | User Analytics | C10 | R48 |
| 854 | Team Analytics | C10 | R48 |
| 855 | Failure Heatmap — Later | C10 | R48 |
| 856 | MyEve as DevEx Sensor | C10 | R48 |
| 857 | Agent Experience + Developer Experience | C10 | R48 |
| 858 | Do Not Distract V1 | C10 | R48 |
| 859 | Engineering Manager Experience — Later | C10 | R48 |
| 860 | Manager Delegation | C10 | R48 |
| 861 | Team Agent | C10 | R48 |
| 862 | Service Agent | C10 | R48 |
| 863 | Agent Directory | C10 | R49 |
| 864 | Agent Search | C10 | R49 |
| 865 | Agent Reputation — Avoid Initially | C10 | R49 |
| 866 | Agent Qualification | C10 | R49 |
| 867 | Agent Capability Versions | C10 | R49 |
| 868 | Agent Capability Evidence | C10 | R49 |
| 869 | Cross-Organization Relay — Far Future | C10 | R49 |
| 870 | External Agent Boundary | C10 | R49 |
| 871 | Cross-Organization Data | C10 | R49 |
| 872 | Contractual Work | C10 | R49 |
| 873 | Relay Infrastructure Opportunity | C10 | R49 |
| 874 | MyEve Drives Relay Demand | C10 | R49 |
| 875 | Strategic Sequence | C10 | R49 |
| 876 | Product Risk Register | C10 | R50 |
| 877 | Risk: Weak Differentiation | C10 | R50 |
| 878 | Risk: Incumbents | C10 | R50 |
| 879 | Risk: Supervision | C10 | R50 |
| 880 | Risk: Reliability | C10 | R50 |
| 881 | Risk: Security | C10 | R50 |
| 882 | Risk: Enterprise Ownership | C10 | R50 |
| 883 | Risk: Complexity | C10 | R50 |
| 884 | Risk: Cost | C10 | R50 |
| 885 | Risk: Product Sprawl | C10 | R50 |
| 886 | Risk: Relay Overengineering | C10 | R50 |
| 887 | Risk: Building Before Validation | C10 | R50 |
| 888 | Open Strategic Questions | C10 | R50 |
| 889 | Do Not Answer Market Questions From Architecture | C10 | R50 |
| 890 | Customer Discovery Parallel Track | C10 | R50 |
| 891 | Interview Existing Coding-Agent Users | C10 | R50 |
| 892 | Key Discovery Question | C10 | R51 |
| 893 | Other Discovery Questions | C10 | R51 |
| 894 | Buyer Discovery | C10 | R51 |
| 895 | Security Discovery | C10 | R51 |
| 896 | Platform Discovery | C10 | R51 |
| 897 | Pilot Candidate Selection | C10 | R51 |
| 898 | Design Partner Commitment | C10 | R51 |
| 899 | No Vanity Pilots | C10 | R51 |
| 900 | Pilot Work Must Matter | C10 | R51 |
| 901 | Pilot Review | C10 | R51 |
| 902 | Pilot Backlog | C10 | R51 |
| 903 | Feature Request Filter | C10 | R51 |
| 904 | Customer-Specific Integrations | C10 | R51 |
| 905 | Extensibility | C10 | R51 |
| 906 | Opinionated Alpha | C10 | R51 |
| 907 | Defaults | C10 | R51 |
| 908 | Advanced Configuration Later | C10 | R52 |
| 909 | Nontechnical Administration | C10 | R52 |
| 910 | Self-Service | C10 | R52 |
| 911 | Product-Led Trial | C10 | R52 |
| 912 | Enterprise Sales | C10 | R52 |
| 913 | Security Documentation | C10 | R52 |
| 914 | Trust Portal — Later | C10 | R52 |
| 915 | Product Roadmap Should Remain Evidence-Driven | C10 | R52 |
| 916 | Internal North Star vs Public Roadmap | C10 | R52 |

## Coverage checks

- Exactly 916 distinct IDs: contiguous 1 through 916, no missing or duplicated recommendation IDs.
- Ten current attachment hashes recorded; source continuations retain both part references.
- Every recommendation belongs to exactly one primary routing range; multiple work packages may implement related aspects.
- Earlier vision/Sol inputs recorded separately; application source anchors live in the master plan.
- #916 explicitly incomplete; no completion inferred.
- This is source traceability, not 916 implementation tickets, an acceptance record, or authorization to build the entire catalogue.
