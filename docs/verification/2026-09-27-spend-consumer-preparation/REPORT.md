# MyEve spend consumer preparation

Consumer baseline: **39874790aad1280792cc8e1b7aa8a349c31ae54d**, independently reviewed PASS. Current consumer candidate is the commit containing this dossier. **Canonical producer remains d9564beef41590c3700069ec340d926db23b7ba7.** Candidate **8f5e3774129b5f9f4b1c9655ffbbb531cd20fa0f** is supported in an isolated local fixture and **NOT activated or called live-qualified**.

[Exact protocol crosswalk](CROSSWALK.md) and [future integration/configuration/rollback package](HANDOFF.md) separate unchanged dispatch identity from the breaking non-fixture spend readback. The candidate's SQLite v7 checksum was independently verified. No MyEve migration changed or was allocated.

The adapter now accepts the ledger only behind a reviewed source-bound WORK_LEDGER_V1 selector. It checks integer amounts, full operation arithmetic, exact Work/attempt identity, immutable ceiling, settlement provenance, pricing identity, UNKNOWN retention and prior operation continuity. A failed later read retains previous liabilities while marking allowance unavailable and accounting stale. No reader refunds or creates reservations.

Production admission requires source/environment-bound evidence for hard ceiling, pre-call enforcement, accounting, UNKNOWN retention, pricing and required completion behavior, together with current authenticated producer health and complete prepared accounting. No real-price/credential/completion evidence is invented or installed. PLAN/INVESTIGATE and HUMAN remain independent of Factory spend readiness. The final producer's completion payload is not finalized: no completion reserve/state wire fields were invented; qualified/absent completion are fixture evidence cases only.

Execution safety and accounting are separate. Authenticated terminal/quiescent execution can fence its writer while UNKNOWN exposure remains reserved and visible. Another Factory start is denied while any reservation or UNKNOWN exposure is unresolved. Unsafe execution still cannot release its writer. The connected fixture proves a terminal failed execution with 1200 micro-USD UNKNOWN retained across reconstructed-consumer replay, not zero or refunded allowance.

Current Truth presents approved Factory Work ceiling, settled spend, retained and UNKNOWN exposure, remaining unreserved allowance, accounting completeness, pricing/completion qualification and next action. The existing Work UI and Sofie context use the same renderer. An observed allowance never grants execution, payment, candidate, publication or Ready authority.

## Scope and remaining producer gate

All use of 8f5e377 was in a separate temporary checkout and a loopback fake-provider fixture. Canonical d956 compatibility is rerun separately. No owner config or producer worktree was repinned, and no paid/provider credential was used. The candidate's real provider pricing/path/completion/final spend qualification is still pending. The consumer review prerequisites stay fail-closed until that evidence is supplied.

The producer's UNKNOWN ledger retains exposure within its ceiling; consumer admission additionally blocks a new Factory start while UNKNOWN exists. No consumer observation is a permit for an in-flight producer to issue another model call. Real-provider qualification must establish its own per-call retry/UNKNOWN policy and complete Work/completion envelope. These are evidence requirements, not assertions of live readiness.

## Independent local Q37 continuation

Both connected paths rerun the existing strongest local composition: Work-bound synthetic Relay, actual local Factory HTTP/SQLite/Git/signatures, PostgreSQL custody, protected Docker verification, synthetic GitHub publication identity, CI failure continuation, review continuation, stale-evidence invalidation, fresh verification, durable learning drafts and advisory promotion/reuse contracts. Proof of Work retains PARTIAL, never Ready. Production learning promotion remains independently owned and is not imported or reimplemented here. External publication, Relay actions, deployment and paid Factory are NOT_RUN.

**PRODUCER LOCAL SPEND QUALIFICATION: PASS. CONSUMER LOCAL SPEND QUALIFICATION: PASS. REAL PROVIDER QUALIFICATION: PENDING. LIVE MYFACTORY: NOT_RUN.** Release status is superseded by the [real-provider preflight](../2026-09-27-real-provider-preflight/REPORT.md); these local test results are unchanged.

## Final qualification

Canonical producer connected journey **14 PASS**; candidate spend journey **16 PASS**, with four synthetic provider calls (three settlements and one retained UNKNOWN). Application **1569 PASS / 40 environment-gated skips**; root/security **151 PASS**; candidate producer **116 PASS / 1 opt-in CLI skip**; Gate B **23 PASS**; Gate C **47 PASS**. Typecheck, capability checks, governance (**UNKNOWN=0**), 57-migration validation and webpack production build **PASS**. The earlier Turbopack dependency-symlink environment limitation remains unchanged.

One additive Q37 validator inventory entry and five actually changed owned fingerprints; unrelated inventory bytes/classifications changed **0**. Consumer migration bytes changed **0**. Source and retained evidence hashes are included. [Summary](qualification-summary.json), [candidate connected evidence](candidate-connected.json), [canonical compatibility](canonical-connected.json), [lineage](lineage.json), [governance scope](governance-scope.json).
