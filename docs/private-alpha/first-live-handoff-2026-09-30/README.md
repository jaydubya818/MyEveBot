# First live Sofie handoff failure and repair

The first live journey failed qualification. It is preserved, never rerun, and its unused budget is not reusable. The second live attempt is **NOT AUTHORIZED**. Billing remains non-blocking.

Repair code: `b41b81507bda08da1b299bf7db50086a4ba820e8` on `codex/private-alpha-release`. Publication and native fallback remain disabled. The repaired source is deployed at `5196df982be2b2e55fed996289eb45b70229a158`; see [deployed preparation](deployed-preparation.json) and [source manifest](source-manifest.json).

## First divergence

Work `a2dcadef-0738-4194-8b8c-02c16821b5fb`, revision/generation 2/2, produced one reconciled OpenAI Gateway operation costing $0.000717. Sofie returned one text item containing `{"operation":"start","expectedWorkVersion":2,"expectedWorkGeneration":2}` with OpenAI metadata phase `final_answer`; finish reason was `stop`. The old unit/connected fixtures returned a native `engineering_factory` tool-call item instead. Worse, the connected fixture then called the Factory driver directly, so it did not test the missing queue handoff.

`validAlphaConversationResponse` accepted nonempty text, and `doStream` emitted it as text. No tool executor ran. Therefore Work validation, routing selection, Factory eligibility, command creation, admission, writer acquisition and dispatch were **not reached**, rather than rejected. The 180-second controller guard stopped the waiting consumer; increasing it would not repair this boundary. Before and after observations, the exact sanitized response, accounting and controller event are in [investigation.json](investigation.json).

The preserved workflow trace has one completed `turnStep`, no Factory command, and no Factory writer. The durable Eve conversation remains waiting for input; its running conversation status is not productive execution. The Work row is preserved as active/agent, and its original deadline is expired. The local controller and consumer stopped. Do not resume this Work, reuse its envelope, invoke the old session, or reuse its remaining budget.

## Repair and authority

The model wrapper normalizes only one strict JSON start object matching the currently observed Work version/generation and productive selection into a deterministic canonical tool call. The installed SDK then invokes the ordinary tool. Existing owner/selected-Work/Agent binding, ActionGateway, queue policy, canonical route admission, Gate B/C and Factory writer/dispatch checks remain authoritative. No Work ID or exact response string is special-cased. Original content is retained alongside normalized output in the accounting receipt; historical rows are not rewritten.

Malformed/unsupported/extra-authority objects, stale versions/generations, duplicate calls in one response, foreign tools and provider-executed calls fail closed. Observation cannot become tool execution. A plain-language blocker stays non-executable. Replay produces the same tool ID; database queue deduplication prevents duplicate admission/dispatch. DIRECT/HUMAN backend intent remains authoritative and grants no Factory writer.

## Qualification (zero additional real model operations)

- Captured response regression: failed before repair, passed after; installed SDK generate **and stream** invoke the canonical tool boundary.
- Captured connected fixture: 20 checks PASS, including PostgreSQL queue, duplicate proposal, stale revision/generation denial, admission, single writer, signed custody, protected Docker verification and final synthetic Sofie explanation. The old direct-driver shortcut is removed for this path.
- Installed CLI connected fixture: 17 checks PASS using controlled loopback Responses only.
- Application: 1,942 PASS, 45 environment-gated skips; additional SDK streaming check passes separately. Root regression, migration integrity, typecheck, capability/skill checks, executor governance (UNKNOWN=0), and production webpack build PASS.
- Gate B: 25 PASS. Gate C: 47 PASS. Standalone routing and Current Truth PASS. Source/spend crosswalk PASS. UNKNOWN, cancellation/recovery, completion reserve, operation limits, candidate custody, protected verification, duplicate dispatch and concurrent writer regressions PASS.
- The Current Truth integration fixture initially failed a host-vs-database timestamp ordering assumption. Its fixture Result now uses database time; strict ordering and takeover assertions pass. Production projection code was not changed. Both logs remain retained.

These local candidates, publications, prices and model responses are synthetic fixtures; they are not external publication or real-provider qualification. The first live candidate, Result and Proof of Work never existed. A new live attempt is still required to qualify the full real-provider journey.

## Evidence and reproduction

Protected local evidence is `/private/tmp/alpha-first-live-failure-20260930`. [Hashes](retained-evidence-hashes.json) cover unchanged scoped database records, controller/session receipts and encrypted workflow run/event/step traces. Credentials and private control material are excluded from repository evidence. Historical deployments and database rows were not altered.

Run `npm test --workspace=eve-agent -- --run lib/engineering/alpha-conversation.test.ts`; the test imports the sanitized captured provider structure and never calls a provider. Run the existing `factory-live.integration.mjs` with `FACTORY_SPEND_FIXTURE=1` for captured Sofie coverage; adding `FACTORY_INSTALLED_CLI=1 FACTORY_ENVELOPE_DRY_RUN=1` runs the separate installed-CLI controlled-provider coverage. Both require a disposable loopback PostgreSQL server and the clean qualified MyFactory source. See the retained logs and prior Q37 dossier for Gate B/C commands.

Framework contract was checked against installed `eve@0.66.3` tool/session documentation and the installed AI SDK, not inferred from fixture output.

## Deployed preparation and new authorization boundary

The repaired private-alpha runtime is READY at [the isolated journey deployment](https://sofie-personal-agent-g4vvieciu-jaydubya818.vercel.app), deployment `dpl_J949enNVwma9nndmqD4F4gpchyL9`. It uses production configuration with exact real-execution approval false and empty Work binding. The shared production alias stays on the independent newer Mac-access release. Canonical health and unauthenticated Factory admission denial passed. The installed Factory's authenticated controls, signing/source/repository safeguards, provider OIDC identity, exact-model eligibility, pinned OpenAI route and pricing passed without generation. Positive canonical admission is established by the captured/synthetic connected suite, not by dispatching a live command.

New Work `dd60ac6b-5718-4844-be97-39b88eadf6ce` is **paused at revision/generation 1/1**, with zero model calls, routes, pending commands or writer. Its [fresh envelope](second-work-authorization.json) is 5 operations (2 Sofie, 2 productive Factory, 1 Factory completion), 1 candidate attempt, 600 seconds from first Sofie reservation, $1.35 maximum, and protected completion reserves of $0.336864 Factory plus $0.15 final Sofie explanation. Only `quantity.mjs` may change. Local commit, signed custody, independent protected verification, canonical Result/Proof of Work and final explanation are allowed after explicit authorization. External publication is disabled. No resume, worker start, second model call or budget reuse occurred.

The exact canonical model wrapper was exercised against the new paused Work with approval absent; it denied execution at the owner approval gate before provider/catalog access or reservation. The failed Work's complete scoped database snapshot compared unchanged after new preparation. Its one historical model operation and $0.000717 cost remain intact. Second live execution requires explicit owner authorization for this new Work, followed by one canonical resume and a reread/binding of the resulting revision/generation. Qualification expires `2026-10-02T23:59:59Z`; preflight must remain current at execution time.
