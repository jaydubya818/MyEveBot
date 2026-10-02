# Agent-native Work experience: Pluto pattern crosswalk

Baseline: see [exact canonical source pins](../verification/agent-native-work/baseline.json). Screenshot supplied by Jay is the visual reference, not evidence of Pluto backend guarantees. No public-source claims are needed for the visible interaction patterns.

| Pluto pattern | Existing MyEve capability | Adopt | Adapt | Reject | Gap |
| --- | --- | --- | --- | --- | --- |
| Persistent named agents | agents, capabilities, agent_runs, direct conversations | Durable identity | Owner-scoped profile and actual workload | Fake online presence | Work/Result associations in profile |
| Agent navigation and profile | AgentsPanel, searchable chat history | Easy switching | One existing navigation; mobile agent selector | Second full sidebar | Operational agent home |
| Primary conversation canvas | Eve durable chat, canonical Work projection | Inline status and Result | Same canonical owner decision and Proof | Local fixture as runtime | Retained thread-to-Work read model |
| Concise tool activity | Governed tool labels | Progressive disclosure | Current Truth under Proof | Hidden reasoning / raw logs by default | Unify Work progress |
| Recurring checks; last/next | reminders, routine admission, execution routines | Durable responsibility | Retain scheduler and capability fences | Monitoring label while release disabled | Responsible agent, conditions and background qualification |
| Agent groups | Relay identities, scoped requests/replies | Explicit shared objective | Bounded Results, separate Work and authority | Shared capability union; simulated speakers | Durable collaboration context |
| Research and artifacts | web_fetch, canonical artifact workspace | Inline deliverables | Evidence-backed Result | Second storage engine | Coherent conversation presentation |
| Computer | Qualified owner Mac paths | Contextual access | Environment Fabric owns where; agent owns responsibility | Agent equals environment | Cloud NOT_QUALIFIED at baseline |
| Voice and forks | Existing voice and conversation fork | Preserve | Fresh authority each turn; fork copies conversation only | Authority inherited from a fork | New journey regressions |

## Initial capability inventory (source presence is not qualification)

| Capability | Status | Evidence / limitation |
| --- | --- | --- |
| Unified Work Thread | PARTIAL | Canonical projection and publication exist separately; /work-canvas is disconnected preview |
| Persistent Agents | PARTIAL | Canonical CRUD, direct chat, grants and limits; operational home incomplete |
| Routines | PARTIAL | make_routine, routine-review, admission, scheduler; release explicitly disabled |
| Background Routines | NOT_QUALIFIED | ROUTINE_RELEASE.enabled=false; cloud qualification unavailable |
| Agent Groups | NOT_QUALIFIED | Relay federation is not a persistent Group |
| MyEve-to-MyEve | NOT_RUN | Need independent real second deployment |
| External federation | PARTIAL | Existing generic Relay; named peers require actual identity/endpoint/scope |
| Owner Computer | PASS | Inherited scoped Mac evidence in canonical README; not rerun here |
| Cloud execution | NOT_QUALIFIED | Separate Environment Fabric owner; never implement substitute here |
| MyFactory | PASS | Inherited Attempt-8 local Golden Journey; not cloud qualification |
| Owner publication | PARTIAL | Canonical exact-candidate controls; baseline qualification evidence is scoped to documented runs |

## Information architecture before implementation

Keep existing primary navigation and chat history. Add live Work as an inline conversation section, not another page. Existing Agents selection becomes the specialist home: responsibility and current activity first, capabilities next, model/instructions under Advanced. Routines belong inside Today and the responsible agent, with Manage retaining configuration. Do not expose Groups navigation before governed coordination exists. At 390px retain the existing drawer and composer; stack bounded cards with text wrapping and keyboard-accessible disclosure.

## Data reuse and boundaries

* Work associations: read trusted context_assemblies + owner/thread/agent joins; never discover authority from model prose, pasted UUIDs or forked event logs. Historical associations remain observations.
* Work/Result/Proof: EngineeringWorkerProjectionStore / CanonicalBetaWork and OwnerPublication. One decision record, rendered in multiple contexts.
* Agents: existing IDs and capability policy; do not turn a Role template into a fabricated persistent speaker.
* Routines: evolve existing reminders + execution_routines, not a second scheduler. Simple reminders stay simple. Release readiness stays false until qualification gates pass.
* Groups: explicit collaboration scope; Relay owns transport. No private Memory union.
* Environment Fabric, routing, MyFactory producer and custody remain separately owned. No overlapping migrations allocated.

## Evidence discipline

DETERMINISTIC = controlled providers/clock; CONNECTED = real services without asserting paid live execution; LIVE = actual deployed dependencies exercised. PASS always names the tested scope. Unrun safety counters are NOT_RUN, never zero by assumption.

## Product source after checkpoints A–F

These statuses describe the scoped evidence in this source candidate, not deployment readiness. The overall mission remains PARTIAL / NOT_READY.

| Pluto-visible capability | MyEve | Evidence and remaining gap |
| --- | --- | --- |
| Persistent named agents | PASS (persistence/UI) | Fresh durable identities, real owner-scoped configuration/home; natural manage_agent execution remains fenced |
| Agent profile | PASS (product projection) | Purpose, actual Work/Result associations, responsibilities and Advanced settings |
| Agent conversation history | PARTIAL | Bounded owned history with links; full natural specialist continuity canary NOT_RUN |
| Conversation forks | PARTIAL | Existing fork preserved; copied event logs cannot inherit canonical Work association |
| Web research | PARTIAL | Existing governed capabilities reused; no new live research canary |
| Email | PARTIAL | Existing inbox/drafts/approval contracts; natural email → Work → reply LIVE NOT_RUN here |
| Files/workspace | PARTIAL | Existing artifact workspace retained; no new storage engine |
| Computer | PARTIAL | Inherited owner Mac evidence; cloud/Mac-off NOT_QUALIFIED |
| Voice | PARTIAL | Existing source retained; provider voice qualification NOT_RUN here |
| Recurring responsibilities | PARTIAL | Versioned review, condition results/notifications/stop; release disabled and natural creation E2E pending |
| Last/next check | PASS (read projection) | Actual occurrence/reminder records, timezone-aware next schedule, release-aware waiting state |
| Groups | PARTIAL | Shared schema/identity proposal prepared; persistent Group runtime NOT_QUALIFIED |
| Real agent coordination | PARTIAL | Existing Relay request evidence surfaced; Researcher → Engineer → Sofie LIVE NOT_RUN |
| Background execution | PARTIAL | Deterministic lease/recovery/duplicate-key semantics pass; browser/Mac-off LIVE NOT_RUN |
| Unified Work journey | PARTIAL | Inline retained Work/Result/Proof/owner decisions pass; natural request → productive specialist canary pending |
| Owner publication | PARTIAL | Exact canonical contract/UI reused; current landed main records CI PASS and independent review FAIL for historical candidate; no acceptance implied |

Completed scope and tests are recorded in checkpoints A–F under docs/verification/agent-native-work. No unrun safety counter is reported as zero. UI status, productive execution, provider qualification and owner acceptance remain separate claims.
