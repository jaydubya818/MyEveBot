# Digital Worker owner UX integration

**READY FOR INTEGRATION — UI/API-contract qualified.** Live design-partner E2E
remains **NOT YET QUALIFIED**. The [source crosswalk](beta-ux-integration-contract.md)
and [integration checklist](beta-ux-integration-checklist.md) define the final
integration handoff for accepted candidate `ed0f6b5dad0e3a131a9f5332139e627245cbd4e8`.

The beta UI lives in `apps/eve/components/owner`. Presentation projections and
sample fixtures are colocated there because they are browser-only. They are not
execution contracts, server authorities, or additions to the executor inventory.

## Stable contracts consumed

| UI | Existing API / model | Boundary |
| --- | --- | --- |
| Today / Work | `GET /api/goals`, `GET /api/task-runs` | Up to the service's returned records; no claim of exhaustive totals |
| Work detail | `GET /api/goals/:id` | Criteria, current plans, task states, milestones, recorded next action |
| First work | `POST /api/goals` | Creates a draft using an idempotency key; never starts execution |
| Needs you | `GET /api/approvals`, `PATCH /api/approvals/:id` | Exact bindingHash, approved/denied, server expiry and stale checks retained |
| Daily Brief | `GET /api/reviews?kind=daily` | Existing period/checkpoint, deterministic recommendations, no new brief generator |
| Results | `GET /api/outcomes`, `PATCH /api/outcomes/:id` | Existing helpful/unhelpful feedback; no backend learning |
| Proof | Task checks/artifacts, outcome evidence references | Artifact downloads use existing owner-checked task artifact routes |
| Conversation | Existing Chat composer / goal tools | Draft carries context; user must send; no auto-execution |

## Presentation states

Goals: draft/paused/waiting → Waiting; active → Working; blocked → Blocked;
completed → Complete; archived/abandoned → Stopped.

Executions: queued → Waiting; running → Working; awaiting_approval/waiting_for_owner
→ Needs you; paused → Waiting; completed → Complete; failed → Recovery;
cancelled → Stopped. Goal task verification → Verifying. Unknown values → Unknown.
A goal's aggregate state is never changed by a historical run. Linked execution
exceptions remain visible separately so a waiting/failed attempt is not hidden
behind an active objective. Progress is the reported task-completion percentage,
not estimated elapsed time or a claim that an agent is running.

## Trust and proof

A completed outcome, owner feedback, recorded passing checks, and independent
verification are separate concepts. The stable task contract does not provide
independent-verifier provenance. Even all required checks passing is described
as **recorded checks passed**, with that limitation. Evidence event references
are shown as references, not invented clickable contents. Task artifacts are
available through their real download endpoint. Reported estimated usage and
configured task limits are not presented as authoritative billing balances.

The live contract does not reliably identify Sofie direct / MyFactory / Relay
execution routes. Do not infer route from a free-text summary, successful status,
or provider name. The sample journey labels an example MyFactory handoff; it
carries no production claim. Exact action cards identify human judgment.

## Integration dependencies owned elsewhere

1. Bind canonical engineering Work projection to this UI after its owner stabilizes
   the contract. Keep generation, current candidate, route and authority checks in
   that backend. Reconcile the `/work` page and small chat UI hunks explicitly.
2. Supply current provider provenance for Sofie direct, MyFactory and Relay.
3. Supply canonical candidate/Result identity and protected verification evidence,
   including stale-candidate invalidation and limitations.
4. Supply structured recovery guidance for uncertain Factory state. The UI must
   not claim a pause, repair, or duplicate-write prevention unless it is observed.
5. Add authoritative scheduled execution times and Memory/Knowledge change
   summaries to the brief through their owners, not client-side invented history.
6. General Work feedback currently goes through conversation; stored ratings use
   the existing Result feedback contract only. Rich category feedback is deferred.
7. Qualify owner-scoped database persistence, real agent continuation, Relay,
   Factory, and protected verifier end to end. Browser fixtures do not prove these.

Activity uses saved Work creation timestamps, recorded execution milestones,
Result records, and retained owner decisions. It does not manufacture investigation,
repair, or verification events.

## Accessibility and resilience

Native links/buttons/forms/disclosures; labeled fields; live error/success states;
skip link and visible focus; wrapping navigation and text; primary controls at
least 44px tall; existing mobile drawer focus handling preserved; light/dark
appearance honored. No new dialogs or focus traps are introduced.

Requests time out, cancel on unmount, refresh on focus and every 30 seconds while
visible, and fail per resource. Unavailable approval reads never become “no
approvals.” Writes lock against repeat clicks and only announce confirmed success.
A failed first-work save retains its form and idempotency key. No automatic
execution retry or mutation is added. Preview mode is explicitly separate and
never a live-data fallback.
