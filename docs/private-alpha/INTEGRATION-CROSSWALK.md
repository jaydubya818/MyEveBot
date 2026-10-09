# Canonical integration handoff

Status: product source candidate; NOT a release or canonical integration branch.
Q37 boundary: **WAITING_FOR_CANONICAL_Q37**.

Tested source: `ef0771797474216b2275bda349fa2d83ccd45dfe` (pushed and origin verified). This crosswalk was handed to canonical integration chat `01a0e4bf-cdce-7ba1-91c2-6953027cca93` without a merge or deployment request. Do not automatically merge a Q37 or MyFactory successor into this product branch.

## Inputs and merge strategy

- Durable baseline: MyEve `d64f2f96003818b2f51341b54a2edd6f426a0dae`.
- Reused Beta Product Experience source: `105aeb75aeb8b01a3bcba09395f32dc1ac0c7c0d`; its four commits were replayed here and remotely preserved at `cdd7f2cd725eb2b58254a08328c7e34af79ade06`.
- The canonical owner already has that Beta UX. Consume the expansion delta **after cdd7f2c**, not the initial four UX commits again.
- Frozen `7f86aca` and observed local successor `9ef5a95` remain owned by canonical integration. This branch does not replace their canonical Work, Today, Recall, Goal or Inbox composition.

| Product surface | Existing source/API | Integration treatment |
| --- | --- | --- |
| Navigation, ⌘K | owner/navigation; shared command-palette | Keep destinations and keyboard fixes; preserve canonical page bindings |
| Today / Needs You | owner/experience, existing Goal/Task projection | Port human-only attention selection into canonical integrated view; never replace canonical Work with legacy TaskRun data |
| Approval Center | GET approvals?status=pending; PATCH approvals/id with bindingHash | Existing authority unchanged. Canonical Inbox approvals must match exact action binding before joining |
| Inbox | GET channels and email | Operational read view only. Bind canonical Inbox items through the trusted owner-filtered consumer, not inbound message content |
| Search | Goals, Outcomes, owner-knowledge, artifacts, agents, thread search | Presentation aggregation, no new index/schema. Retain API owner scope and current/historical labels |
| Weekly Review | GET reviews?kind=weekly | Existing typed review; replace data provider only if canonical integrated review supersedes it |
| Team / Apps | agents and connections APIs | Existing roster, builder and OAuth manager; no new grants or specialist runtime |
| Computer | existing ComputerWorkspace | UI composition, accessible refresh, unchanged runtime, takeover and session APIs |
| Files | artifacts APIs and mounted ArtifactWorkspace | Existing revisions/comments/shares; uploads no longer require a fabricated conversation id |
| Private/shared | privacy and rooms pages | Private instance truth; do not claim a second login is a second owner; no shared-memory toggle |
| Software Engineer | CanonicalWorkDisplay subset of 7bbf296 EngineeringWorkerProjection | Display-only, no activation. Final owner checks assignment compatibility against final durable source |
| Attention fixtures | CanonicalAttentionDisplay subset of cf19943 AttentionView | NEEDS_ACTION + canonical needsYou + necessary judgment. Preserve correlation and exclude wrong owner |
| Capsules | prepared source 3331721f6335829a52b0b0d7fd8f7deca402d79d verified remote | Prepared source is durable; final activated candidate not accepted here. Preserve boundary |
| Learning | existing knowledge corrections + visible governed-learning boundary | Bind final lifecycle before exposing promote/rollback. Raw feedback grants nothing |

## Protected files and schema

No changes to `apps/eve/agent`, `apps/eve/lib`, migrations, database schema, executor inventory, provider routing, Gate B/C, custody or verification. No migration numbers allocated. New contracts live under product components and have no authority/execution methods.

Shared business membership, shared Goal/Result access and Rooms require the proposal in SCHEMA-PROPOSALS.md. This does not block the independent product source.

## Final canonical acceptance

When the final Q37/MyFactory pair arrives, canonical integration owns source pin validation, actual Work control, routing, verification, provider qualification, migration reconciliation and two-owner live qualification. It should compile the product display interfaces against that pair, rerun exact-action stale/expiry cases, bind authoritative readiness and prove candidate ≠ Result. Product fixture tests cannot satisfy those gates.

No feature-worktree deployment. After integration, use a fresh canonical candidate and its own backup, rollback and smoke dossier.

## Work Canvas presentation follow-up

`apps/eve/components/owner/work-canvas.tsx` and `/work-canvas` are the proposed canonical interaction surface, qualified with disconnected fixtures. Preserve `/work` and canonical ownership until explicit integration. See [WORK-CANVAS.md](WORK-CANVAS.md) for the four journeys and exact-action adapter requirements. The local sample reducer must never become execution orchestration or authorization. Transport, durable state and live verification remain canonical responsibilities.
