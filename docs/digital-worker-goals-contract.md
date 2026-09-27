# Digital Worker architecture: Goal orchestration boundary

The Goal layer answers **what outcome, what is eligible, and what happens next**.
Canonical Work answers **how it executes, under what authority, and what Result is true**.

`GoalWorkService` requests Work through `WorkPort.ensure`. No imports from Factory,
protected verification, writer custody, Memory internals, Relay internals or Inbox
internals exist in this module. DIRECT_SOFIE / MYFACTORY / HUMAN routing is canonical
Work's decision. Canonical budgets are constraints, never minted by Goal state.

The Work adapter must:

1. Derive trusted owner/scope and atomically admit the exact current request.
2. Map the stable Goal correlation key to canonical Work idempotency, with durable
   payload conflict detection. A network timeout is an unknown outcome, not absence.
3. Reuse or return existing Work after replay/restart; never send directly to Factory.
4. Read authoritative current Result, criteria bindings and verification. `PARTIAL`
   is not `SUCCEEDED`. Protected verifier output is consumed, never weakened.
5. Normalize canonical terminal cancellation to `state: "cancelled"` for reconciliation.
6. Deliver Result invalidation to an explicit Goal reopen/review path. Automatic
   invalidation propagation is not wired in this candidate.

The Inbox adapter owns action binding, response authentication and durable delivery.
The provided structural event mapper was validated against the sibling Universal Inbox
`myeve.attention.v1` schema on 2026-09-27. It uses the existing `notification` source
category with Goal-task references; no new Inbox persistence is introduced here.

The scheduler adapter persists the bounded dispatcher cursor and retries durable
intents. The event adapter verifies exact provider/file/reply/decision references.
Memory and learning can consume retained Goal events and Result references later;
this change implements neither a memory store nor a learning engine.

## Migration handoff

At baseline origin/main has migration 0040. Active Digital Worker owns 0041–0057
(including an uncommitted 0057 Factory preparation intent) and the shared
`database-schema.ts` head. Therefore the candidate extension is **not** a numbered
migration and cannot be accidentally applied by `db:migrate`. No hosted database or
existing worktree was mutated. Promote it only after the integrated migration lineage
and ownership are settled, then qualify an actual upgrade and route/tool adapter
cutover. Legacy Goal endpoints must not write around the new generation, completion
or attention contracts. Candidate triggers are supplementary fences, not an API cutover.
