# Beta product experience audit

Audit date: September 27, 2026. Implementation branch: `codex/beta-product-experience`.

## Baseline and ownership

Fetched origin before choosing a baseline. Fetched `origin/main` was
`d64f2f96003818b2f51341b54a2edd6f426a0dae`; local main was
`a7936898c77d157aa66c222b86aedce07e265e16`. Local main has a distinct Knowledge
commit already represented by merged PR #30, and uncommitted unrelated work.
Remote main includes merged chat reliability, hosted Factory routing, Relay
permissions, and guided beta setup. It is the most appropriate stable baseline.
No active branch was cherry-picked. No other checkout was changed, stashed,
cleaned, reset, or merged. See [initial worktree inventory](worktrees.json) for
all 11 pre-existing worktrees, exact SHAs, dirty paths, and divergence counts.

| Workstream | Observed ownership / boundary |
| --- | --- |
| Digital worker integration | Engineering Work contract, native execution, Current Truth, Factory receipt/writer/projection, routing, verification, engineering dashboard; dirty backend and dashboard files |
| Gap 2 common ledger | Model budget accounting and ledger migrations |
| Gap 2b projection / qualification | Current Truth and cross-process qualification evidence |
| Q37 integration | Native/Factory integration and protected evidence qualification |
| Sofie chat mainline / thread-owner-conflict | Thread ownership and chat recovery; merged equivalents on remote main |
| Hosted MyFactory routing | Factory WorkOrder tools, hosted routing and Relay surfaces; merged equivalents on remote main |
| Knowledge production | Knowledge record browsing; merged equivalent on remote main |
| Canonical checkout | README, computer-runtime/Composio changes, execution inventory, untracked evidence; not used as implementation source |

The unmerged engineering worker projection was inspected read-only. It exposes
richer provider, custody, verification, candidate, and budget fields, but importing
it would require taking an active owner's backend contract. This branch instead
consumes stable Goals, task runs, approvals, outcomes, and reviews. The sample
adapter contains **no** backend authority. No engineering dashboard, verifier,
Factory adapter, routing, migration, Memory, or Relay backend is changed.

Small integration seams in existing files are intentional: root becomes Today;
`/results` renders the richer result surface; `app/chat.tsx` receives shared
navigation and an optional draft prop reusing its existing `startPromptThread`.
The chat change does not replace thread ownership, persistence, routing, or send
logic. These UI hunks must be reconciled when the digital-worker branch lands;
its Work route must consume the presentation through its canonical projection,
not be overwritten by the goal-backed page.

## Existing surface inventory

| Surface | Decision | Reason and treatment |
| --- | --- | --- |
| Home | IMPROVE | Portrait landing page did not summarize work. `/` now opens Today. Introduction retained as progressive `/welcome`. |
| Today | IMPROVE | New aggregate owner view over existing contracts. No new authority or invented summaries. |
| Conversation | KEEP / IMPROVE | Keep durable Eve chat; add visible owner navigation and context-filled draft handoff. |
| Work | IMPROVE | New goal/task presentation; unmerged engineering execution deliberately not integrated. |
| Goals | MERGE | Goals appear as owner Work. Existing `/goals` remains detailed planning. |
| Tasks | MERGE | Linked execution is visible in Work; orphan runs remain visible; task exceptions are retained separately. |
| Memory | KEEP | Existing inspection/correction remains under Knowledge and advanced management; no backend changes. |
| Knowledge | KEEP | Existing source and provenance surface reused as primary navigation. |
| Files | KEEP | Retained secondary link; no new upload/storage authority. |
| Skills | HIDE FROM NORMAL USER | Available through advanced tools; not a prerequisite to first work. |
| Connected Apps | KEEP / IMPROVE | Existing `/manage/connections` becomes the primary Apps destination. |
| Operations / agents / computer | HIDE FROM NORMAL USER | Existing operational controls remain in a collapsed Advanced tools group. |
| Activity | IMPROVE | Result and decision timeline plus per-Work recorded milestones. No fabricated internal events. |
| Results | IMPROVE | Readable status, proof, limitation, feedback and correction flow. |
| Approvals | IMPROVE | First-class Needs you, exact scope, effects, expiry, balanced choices and confirmed-save feedback. |
| Builder | DEFER | Existing provisioning belongs to guided beta setup. No builder workflow changes required for this owner UX. |
| Settings | KEEP | Secondary link; existing appearance, permissions, and management remain available. |
| Mobile navigation | IMPROVE | Five labeled destinations, visible conversation entry, existing focus-trapped drawer retained. |

## Product decisions

The owner manages outcomes and decisions. A draft is saved before conversation
handoff, with a stable idempotency key on retry. The composer receives the Work
reference and criteria; the owner sends it deliberately. No UI calls are made to
start a worker or acquire execution authority.

Use the existing light/dark preference with a restrained sage palette, readable
contrast, explicit timestamps, and 44px primary controls. On narrow Today pages,
Needs you precedes the work lists. Advanced details use native disclosures rather
than a new modal workflow.

Unavailable data is distinct from empty data. Failed resources are excluded from
actionable snapshots; remaining readable resources stay available. Refresh and
visible-tab periodic checks do not start work. Unknown states stay Unknown.
