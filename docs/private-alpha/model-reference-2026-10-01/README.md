# Canonical model reference and Attempt-3 qualification gap

Attempt 3 remains failed historical evidence. Work `7e4b305b-72e5-40f7-95e1-150456b84c66` is never reused. Sofie, canonical proposal, admission, PREPARE and one START/writer succeeded. The executor rejected `openai/gpt-5.4-mini` before process launch. One Sofie operation cost $0.000975; Factory operations were zero. Its raw evidence remains protected locally; [sanitized outcome](attempt-3.json).

## Root cause and contract

The executor accepted only a simple unnamespaced identifier while producer snapshot and spend validators already accepted a slash. Connected Factory fixtures used `gpt-5.5`, so model eligibility and Sofie checks did not exercise the exact executor input.

`packages/contracts/src/model-reference.ts` now defines the shared contract: one opaque model component or one provider/model pair, at most 120 ASCII characters, each component beginning alphanumeric and continuing with alphanumeric, dot, underscore or hyphen. Empty components, extra separators, repeated dots/traversal, URL/scheme syntax, whitespace/control characters, shell syntax and oversized input fail closed. No trimming, splitting for routing, prefix stripping, substitution or fallback occurs. Legacy unqualified references remain valid syntax. Syntax acceptance does not qualify a model or authorize execution.

The executor, producer snapshot, spend price, ledger plan and signed-result verifier use this contract. The executor passes the unchanged model as one `spawn` argument without a shell. Exact configured model equality, scoped OIDC, pricing, Work identity, limits, reserve and UNKNOWN fencing remain independent mandatory gates.

## Identity audit

| Boundary | Source of truth and preservation |
| --- | --- |
| MyEve selected Work / Sofie | Private-alpha qualification pins `openai/gpt-5.4-mini`; model proposals cannot select or expand it. |
| Route / Factory request | Backend-reviewed connection pins FactoryVersion and pricing review. Work input does not grant a model override. |
| FactoryVersion / PREPARE | Source digest and execution configuration digest bind the exact configured model; capture uses the shared grammar. |
| START / executor | The immutable prepared snapshot supplies the model; executor accepts it unchanged as one `-m` argument. |
| Harness / bounded gateway | Isolated child uses only the local spend gateway; exact `payload.model === price.model` is required before reserve/forwarding. |
| OIDC / AI Gateway | OIDC provider requires the exact `openai/gpt-5.4-mini` constant and OpenAI-only route; no fallback or provider-prefix removal. |
| Accounting / signed evidence | Ledger plan and operation compare exact model identity; signed snapshot includes it in configurationDigest and FactoryVersion. |

The MyEve native Claude validator belongs to a separate disabled route and is unchanged. The historical Keychain provider's literal legacy model pin is unchanged and is not used by this private-alpha Gateway path.

## Regression and qualification

The exact Attempt-3 adapter regression failed twice before repair with the original message. After repair it starts a synthetic executable that requires the unchanged namespaced argument. Invalid-model cases must fail before any process starts.

Connected qualification now defaults Factory configuration, pricing and synthetic/installed harness requests to the production namespaced model. The installed controlled-boundary mode follows captured Sofie proposal → canonical queue → route admission → PREPARE → START → installed executor → loopback upstream `/v1/responses`. It checks the exact model, sends no request to a real provider and terminates without generation; synthetic transport uncertainty remains fenced. Separate controlled success tests cover candidate custody and independent Docker verification.

All test providers and publication adapters are local fixtures. Their simulated receipts and counters are not live model usage or publication. A successful controlled boundary does not prove a future real generation or candidate.


Qualification passed: MyFactory 154 tests plus one gated skip; typecheck, producer typecheck, governance (15 reviewed sources, UNKNOWN=0) and build. MyEve 1,990 tests plus 53 gated skips; captured connected 23 checks; installed-CLI exact-model boundary 22 checks; root regressions, 73 ordered migrations, typecheck, governance and build. All additional real model operations: zero.

Diagnostics retained locally: the initial Factory full suite needed loopback permissions; the first boundary assertion used `/responses` instead of the actual `/v1/responses` and was corrected only in the test; an unrelated native-repair admission fixture returned `routing_changed` once under concurrent qualification and passed on isolated rerun without weakening checks. No production admission or timeout change was made.

MyFactory repair SHA: `cb2a06f89a8ee39d73d0c8e67cd98617dd18e9e1`. MyEve changes are connected-test coverage and this evidence only. Canonical main was fetched before integration; existing lifecycle/Computer/federation content is preserved. Isolated hosted source remains the qualified `f29cb42676b13612d5566c7dc974a2552877f3f9`; no unrelated production activation is implied. Deployment and new paused Work receipts are recorded below.


## Deployed preparation and fresh authorization boundary

The repaired installed Factory is exact `cb2a06f89a8ee39d73d0c8e67cd98617dd18e9e1`. Its [post-installation controlled boundary](deployed-installed-boundary.json) passes 22 checks with the same source digest and FactoryVersion as the qualified candidate. The exact `openai/gpt-5.4-mini` reaches `/v1/responses` once for the captured-Sofie boundary scenario, without forwarding to a real provider or generating output. Synthetic UNKNOWN is retained/fenced, not retried. Separate controlled completion tests pass custody and independent verification.

The isolated hosted deployment [dpl_FRqrGYeRrYRq5ucPoPdNnspVStXp](https://sofie-personal-agent-n04imwv18-jaydubya818.vercel.app) is READY on existing qualified MyEve source `f29cb42676b13612d5566c7dc974a2552877f3f9`, with real execution approval false and no approved Work binding. [Hosted health/access-denial](fourth-http-preflight.json), [authenticated Factory health](fourth-runtime-health.json), [source/version and unchanged limits](fourth-runtime-evidence.json), and [OIDC model eligibility](fourth-provider-preflight.json) pass. The shared production alias is untouched. Concurrent Computer/federation code is preserved in canonical Git; no unrelated activation or task lifecycle implementation was changed here.

[Attempt 1](fourth-attempt1-preservation.json), [Attempt 2](fourth-attempt2-preservation.json), [Attempt 3](fourth-attempt3-preservation.json) and [Factory Attempt-3 records](fourth-factory-preservation.json) compare unchanged to their protected historical snapshots. No old Work, envelope, budget, candidate attempt or dispatch is reused.

New [Work](fourth-work.json): **`8a2979a8-6520-4d5e-bae7-7016a221ce04`**, paused, revision/generation **1/1**, with zero Sofie/Factory operations, route runs and pending commands. Exact first-model approval gate: DENIED as required. No consumer started and no new live execution authority granted.

Fresh envelope, pending explicit owner authorization:

- Objective: implement positive-integer stdin validation in `quantity.mjs` and independently verify it; repository `jaydubya818/myeve-golden-work-qual`, approved base `db5d95cf3d1dadf04a118f38bd5b388a5a226c31`.
- Exact model `openai/gpt-5.4-mini`; project-scoped Vercel OIDC → AI Gateway → OpenAI only, no fallback.
- At most 5 operations (2 Sofie, 2 productive Factory, 1 Factory completion), 1 candidate attempt, 600 seconds from first Sofie reservation.
- Total enforced ceiling $1.35: $0.30 Sofie and $1.05 Factory. Protected reserves: $0.336864 Factory completion and $0.15 final Sofie explanation.
- Allowed effects: one canonical resume, modification of `quantity.mjs` only, local candidate commit, signed custody, protected independent verification, canonical Result, Proof of Work and final explanation.
- External publication remains disabled. No candidate push, PR, merge, deployment or sharing. UNKNOWN/stop conditions fail closed without expanding the envelope or retrying.

**READY FOR FOURTH LIVE ATTEMPT: YES — awaiting explicit authorization.** All additional real model operations during repair/preparation: **0**. Qualification expires `2026-10-02T23:59:59Z`; current preflight must still pass at admission. Successful controlled tests do not prove future real generation or candidate success.
