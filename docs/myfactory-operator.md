# MyFactory Work routing and recovery

Canonical consumer: `codex/digital-worker-integration`; exact committed candidate is the commit containing the [current evidence dossier](verification/2026-09-27-myfactory-beta/REPORT.md). Producer: `d9564beef41590c3700069ec340d926db23b7ba7`. This is local dogfood qualification, not live qualification.

## Routing and authority

Substantial bounded code production selects MYFACTORY when deterministic owner/Agent/scope, Work budget/deadline, provider qualification and authenticated availability checks pass. Sofie handles investigation, planning, interpretation and owner interaction. Failure of Factory eligibility returns to human review; it never silently starts native production. Native production remains LIVE EXPERIMENTAL; native repair uses normal admission after the Factory writer is proven terminal.

The model cannot supply connection keys, FactoryVersion, qualification or a writer identity. The selected-Work `engineering_factory` tool uses the existing Action Gateway. Owner Work controls and the unattended local worker use the same driver. One Work generation has at most one productive writer; multiple historical route Runs remain immutable.

## Two-stage binding and migrations

0056 extends the canonical route Run, native session fencing, Gate C receipt and protected verifier. 0057 adds only immutable preparation intent and informational observations to the existing routing decision. Both migrations are registered and immutable; 0001–0055 match the canonical integration baseline byte-for-byte. Checksums and populated rollback/preservation evidence are in the dossier.

Before PREPARE, the current writer-free Work decision retains the request ID, Work/generation, repository/base/scope, deadline and budget, plus the exact reviewed configuration hash (including Factory and FactoryVersion). PREPARE creates a durable producer WorkOrder and actual attempt but performs no execution. Authenticated readback establishes the complete immutable Stage 2 receipt binding. Normal route admission then allocates the canonical route Run, writer generation and dispatch identity **before START**. This ordering reuses 0056's complete-binding admission rule; no placeholder native writer or fictional remote attempt is manufactured. A preparation is intent, not authority. A competing writer acquired during PREPARE prevents subsequent Factory admission and execution.

The qualified wire protocol is `/api/connect/v1/dispatches`: POST collection = PREPARE, POST `/:requestId/dispatch` = START, GET `/:requestId` = READ, POST `/:requestId/stop` = STOP. Grants are `factory.prepare`, `factory.dispatch`, `factory.observe`, `factory.stop`. START binds the full Work/route Run/writer/FactoryVersion/dispatch/WorkOrder/attempt identity. `/executions` from the alternate unselected producer branch is not this protocol.

## Recovery

A durable UNKNOWN dispatch claim precedes HTTP. Lost responses are recovered by exact READ, never blind START retry. If the claim was retained but the remote attempt is still prepared and unbound, the worker cancels that same attempt and requires a durable NOT_DISPATCHED tombstone. UNKNOWN and STOPPING retain the writer. STOP merely requests cancellation; only authenticated terminal resource proof plus the durable delayed-START fence permits release. Signed results, deadlines and an absent process alone are insufficient.

Receipt admission and quiescence are independent. Signed FAILED/CANCELLED results are retained through the same durable Gate C pipeline after fencing; historical receipt status never grants candidate or verification authority. See the [review correction evidence](verification/2026-09-27-factory-terminal-receipts/REPORT.md). Quiescence is reconciled before processing results, so a cancelled/stale result cannot strand a proven-terminal writer. A current, authenticated Gate C receipt and proven terminal writer allow immutable candidate custody. Producer PASS remains supporting evidence; MyEve's protected Docker verifier checks the exact candidate. Success retains PARTIAL. Failure permits a **new** normally admitted native repair Run, preserving Factory and earlier native candidates/evidence.

Current Truth in Chat and Work exposes the retained preparation/blocker, route Run, request, dispatch, FactoryVersion, WorkOrder, remote execution/attempt, writer state, producer observation/spend, receipt, candidate, verifier, Result and next permitted action. Prepared/starting/running/unknown/stopping/terminal states are producer observations; writer state is separate. A retained terminal Factory Run is historical during native repair.

Use **Reconcile Factory** to resume the saved request. **Stop Factory** holds the writer until resource proof arrives. **Stop and take over** advances to human control only after terminal proof. A request that has not obtained an attempt yet has no productive writer; reconcile preparation before cancellation. Normal recovery requires no direct database edits. Configuration changes are shown as a blocker and cannot redispatch the saved request.

## Local worker configuration

The backend reads absolute `MYEVE_ENGINEERING_CONFIG` and `MYEVE_FACTORY_CONFIG` files. The latter contains `connection` and `commands`; connection pins the loopback origin, backend bearer credential, Factory/source/configuration digests and FactoryVersion, approved local repository path, result keys and owner/profile/time-bounded qualification. Secrets are backend-only. Neither source nor qualification comes from model output.

`node --import tsx apps/eve/scripts/factory-worker.ts` requires `MYEVE_ENGINEERING_MODE=dogfood`, non-production environment and explicit `MYEVE_FACTORY_DATABASE_URL` on owned loopback port 55479 with a `factory_beta_…` database. It polls persisted decisions and automatically reads results, admits receipts, reconciles custody, verifies and retains Results. The connected test restarts this actual separate worker process after response loss; measured manual coordination interventions for that local path are zero.

The pinned producer advertises only LOCAL_FIXTURE execution when backend-injected zero-cost fixtures are used. Otherwise paid dispatch is DISABLED: Codex CLI does not enforce a per-attempt dollar ceiling. A LIVE consumer profile cannot override that producer fact. A live run requires a separately qualified spend-enforcing executor, credential/runtime and a newly pinned FactoryVersion, followed by explicit bounded authorization. No live action is authorized by this document.

## Local versus live status

Connected Gate B/C, routing, operator recovery, protected verification and native repair are LOCAL QUALIFIED. Native live remains EXPERIMENTAL. GitHub/CI/review and Relay/learning composition use synthetic contracts; no real draft PR, Relay peer call or paid Sofie explanation was made. Durable learning drafts exist; promotion/reuse qualification here is advisory contract preparation, not a production promotion service. The [live proposal](verification/2026-09-27-myfactory-beta/LIVE-PROPOSAL.md) is blocked and must not be executed.

The [expanded Q37 local composition](verification/2026-09-27-q37-local-composition/REPORT.md) qualifies existing CI/review continuations and fresh protected checks against synthetic publication, plus durable learning drafts and scoped advisory promotion/reuse preparation. This does not enable live publication or a production learning promotion service.

## Latest qualification and live boundary

[Independent review and fresh runtime qualification](verification/2026-09-27-live-readiness/REPORT.md) record PASS for reviewed consumer `21973e5` and the complete local PostgreSQL/Docker rerun. The existing policy now explicitly sends separately qualified bounded operations to DIRECT and unsupported/judgment intents to HUMAN; every productive effect still requires normal admission. An API-key CLI login is configured, but no paid invocation was made. The blocker is a qualified pre-request per-Work spend boundary. Do not enable paid execution by treating login, an account cap or a qualification flag as that proof. The exact synthetic repository, checks and stop/revocation bounds are in the [blocked live proposal](verification/2026-09-27-live-readiness/LIVE-ENVELOPE.md).

## Backend intent selection before Factory preparation

The [production routing correction](verification/2026-09-27-routing-spend-boundary/REPORT.md) supersedes the earlier unit-only routing claim. The server-reviewed `MYEVE_FACTORY_CONFIG` must include `routing: { "intent": "PRODUCE", "boundedOperationQualified": false }` for the exact approved production Work. Use INVESTIGATE or PLAN for a DIRECT proposal; BOUNDED_OPERATION additionally requires its separate backend qualification; APPROVE, JUDGMENT, UNSUPPORTED and absent intent select HUMAN. Model/HTTP inputs cannot supply or override these values. Do not infer intent from untrusted objective text or silently mark an old profile PRODUCE.

Start now returns ROUTED for DIRECT/HUMAN and retains that proposal in Current Truth, before source acquisition or Factory PREPARE. It creates no writer and runs no direct tool. Follow normal action admission for the selected direct operation. A conflicting proposal needs the existing explicit route/revision workflow. For an already prepared Factory attempt, keep the original configuration and use exact-attempt reconciliation/STOP; never rewrite the immutable preparation hash to bypass a configuration mismatch.

DIRECT/HUMAN selection does not require Factory paid qualification or a usable Factory transport. LIVE `spendEnforced: false` blocks PRODUCE before adapter construction or PREPARE. Server configuration syntax and exact Work scope remain validated for every route. The connected fixture covers both unqualified paid mode and an unusable Factory endpoint, without contacting that endpoint.

**MyFactory V2 local spend qualification: PASS.** Consumer and producer `efe9e856` pass the installed-CLI client-search/completion journey, real Docker verification, Gate B/C and local regressions. [Evidence and credential handoff](verification/2026-09-28-spend-v2-integration/REPORT.md). Registered 0056/0057, historical negative evidence and unrelated governance entries remain unchanged. Independent review of consumer `8b55e192` with producer `efe9e856` PASS; dedicated identity and real backend configuration remain prerequisites. **Real provider qualification: PENDING; Live MyFactory: NOT_RUN / NOT READY.**

## V2 spend plan and operator interpretation

The backend connection now pins `spendContract: {version: "WORK_LEDGER_V2", sourceDigest}` and a `spendPlan` containing the pricing revision, productive/completion operation counts, total maximum and protected completion microUSD. These are reviewed configuration, not model/action parameters. PREPARE carries the same immutable plan; a profile/plan change cannot rewrite an existing preparation. No consumer migration or parallel budget was added. V1 readback remains historical and cannot start paid production.

Current Truth shows productive allowance separately from total unused dollars. A remaining dollar balance does not override a used operation slot, missing completion slot or UNKNOWN. `UNSETTLED` means reservations remain; terminal execution does not settle those reservations. Reconcile the retained operation with authoritative usage. STOP, a later generation and elapsed time never refund UNKNOWN. A completed/fenced Factory candidate can be verified in immutable MyEve custody without an active writer; a new native repair still requires normal admission.

The host ends productive execution before opening a separate read-only completion session. Both process groups must be absent before quiescence. Historical results/READ may not revoke current authority, and historical paid operations count against the Work budget but cannot prove a newer attempt performed its mandatory phase. An old request returning a newer Work-ledger binding is rejected by the strict consumer; it is not silently attributed to the old attempt.

The [V2 dossier](verification/2026-09-28-spend-v2-integration/REPORT.md) records corrected producer pins, installed-CLI controlled tests, actual process races and crash recovery. The [credential handoff](verification/2026-09-28-spend-v2-integration/ENVELOPE.md) remains non-executable until dedicated identity/configuration and a bounded live authorization are supplied. Do not turn a passing controlled fixture into a LIVE qualification flag.
