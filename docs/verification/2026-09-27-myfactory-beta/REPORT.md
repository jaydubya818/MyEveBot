# Canonical connected MyFactory consumer qualification

**LOCAL PASS; LIVE NOT READY / NOT_RUN.** Consumer branch `codex/digital-worker-integration`, preserved implementation baseline `be090db93b35c8edb9f38a3cac1344a2289c49bc`; the canonical candidate SHA is the commit containing this report (`git log -1 --format=%H -- docs/verification/2026-09-27-myfactory-beta/REPORT.md`). Producer is pinned at **d9564beef41590c3700069ec340d926db23b7ba7**, clean. This evidence grants no merge, deployment, paid execution or live publication authority.

Supersedes: the adapter/integration status in the earlier [Gate B report](../2026-09-27-gate-b/REPORT.md), [Gate C report](../2026-09-27-q37-integration/myfactory/gate-c/REPORT.md), and [durable Gate C report](../2026-09-27-q37-integration/myfactory/gate-c/durable/REPORT.md). Their original artifact bytes and historical qualifications remain intact; sibling Superseded-by markers identify this successor. The alternate producer `/executions` branch and reviewer draft were not imported. The user's producer selection and sole ownership are resolved in [ownership-resolution.json](ownership-resolution.json).

## Implementation and lineage

[Routing and operator architecture](../../myfactory-operator.md) describes exact wire operations, two-stage preparation/binding, Current Truth, custody, verifier and recovery. The existing canonical route Run/session fencing, receipt and native repair architecture is retained. No parallel writer or verification store was created.

- 0056 **PASS**, SHA256 `dc4a908d6f3abd665824cb249459df850a92ff7c4346fded461a2061ba72b2bc`.
- 0057 **PASS**, SHA256 `787b26a37700c890d0cee38ab47bb2b5e51c24cd70a28568f98d7d009072f057`.
- Applied migration bytes changed: **0**. 0001–0055 exactly match `7bf276493eb2b3206a50eea0c4c9c262b7396014`. See [lineage](migration-lineage.json), [immediate 0057 ownership check](0057-ownership.json), and [populated checkpoint upgrade](history.json). The retained checkpoint is read-only; only a disposable copy was restored.
- Governance **PASS**, UNKNOWN **0**, unrelated existing entries changed **0**, existing classifications changed **0**. See [byte-preservation scope](governance-scope.json). Only owned changed fingerprints and new owned entries were registered.

## Local qualification

| Gate | Result and evidence |
| --- | --- |
| Connected PREPARE / START / READ / STOP | PASS, [11 connected checks](connected.json): real producer HTTP, SQLite, Git and signatures; PostgreSQL consumer; synthetic zero-cost executor; real protected Docker verification |
| Two-stage Gate C | PASS; complete immutable actual producer attempt precedes canonical admission and START; no result is admitted from preparation intent alone |
| Gate C | PASS, [47 checks](gate-c.log), replay/conflict/late result, authentication, restricted roles and process loss |
| Gate B / single writer | PASS, [23 checks](gate-b.json), native/Factory races, seven race pairs, eight SIGKILL handoff boundaries, UNKNOWN/STOPPING, takeover and stale fences |
| Exactly-once / lost response | PASS; actual separate restarted worker completes without resending uncertain dispatch; before-HTTP loss seals NOT_DISPATCHED |
| STOP / quiescence | PASS; connected held executor remains STOPPING; writer cannot advance until actual settle; delayed START has no effect |
| Candidate custody / independent verification | PASS; Factory claims PASS on an intentionally bad candidate; MyEve independently retains FAIL. Authentic custody survives restart and succession |
| Factory → native repair | PASS; normal new native Run, failed repair remains FAILED, bounded next candidate independently PASS, prior Factory custody/evidence unchanged |
| Routing / Current Truth / operator | PASS local; deterministic eligibility, exact request/dispatch/attempt, pending-preparation errors, independent producer/writer states and owner recovery controls |
| M1 regression | PASS, [native completion](m1.log), controlled model outputs, real Docker checks, budget and fresh explanation cases |
| PostgreSQL regressions | PASS, [five script outcomes](sql.json) plus populated 0055→0056→0057, failure rollback and rerun |
| Application regression | PASS, [1554 passed / 40 gated skips](app.log), 178 files passed / 3 skipped |
| Root regression | PASS, [151 tests](root.log) |
| Producer regression | PASS, [101 tests](producer.log), including 6 connected lifecycle tests |
| Migration validation | PASS, [57 registered ordered migrations](migrations.log) |
| Typecheck / governance | PASS, [canonical check](typecheck.log), 658 classified sources, UNKNOWN=0 |
| Work UI | PASS, [browser fixture](browser.json), terminal stop disabled, reconcile, zero mobile overflow; screenshots retained |
| Production webpack build | PASS, [build log](webpack.log) |

The final connected STOP test found and fixed a real defect: stale cancelled result admission could block terminal reconciliation. The driver now reconciles authenticated resource proof first; receipt acceptance never substitutes for quiescence. The full connected and application qualifications were rerun after this fix and final Current Truth changes.

The earlier default Turbopack build fails on existing dependency symlinks in this environment. This remains an environment/tooling limitation; dependency layout was not changed. The required webpack production build passed. The 40 application skips are environment-gated owner/Relay/remember integration cases, not counted as passes. Paid fresh Sofie narration was NOT_RUN; connected Current Truth reconstruction and M1 controlled-model fresh explanation are separate evidence.

## Safety and scope of claims

Observed assertion violations are **0** for concurrent writers, duplicate Factory dispatches/executions, result admission without complete Stage 2, silently accepted conflicting binding, post-fence starts, false quiescence, stale writer mutations, lost candidates/custody, Factory-granted authority, unauthenticated admissions and false Ready. These are bounded local test outcomes, not production telemetry. Connected execution count is four logical fixture attempts (success, failed candidate, lost response, cancellation); none was duplicated. Gate B/C counter records and connected negative assertions provide the supporting evidence.

Manual coordination debt was **0 in the measured restarted-worker path**: no human polling, copying results, releasing writers or initiating verification. A model-generated end-to-end paid Sofie conversation is not claimed. The Work remains PARTIAL because publication, CI, review and owner acceptance are separate gates.

## Independent Q37 local composition

The same Work-bound connected fixture carries synthetic advisory Relay findings into Factory production, exact Gate C custody/protected verification, trusted publisher contract, CI/review blockers, Result and scoped advisory learning. GitHub uses an in-memory transport and reconstructs the Factory raw commit exactly; no real PR exists. Learning promotion/reuse is pure contract qualification; durable drafts exist, but the authenticated production promotion service is not implemented. Follow-on local evidence records the strongest available composition without pretending those live or production integration gates passed.

## Review and live boundary

Independent reviewer is read-only and receives the committed candidate SHA, migration checksums, this dossier and matrix. Independent review is **PENDING**, not self-certified by the implementation owner.

Live MyFactory is **NOT READY / NOT_RUN**. The producer disables paid dispatch because its Codex CLI executor cannot enforce the required dollar ceiling. A credential/runtime and spend-enforcing executor must be qualified and its actual FactoryVersion pinned before a live envelope can be authorized. [Prepared live proposal](LIVE-PROPOSAL.md) records the bounds and unresolved pins; it is not an executable authorization. No live GitHub publication, tester Relay action, paid Factory execution, main merge or deployment occurred.
