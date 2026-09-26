# Requirements and invariant evidence

| Requirement | Code / evidence |
| --- | --- |
| Additive persistence | migration 0051; `engineering-conversation.integration.mjs` rollback, upgrade and rerun; native-host full fresh 51 |
| Number availability | local/origin refs and registered worktrees inspected; creation script rechecked refs/current directory immediately before creation; 0051 unclaimed |
| Actual database roles | Isolated app proxy and verifier/tests connect as postgres; SQL current_user confirms postgres. No separate restricted production role exists in this fixture, so no production permission claim. |
| Pre-dispatch and zero-call denial | `conversation-model.test.ts`; reserve → assertDispatch → provider → settle; budget denial and expired qualification |
| Race, duplicate, exhaustion, UNKNOWN | PG conversation suite; exact scoped step/session/request/model replay only; uncertain rows retain reservations |
| Process loss | `conversation-process-fixture.mjs` runs actual model wrapper with real PG and controlled provider; SIGKILL at three custody boundaries |
| Fresh recovery and no writer | Actual authored `engineering_direct.test.ts` inspect; denied observer operations; PG fresh and competing conversations |
| Explicit productive transition | Signed/authenticated current-turn intent from real ownerSession; tool independently checks intent; PG native admission then original NativeModelBudget writer acquisition |
| Existing native usage | PG starts with a completed native call, then outer initialization; cost and count each carried forward once; nested calls counted once in total |
| Stale/policy/Agent fences | PG generation, policy, Agent revision denial; frozen Work/criteria versions in budget hash; final pre-dispatch recheck |
| Expired Run / approval | PG expired routing contract remains expired after observation; Action Gateway expired decision denies, completed exact replay and consumed handle do not re-execute local stub |
| Current Truth and context | Context assembly/projection suites; real authenticated scoped context receipt in SQL; active fact sources only |
| Candidate / verifier / PARTIAL | Unchanged native-host, direct and protected-verifier suites; immutable exact evidence, stale lease fences and false Ready rejection |
| UI | Real authenticated owner session; explicit observe/continue controls; desktop/390px screenshots. Positive model/result UI remains unqualified. |

All process/approval providers in regression tests are local controlled fixtures; no email or external effect is sent. The observed zero counts are test-bound, not certification of unrun live behavior.
