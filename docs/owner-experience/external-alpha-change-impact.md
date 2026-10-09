# External-alpha change impact and adoption boundary

Comparison base: frozen MyEve `8338309582d6806829dec1ae1beef301d6b52425`. Candidate: the exact commit containing this package, independently reviewed and remotely verified in the final qualification report. Accepted A–G checkpoint: `5110293cb7dd7d2af8eea490c783c736fee72ff7`.

## Changed behavior

- One authenticated shell, alpha-aware navigation and owner-facing Today, Sofie, Work, Needs You, Files and Settings.
- Owner-scoped Work/thread/File reads and search, truthful Result/Proof presentation, durable decision history, keyboard controls, responsive layouts and session recovery.
- Work discussion opens a new owner-scoped conversation without sending or dispatching. Initial login lands on Today. Generic pause/resume controls retain CAS and now reject Work with any existing external-alpha authority while holding the Work lock, preventing invalidation of a live or retained authority.
- External-alpha context omits unavailable procedures and the exact known Skills advertisement. Work-bound conversations defer unrelated management schemas. The 32,000-byte admission bound, paid accounting, model/tool allowlists and authority checks remain. Eve is pinned to the reviewed formatter version 0.66.3.
- Missing, stale or changed mandatory Agent policy now blocks dispatch before pricing, and is checked again before provider dispatch. A successful current-turn assembly is required; framework instruction-resolver failure cannot silently remove policy.
- Newly created Work is associated with its conversation only through completed server-retained effects joined to the same owner, Agent, session and thread. This is a read association, not new execution authority.
- First-message run binding creates a missing owner-bound thread before the browser metadata save arrives. Conflict handling preserves existing ownership and executor bindings; no schema change is required.

These changes affect multiple page wrappers and shared components because retaining separate wrappers would preserve the original shell mismatch. H's instruction files change to make optional context conditional; their non-alpha procedure content remains available. Baseline images change for the added Work actions and state-aware copy.

## Unchanged contracts

There are no new migrations against the frozen base. No change is made to Factory protocol, signed authority documents, policy allocations, writer/candidate limits, Result signatures, result ingestion, accounting settlement, publication or executable tester grants. The restrictive generic-control fence is an API behavior change and must not be described as “no controller change.”

Relay, MyFactory and Skillz repositories and installations are unchanged. Existing Factory `sourceDigest` and `FactoryVersion` identify Factory source/configuration; do not regenerate them solely for this MyEve UI update. The new MyEve source SHA requires its own review and installation preflight. Approval of the frozen source does not transfer automatically.

## Known acceptance boundary

The frozen backend retains a verified private candidate as PARTIAL. Its external-alpha operations are start, reconcile, stop and takeover. It has no owner-accept/complete operation. A Needs You answer records continuation eligibility; it does not accept a Result or complete Work. A canonical decision can be exercised before admission. A post-result acceptance task or Completed label would require a separately agreed contract, not a presentation change.

The composed browser run also exposed the existing shared spending fence: after Work dispatch, a follow-up paid chat call is denied while the Work reservation is pending. Scheduled reconciliation can read and retain the Result without another model call. This package does not relax accounting or claim that a generic chat failure is an acceptable final owner experience. A reviewed non-paid acknowledgment/recovery flow is still needed for full journey qualification.

That rejected acknowledgment leaves an unresolved local chat reservation, so a later paid Sofie readback remains blocked even after the Work Result is retained. UI Work/Proof readback succeeds. No reservation was deleted or manually settled to hide this blocker.

The deterministic fixture uses the existing Factory-worker configuration prerequisite with FactoryID absent and the hosted queue disabled. Actual tester configuration has not been inspected or changed and must be validated in a separately authorized preflight.

## Smallest later adoption envelope

This package authorizes no deployment. Once blockers are resolved, request approval for the exact reviewed MyEve commit, named target installation(s), and a configuration-diff-only preflight. Preserve existing owner identities, secrets, Factory pins, limits and grants. Halt on any source/configuration mismatch, missing capability prerequisite or need for a new grant. Do not bundle paid execution, policy activation, publication, tester identity changes or new Factory authority with a UI deployment.

Rollback is redeployment of the previously authorized MyEve source/configuration after checking for in-flight authority. There is no UX migration to reverse and no reason to delete Work, decisions, evidence, allowances or immutable Results. Preserve all durable state. Do not use generic pause/resume to invalidate an external-alpha authority during rollout or rollback.

Production deployment: NOT_RUN. Tester deployment: NOT_RUN. Paid operations, tester mutations, new grants, publication effects and authority expansion: 0.
