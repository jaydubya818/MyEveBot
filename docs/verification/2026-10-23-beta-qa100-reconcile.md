# Final beta source reconciliation — 23 October

Result: **scoped source qualification passes; production deployment remains held.**

Candidate branch: `codex/beta-qa100-reconcile-20261023`, based on dependency-qualified checkpoint `2ee40f7a0650c77eedfa7d4936a035783a7565f4`. This retains the six feedback fixes in `931487c4db417321c7382285096fd27eaf378558` and the subsequent QA, packaging and dependency work. This branch is explicitly nondeploying. No push, workflow dispatch, deployment or production write was performed by this checkpoint.

## Compatible existing changes adopted

- From PR100 (`2ccf0c7df095daccc160dc27ca7af69f4c892a9a`): Results and Activity account navigation, the Team page label, shared Activity description, and an explicit Deep Agent limitation. Each account link uses the existing server destination gate. Activity was already an allowed read-only page; Memory remains denied. The Deep Agent notice is restricted to locked beta installations. It is informational copy, not a qualification predicate, provider integration or execution grant.
- From PR96 (`9c7e7445a313f4cf806eca594772d820668cca2d`): connected owner stores and encrypted owner environment entries target Production only. The runtime file matches that existing narrow fix. The nonsecret managed-environment marker retains its original plaintext value and Production/Preview/Development targets. Existing installations and previously stored environments are not changed or retroactively remediated by source adoption.
- Per the coordinator's independent source/CI reviews: future qualification checkouts select Factory `c5416e65f786f8f9abf14692a984b5a176271b67` and Relay `ccd32878759bd03a8d6775141769498487496958`. Seven Factory checkouts and the two matching assertions changed; four Relay checkouts and three matching SHA environment references changed. Historical comparison pins, workflow steps, permissions, triggers and holds are retained. These are selected immutable candidates, not a claim about current PR heads or an already passing new exact pair.

No wholesale PR/main merge was performed. Authentication, owner/session recovery, thread/draft/stream guards, stale approval decisions, route-family denials, accounting SQL, reservations and dormant MCP operation code are unchanged by this checkpoint. The changes span navigation/copy, their regressions, the existing Builder restriction, and the matching CI pin references; they do not introduce another runtime service or credential format.

## Qualification evidence

Evidence directory: `/Users/jaywest/Myeve/output/beta-qa100-reconcile-20261023/`.

| Check | Result |
| --- | --- |
| Missing navigation/Team/Deep Agent behavior before changes | Four new regressions failed; `reproduction.log` |
| Builder secret scope before the existing fix | Two mocked request-body regressions failed; `builder96-reproduction.log` |
| Final affected application suites | 111/111 across seven suites; `affected-tests-final.log` |
| Independent focused application run | 109/109 across a different seven-suite command; `independent-affected-tests-final.log`; counts overlap and are not summed |
| Builder provisioning/environment regressions | 12/12, including owner isolation, Production-only secrets and unchanged nonsecret marker; independent API subset 5/5 |
| Existing CI pin contracts | 3/3; independent run also 3/3 |
| Full root typecheck | Four tasks pass; 905 executor sources, UNKNOWN=0; `typecheck-post-builder96.log` |
| Final root production build | Three tasks pass; two uncached, one cached; `build-post-builder96.log` |
| Strict Builder trace | 1594 exact inputs, all three routes pass; helper included with its exact SHA; mandatory verifier unchanged |
| Final built-app browser | Desktop and mobile emulation pass, including canonical Work failure/retry, usage/exhaustion, owner switching, history/draft preservation and hidden primary Agent chip |
| Viewport/session regressions | 5/5: landscape, composer sizing, all five account touch targets, signed-session BFCache preservation and signed-out redirect |

Final build IDs: Eve `jDZupp5kswc8POmxwXLt1`; Builder `VFXjDqXp4AVu7ibNodEnJ`. `build-post-builder96-receipt.json` checks the current Eve ID against the final browser receipt and verifies the new helper in `.builder-template-source.json`. Both local fixture servers were stopped.

The successful Next build still reports the existing dynamic MyApps prototype-asset resolution warning in `lib/myapps/hosting.ts`. That unchanged surface is outside this beta UI qualification; a successful build is not a MyApps hosting qualification.

The browser run uses real production Next/React artifacts, synthetic same-origin resource responses, signed synthetic owners, blocked external requests and zero model/provider calls. It checks the alpha's Results/Activity links and denied Memory, and separately checks the non-alpha navigation's five 44px account targets and absence of the beta-only limitation notice. It is not physical-phone or Wi-Fi-loss evidence.

Two test-fixture failures were retained and corrected without a runtime workaround. An empty Work overview is an attached zero-size container; its test now waits for the canonical read and loading completion rather than racing a visible loading placeholder. The non-alpha navigation test now uses dynamic Today rather than Privacy, which was prerendered with the build's beta gate. Genuine Work503/retry assertions remain.

## Six feedback fixes remain intact

The [original qualification](2026-10-23-beta-feedback-qualification.md) and [independent review](2026-10-23-beta-feedback-review.md) document the refusal-first capability policy, concise/latest-preference instructions, Today canonical Work read, authoritative daily turn/reservation display, separate measured spending and hidden beta Agent chip. Their real PostgreSQL/API accounting and owner-isolation evidence remains applicable; this checkpoint does not change those implementation boundaries. Final built-browser checks exercise the retained UI behavior against the final artifact.

The current prompt reaches the mocked provider with the capability and style rules. No new live model behavior is asserted. Generated refusal/conciseness still needs the bounded authorized post-release smoke within the existing allowance.

## Retained release prerequisites

- Do not deploy this source checkpoint or alter either active tester while testing continues. Preserve owners, sessions, conversations, original windows, fixed ceilings and nonrefundable reservations.
- The reviewed read-only central-accounting `status` addition remains source-only. An authorized rollout must separately install/verify it; unavailable status must never fabricate balances or mutate admission.
- The dependency checkpoint retains six high audit findings in Zod3/TOML and dependents. No incompatible major override or advisory suppression was introduced here.
- The newer hosted Eve/pg bundle remains unqualified because its separate scrubbed build lacked OIDC. The failed hosted output is not a deployable artifact.
- Fresh hosted qualification must use this final MyEve source with the selected immutable peers. Existing financial/private custody, installation, bootstrap, grant and paid-execution holds remain. Updating CI pins does not close them.
- Relay installation preflight, if performed after source freeze, is observational only. Local binding existence does not prove remote enrollment, credential validity or capability grants and cannot authorize activation.

See the [independent checkpoint review](2026-10-23-beta-qa100-reconcile-review.md). The filesystem handoff records the final commit and the separate read-only preflight result; publication and official CI remain with the coordinator.
