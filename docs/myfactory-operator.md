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

Receipt admission and quiescence are independent. Quiescence is reconciled before processing results, so a cancelled/stale result cannot strand a proven-terminal writer. A current, authenticated Gate C receipt and proven terminal writer allow immutable candidate custody. Producer PASS remains supporting evidence; MyEve's protected Docker verifier checks the exact candidate. Success retains PARTIAL. Failure permits a **new** normally admitted native repair Run, preserving Factory and earlier native candidates/evidence.

Current Truth in Chat and Work exposes the retained preparation/blocker, route Run, request, dispatch, FactoryVersion, WorkOrder, remote execution/attempt, writer state, producer observation/spend, receipt, candidate, verifier, Result and next permitted action. Prepared/starting/running/unknown/stopping/terminal states are producer observations; writer state is separate. A retained terminal Factory Run is historical during native repair.

Use **Reconcile Factory** to resume the saved request. **Stop Factory** holds the writer until resource proof arrives. **Stop and take over** advances to human control only after terminal proof. A request that has not obtained an attempt yet has no productive writer; reconcile preparation before cancellation. Normal recovery requires no direct database edits. Configuration changes are shown as a blocker and cannot redispatch the saved request.

## Local worker configuration

The backend reads absolute `MYEVE_ENGINEERING_CONFIG` and `MYEVE_FACTORY_CONFIG` files. The latter contains `connection` and `commands`; connection pins the loopback origin, backend bearer credential, Factory/source/configuration digests and FactoryVersion, approved local repository path, result keys and owner/profile/time-bounded qualification. Secrets are backend-only. Neither source nor qualification comes from model output.

`node --import tsx apps/eve/scripts/factory-worker.ts` requires `MYEVE_ENGINEERING_MODE=dogfood`, non-production environment and explicit `MYEVE_FACTORY_DATABASE_URL` on owned loopback port 55479 with a `factory_beta_…` database. It polls persisted decisions and automatically reads results, admits receipts, reconciles custody, verifies and retains Results. The connected test restarts this actual separate worker process after response loss; measured manual coordination interventions for that local path are zero.

The pinned producer advertises only LOCAL_FIXTURE execution when backend-injected zero-cost fixtures are used. Otherwise paid dispatch is DISABLED: Codex CLI does not enforce a per-attempt dollar ceiling. A LIVE consumer profile cannot override that producer fact. A live run requires a separately qualified spend-enforcing executor, credential/runtime and a newly pinned FactoryVersion, followed by explicit bounded authorization. No live action is authorized by this document.

## Local versus live status

Connected Gate B/C, routing, operator recovery, protected verification and native repair are LOCAL QUALIFIED. Native live remains EXPERIMENTAL. GitHub/CI/review and Relay/learning composition use synthetic contracts; no real draft PR, Relay peer call or paid Sofie explanation was made. Durable learning drafts exist; promotion/reuse qualification here is advisory contract preparation, not a production promotion service. The [live proposal](verification/2026-09-27-myfactory-beta/LIVE-PROPOSAL.md) is blocked and must not be executed.
