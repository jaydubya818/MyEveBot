# External alpha authority foundation

Status: inactive foundation; not qualified for production activation.

This component adds owner-bound model allowances and durable tool-effect admission for two isolated alpha deployments. It does not install a policy, activate a user, issue a Factory grant, provision a connection, or send an invitation. Migration 0085 creates inert schema through the explicit operator migration runner. Existing installations retain their previous schema requirements.

The proposed fixed allocations are:

| Bound | Limit |
| --- | --- |
| Lifetime after explicit activation | 120 hours |
| Chat turns per owner per UTC day | 10 |
| Model calls per chat turn | 2 |
| Reserved allowance per chat turn | $0.10 |
| Work admissions per owner per UTC day | 1 |
| Proposed aggregate model calls per Work | 5 |
| Reserved allowance per Work | $1.30 |
| Proposed Factory portion | 3 calls / $1.00 |
| Per-owner daily / lifetime allocation | $2.30 / $11.50 |
| Two-owner daily / lifetime allocation | $4.60 / $23.00 |

Whole allowances count against admission limits permanently. Unused allowances and ambiguous exposure are not recycled. UTC calendar-day boundaries are shared even if owners activate at different times. The aggregate bound follows from two fixed, non-transferable owner allocations; there is no cross-database borrowing.

A model call reserves exposure durably before dispatch. Uncertain transport or accounting fences later paid operations. A settled replay returns its retained response without a second dispatch. Model selection, provider routing, tools, context size, output size and deadline are constrained by the server. Removal of a tester's policy fails closed.

Mutating tools claim their original owner/session/turn/model proposal before their service begins. The claim and policy revocation lock the same policy row. Revocation before acceptance prevents mutation; an already accepted local effect may finish and record its outcome afterward. This does not allow another model dispatch or confer Factory authority. Unfinished or ambiguous effects cannot be automatically retried. A parked human approval cannot borrow a later turn's allowance.

## Remaining release gates

Do not activate this component until all of the following are independently qualified:

- Ordinary canonical Work binding, budget partitioning and automatic exact Factory authority under this policy.
- Dedicated private workspace source materialization and a protected verifier appropriate to the supported task scope.
- Factory intake, accounting, cancellation, evidence transport, Proof ingestion and cleanup.
- Paid auxiliary paths, route/UI feature allowlists, quota messages and revocation controls.
- Per-tester authentication, existing Relay identity ownership, isolation and production-safe end-to-end readback.
- Explicit owner approval to grant tester access.

The successful synthetic-owner canary is retained evidence for its execution path. It does not qualify this new owner policy or a different workspace verifier.

## Local qualification

Use a disposable localhost PostgreSQL server only. Set `MYEVE_EXTERNAL_ALPHA_TEST_DATABASE` explicitly, then run:

```
npm exec --workspace apps/eve -- vitest run lib/external-alpha
```

The PostgreSQL suite creates and drops randomly named databases. It never reads the application's `DATABASE_URL`. The CI PostgreSQL job runs this suite separately; an ordinary run without the explicit test URL skips the PostgreSQL tests and is not a database qualification pass.
