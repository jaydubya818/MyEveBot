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
- Checkpoint H recovery adds canonical private Result acceptance through Needs You, with immutable owner decision and exact Result/Proof/candidate/Work/FactoryVersion binding. Accepted private Work can display Completed without changing historical PARTIAL Proof or publication state.
- Sofie adopts only its single server-proven created Work. Returning through Sofie navigation preserves the conversation. Post-dispatch acknowledgment and the exact text-only Result question use canonical retained evidence without a paid operation.
- Model accounting distinguishes PREPARED, DISPATCHED and NOT_DISPATCHED. Only a successful provider dispatch claimant can call the provider. Lost shared acknowledgments are repaired from durable local facts; UNKNOWN remains fenced and reserved.

These changes affect multiple page wrappers and shared components because retaining separate wrappers would preserve the original shell mismatch. H's instruction files change to make optional context conditional; their non-alpha procedure content remains available. Baseline images change for the added Work actions and state-aware copy.

## Unchanged contracts

There are two additive application migrations: 0091 adds model preparation/no-send transitions and updates unresolved-exposure guards; 0092 adds private acceptance to existing owner decisions and a Result binding to existing Work decisions. The separately installed shared-accounting recovery SQL adds no-send tombstones. Accounting transition and reconciliation behavior therefore changes and requires coordinated qualification. No change is made to Factory protocol, signed authority documents, policy allocations, writer/candidate limits, Result signatures, publication or executable tester grants. The restrictive generic-control fence is also an API behavior change.

Relay, MyFactory and Skillz repositories and installations are unchanged. Existing Factory `sourceDigest` and `FactoryVersion` identify Factory source/configuration; do not regenerate them solely for this MyEve UI update. The new MyEve source SHA requires its own review and installation preflight. Approval of the frozen source does not transfer automatically.

## Recovery contract and remaining installation boundary

The owner separately approved private acceptance in Checkpoint H recovery. A verified private candidate's original PARTIAL Proof remains immutable. An exact, authenticated, idempotent owner decision can complete Work after current independent verification, settled known accounting and confirmed cleanup. Invalid evidence, changed candidates, stale Work, revocation and UNKNOWN cannot authorize completion. An authentic answer that became obsolete is terminally marked stale so later decisions can deliver.

The former post-dispatch failure reserved a local operation as DISPATCHED before obtaining its shared lease, even though no provider was called. The recovery records PREPARED first and cancels only authoritative unsent preparations. A no-paid canonical acknowledgment avoids unnecessary post-dispatch paid admission. Scheduled repair retries retained settlement/cancellation facts; readback and cleanup continue safely during a shared repair outage. Legacy DISPATCHED/UNKNOWN operations are not guessed, refunded or erased.

The deterministic journey now asserts one Work, authority, execution, Result and owner acceptance, unchanged historical Proof, zero unresolved operations/publication, and no additional model call for “What did you change?”. It qualifies the composed application contract using synthetic provider/Factory evidence; it does not qualify a new real producer or authorize paid execution.

The deterministic fixture uses the existing Factory-worker configuration prerequisite with FactoryID absent and the hosted queue disabled. Actual tester configuration has not been inspected or changed and must be validated in a separately authorized preflight.

## Smallest later adoption envelope

This package authorizes no deployment. Once blockers are resolved, request approval for the exact reviewed MyEve commit, named target installation(s), and a configuration-diff-only preflight. Preserve existing owner identities, secrets, Factory pins, limits and grants. Halt on any source/configuration mismatch, missing capability prerequisite or need for a new grant. Do not bundle paid execution, policy activation, publication, tester identity changes or new Factory authority with a UI deployment.

Installation preflight must coordinate application migrations 0091/0092 and the separate shared-accounting upgrade, verify existing policy/Factory pins and ensure no in-flight provider claim is interrupted. A rollback must first prove the old application can safely read retained acceptance and new accounting states; otherwise keep admissions disabled and roll forward. Do not downgrade constraints, delete new decisions, rewrite Proof, clear UNKNOWN or refund fixed reservations. Preserve all durable state. Do not use generic pause/resume to invalidate an external-alpha authority during rollout or rollback.

Production deployment: NOT_RUN. Tester deployment: NOT_RUN. Paid operations, tester mutations, new grants, publication effects and authority expansion: 0.
