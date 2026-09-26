# Proposed additive conversation budget and read-only recovery

**Status: NOT IMPLEMENTED. Automatic approval review rejected execution before any runtime file or migration changed.** This document is a reviewable proposal, not a migration or executable workaround. Transmission consent is already granted and is not being requested again.

## Why required

At source `fc9d52c9499671759f08fda455e78159067186eb`, selected Work uses the ordinary model before native route admission. The approved manifest requires all admission/recovery calls to be durably bounded. After admission, a different chat session is correctly rejected by the native writer ledger. The live journey cannot currently meet both the whole-conversation spend requirement and fresh-chat observation requirement. Running through an ordinary unmetered model or relaxing writer checks is not acceptable.

## Exact proposed scope

Only authenticated primary-Agent conversations with an explicitly selected Work in the existing isolated dogfood runtime change. Ordinary chat, other owners/Agents, production, provider identities and the approved fixture remain unchanged. Test only the existing Work `fb5a3dd2-e601-404c-8321-81f44ac2973d`, repository `jaydubya818/myeve-golden-work-qual`, exact five-file base `db5d95cf3d1dadf04a118f38bd5b388a5a226c31`, and generated quantity.mjs. No new Work or repository is authorized.

1. Add migration `0051_engineering_conversation_budget.sql` containing two new tables only, applied solely to isolated local test databases. Existing tables/functions/checks are not changed.
   - `engineering_conversation_budget`: owner/scope/Work composite key and FK; frozen authority binding hash, ceiling, deadline and maximum call count; cumulative spent/reserved micro-USD, calls started, in-flight and unknown-usage flags.
   - `engineering_conversation_calls`: same scoped FK plus durable step key, session, exact request hash, model, reservation, usage, state and retained model result.
   - Initialization includes any existing native spend/reservations and fences unknown/in-flight native usage. It cannot reset prior spend.
2. Add `EngineeringConversationBudget` to enforce atomic reserve → settle/unknown transitions. Every selected-Work model call must pass this extra ledger. Bind the current owner, Work version/generation, active Agent revision and trusted runtime configuration. Pin the original deadline and cap at the lower of current Work/Agent limits. Reject concurrency, changed requests, missing usage, over-budget calls and uncertain retry. Retained results replay only for the same scoped session/step/request.
3. Add `engineeringConversationModel` around the selected-Work model path. Reuse the existing bounded-text filter and exact qualified model; no alternate providers, media, or arbitrary tools/options.
   - **Before admission:** advertise only existing native inspect/admit operations. Admission still executes through the existing authored tool, Action Gateway and `admitNativeWork` checks.
   - **Native writer session:** call the unchanged `nativeBudgetedModel` inside the additional budget wrapper. All native reservations, route/Agent/policy checks, session checks and effect guards continue to run.
   - **Different fresh session:** a separate read-only observation model path advertises only existing native inspect. It cannot call the native execution model, acquire/transfer writer custody, admit/open/edit/submit, or invoke other tools. Validate returned tool arguments against that restriction before exposing them to Eve.
4. Update `agent/agent.ts` only for the already-bound selected Work path. No ordinary-chat fallback for this Work is permitted if its new ledger is unavailable or denied.
5. Expose the separate conversation ledger alongside native execution accounting in the shared Work projection/tool/UI. Label total conversation coverage and native execution subtotal distinctly; never add them together as though they were disjoint costs. Immutable PARTIAL evidence and readiness rules are unchanged.
6. Add focused unit/real-PostgreSQL tests and review executor inventory entries. Required cases: pre-admission budget, concurrent reservation, replay, unknown usage, changed Agent/policy/generation, fresh-session read-only observation with attempted write denial, persistent writer identity, crash before/after custody, and exact aggregate ceiling. Run the existing native guard regressions unchanged.

## Boundaries preserved

No edits to `NativeModelBudget` reservation/session checks, `NativeRouteAuthority` admission/effect checks, Action Gateway checks, source-path restrictions, verification authority, immutable Results, or readiness authorization. An observation conversation does not grant execution permission. No native writer lease/session is reassigned. No production migration, external publication, Relay, Factory or deployment.

The current fixture ceiling is $1.30, below the authorized additional $1.313161. The additional ledger covers all selected-Work model calls, including pre-admission and fresh-session observation. Calls must remain within the existing 30-request/2,048-output-token/4-run bounds. Unknown cost stays reserved; no speculative refunds or budget increases.

## Risk and validation

This touches security-sensitive model routing and persistent accounting even though it adds restrictions. A defective implementation could miscount shared spend, expose write tools to an observer, or produce incorrect recovery behavior. Therefore implementation and isolated regression validation must precede live transmission. If any existing guard must be weakened, stop; this proposal does not authorize that.

## Approval requested

Approve implementing exactly this additive design in the local worktree and applying its new tables only to isolated test databases, then testing the existing approved fixture within the unchanged transmission/resource/spend authorization. This is implementation approval, not a request to repeat payload consent.
