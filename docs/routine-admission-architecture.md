# Capability-aware Routine admission

MyEve should run the work it can safely perform and clearly explain the work it cannot. Missing unrelated integrations must not disable otherwise safe autonomous work. Each Routine is admitted according to its approved version, its required capabilities, and current dependencies.

## Canonical path

Owner → Routine definition → immutable Routine version and manifest → current authority and availability → admission → occurrence → Run → Agent/Role → ActionRequest → Action Gateway → exact approval when required → one-use execution handle → executor → provider → verification and receipt → saved result → optional delivery.

There is one capability registry, authority system, scheduler, Run model, and approval system. Admission composes their existing boundaries; it does not provide another execution path.

`lib/routine-admission.ts` supplies the same service to scheduled enqueue, worker claims, post-claim preflight, owner readiness APIs, Run Now, and the read-only `get_routine_readiness` Agent tool. Its dependencies are typed interfaces. Application defaults use canonical implementations and the frozen global release switch. Test implementations live in test files, excluded from Builder deployments.

## Version and authority

The approved configuration includes manifest version 1, an exact tool list, required capability IDs, and optional capability/fallback pairs. Required capabilities must equal the approved ceiling. Every listed tool must map to a required capability. Unknown tools/capabilities fail closed. Runtime tool filtering intersects this immutable tool snapshot with the finite qualified Routine graph and current Agent authority.

Only non-consequential owner result delivery may be optional initially. A non-in-app delivery channel must explicitly declare `notification.send` with `in_app_result` fallback. An external send remains required when it is part of the work; it cannot be silently removed to obtain READY.

Existing versions without a manifest require owner review. The migration does not approve or broaden them. The existing review binding includes the manifest, Agent, instructions, schedule, limits, retry, and delivery policy. Reviews compare both reminder and Routine versions; concurrent or stale forms cannot replace a newer ceiling. The UI preserves approved target/account restrictions for retained capabilities.

Skills, Roles, model choice, reasoning level, and harness cannot add tools to an approved version. Current Agent permissions and risk limits can narrow it. Primary and persistent Agents use the same authority/admission interfaces; bounded on-demand work remains behind the canonical Run/Gateway boundary. Unqualified delegation and external Agents cannot use Routines to expand authority.

## Derived readiness

Readiness is recomputed from owner-scoped metadata. Historical admission receipts are evidence, never a cache granting authority.

Precedence is deterministic: DISABLED, AUTO_PAUSED, security/policy BLOCKED, missing dependency NEEDS_CONFIGURATION, missing review NEEDS_APPROVAL, then READY. Within BLOCKED, stale version and malformed manifest precede capability/Agent/profile/qualification/budget/Federation reasons. All blockers remain available for secondary disclosure.

Each capability reports permission separately from availability. `REQUIRE_APPROVAL` on a consequential Action describes exact execution approval; it does not require draft/research work to run again. A reviewed send Routine may prepare work only when its required provider is actually usable. The pending send still requires an exact Action approval.

READY describes technical admission. `canRun` additionally requires the global execution switch. The switch remains false. A false switch is checked on manual/scheduled admission, before claim, after claim, at execution identity resolution, at Gateway execution, and when a one-use handle is consumed.

Budget preflight validates the Routine's approved positive limits against current Agent limits. Canonical Run step, cost and deadline guards remain authoritative during execution and continuation. Post-claim lookup failures become capability-unavailable blocks, not ordinary execution failures. There is no new budget ledger.

## Availability adapters

`lib/routine-availability.ts` is the provider metadata boundary. Routine definitions depend on canonical capabilities, not a provider-specific admission engine. The current adapters are intentionally conservative:

- Local Goals/Knowledge and public web reading use canonical registry configuration and dependency availability.
- Email checks only credential-presence metadata within the deployment owner scope. It never selects secret values, calls provider APIs, or treats a credential/inbox label as authenticated health. AgentMail lacks durable authenticated-account/qualification metadata; configured credentials alone therefore remain account-missing. Composio credentials cannot imply email account readiness.
- In-app delivery is available. Unconfigured Telegram is missing; configured Telegram and Web Push remain unqualified for unattended delivery. Their absence can use the explicit saved-result fallback.
- Browser/Computer checks owner-scoped profile existence, the specific Agent grant, and profile status. Even a ready/granted profile cannot qualify an unsupported Routine executor. Interactive Live Computer qualification is a distinct gate and is unchanged.
- Phone remains unqualified. Opaque connected-app/channel effects remain unqualified. Federation exposes a normalized capability; default-disabled Federation blocks admission, and enabling transport alone would not qualify a Routine executor.
- Unknown provider requirements fail closed. Lookup exceptions expose only safe reason codes/messages.

No credentials, cookies, authorization headers, provider polling, Computer provisioning, model invocation, or external side effects belong in readiness evaluation. Environment credential checks use presence only; legacy owner environment aliases retain existing deployment compatibility, without assuming an owner's personal identity.

Future Gmail/Outlook or alternative Browser/Computer/notification adapters can provide metadata under these interfaces. No provider connection creates authority.

## Occurrences, races, and continuation

Before creating a Run, enqueue evaluates admission. An unmet required dependency creates one `blocked_precheck` occurrence for the scheduled period, with no Run, execution attempt, model call, provider call, or Computer. Its safe receipt records the version and blockers with known zero cost. It does not increment consecutive failures.

The occurrence is inserted before its Run in one atomic SQL statement. Run insertion derives only from the winning occurrence insert. Conflict handling covers both primary and scheduled-period uniqueness. A deferred owner/Run foreign key preserves referential integrity at statement/transaction completion and avoids orphan Runs when READY and blocked ticks race.

Claims recheck current admission and version for a bounded candidate set, then claim only members of that checked set. Existing compare-and-swap leases, heartbeat, retry/backoff, stale-worker fencing and Action recovery remain in place. A dependency loss after enqueue may leave a paused existing Run; this is distinguished from the initial zero-Run receipt. The original admission is preserved, and a separate `preflight` receipt records the later decision.

Reconnect never replays a terminal blocked period. Only a new scheduled period or an explicit admitted Run Now can enqueue new work. Approved pending-send continuation remains on its original occurrence/Run: saved research, analysis and draft are reused, and only the pending Action resumes. Connection/authority changes may pause this continuation; they do not make its exact approval reusable for changed content or recipients.

Completed work and optional delivery remain separate. Unavailable delivery becomes the existing outbox `skipped` state with `delivery_unavailable`, retaining the result and avoiding repeated delivery attempts. Actual failed/unknown sends keep the qualified recovery semantics.

## Owner surfaces and retention

Manage / Routines owns configuration, six readiness states, capability details, budgets, schedule, last blocked receipt, review, and server-validated Run Now. Control Center shows exceptions and blocked-period explanations. Readiness endpoints and the Agent tool use authenticated owner identity; no requested owner ID can substitute for it. Cross-owner readiness is not found. There is no readiness write/approval API for federated callers.

Operations records a low-cardinality aggregate preflight-block count. Owner export includes definitions, immutable version configuration/review bindings, and original/latest admission receipts. Restoring authority is deferred to explicit review.

Never-executed blocked occurrences expire after 90 days through the existing scheduler tick. Run/Action-bearing records keep existing retention semantics. The scheduler remains bounded and does not poll providers.

## Migration and rollout

The inspected next migration is `0029_routine_admission.sql`; 0027 Federation and 0028 pending-send reconciliation are unchanged. It adds two nullable JSON receipt columns, allows a null Run only for blocked prechecks, extends the occurrence status constraint, and changes the existing owner/Run foreign key to initially deferred. There is no authority backfill.

Only isolated PostgreSQL was migrated. Shared rollout requires a separately authorized maintenance/release plan, lock-budget assessment for the ALTER statements, and application deployment compatible with the new status/nullability. Apply the canonical migration before any later controlled activation. Keep execution disabled throughout rollout.

Rollback is not merely dropping columns: old code assumes non-null Runs and does not understand `blocked_precheck`. Preserve/export evidence and explicitly reconcile new rows before restoring old constraints. No destructive rollback script is supplied.

## Security boundaries

Capability-aware admission determines whether a Routine may begin based on its approved capability ceiling and current dependencies. It is not an authorization bypass. Every consequential Action remains subject to Action Gateway enforcement at execution time.

Provider availability never grants authority. A connected account only makes a capability technically available; owner, Agent, Routine, target, approval, and Action Gateway policy remain authoritative.

Browser and Computer execution cannot be used to circumvent a capability denied at the semantic action layer. Consequential browser effects remain governed by the same Action Gateway policy as equivalent API actions.

Federation grants permission to communicate, retrieve explicitly shared information, or request bounded work. Federation never grants unrestricted access to the owner's local capabilities. Consequential federated work must also pass local MyEve authorization.

A Routine version's approved capability ceiling is immutable. Changes to Skills, Roles, tool availability, or provider connections may narrow runtime capability but may not silently broaden a previously approved Routine.

Routine definition ≠ authority; authority ≠ availability; availability ≠ authentication; authentication ≠ Agent permission; admission ≠ Action authorization; Action authorization ≠ Computer control; execution ≠ verification; result ≠ delivery; Federation grant ≠ local authority; Published Knowledge ≠ Private Knowledge.
