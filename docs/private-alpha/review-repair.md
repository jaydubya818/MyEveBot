# Consumer binding for bounded Factory review repair

MyFactory owns the append-only review/repair chain and explicit owner-confirmed repair WorkOrder. MyEve retains its existing canonical Work, profile/base, routing, writer, budget, custody and protected-verification authority. Neither a review nor a Factory proposal can grant these permissions.

The reviewed server `FactoryConnection` may include `repairBinding: { workId, workVersion, workGeneration, workOrderId }`. The owner/host must first establish a fresh canonical consumer Work with the original objective, exact parent candidate base, approved public contract/checks, identical prepared WorkOrder title/criteria/scope, and a bounded execution envelope. Configuration binds its expected resumed revision/generation to the already-approved Factory repair WorkOrder. No model or owner HTTP request can inject this setting.

The ordinary `FactoryWorkDriver.start` checks that exact binding before preparation. The adapter sends `repairWorkOrderId` over the existing authenticated prepare route and rejects a substituted response. Configuration hashing, qualified source/FactoryVersion, spend-plan binding, stale generation, Gate B/C, signed custody and protected verification remain unchanged. The producer independently enforces its owner-approved chain allocation and one candidate attempt. Any mismatch fails closed; there is no alternate dispatch path.

This is an opt-in source capability. No production configuration, reviewed candidate, historical Work, PR, Proof or active runtime was modified. Repair approval creates no paid execution; the consumer Work still requires its normal bounded authorization and fresh preflight. Factory repair limits apply to its productive/completion operations; Sofie or paid review operations require their own existing coordinating Work authorization and cannot borrow Factory's budget.

The existing `connection-reporting.md` instruction was missing from the builder's required file manifest. It is now listed as core so full repository typecheck can pass; its content is unchanged.

Qualification includes the consumer exact-binding/bypass tests, full application regression, typecheck/governance/build, and connected installed-CLI synthetic-provider Golden Journey. Production activation and all live repair operations remain NOT_RUN.

Validated: application 1,995 PASS / 94 optional skips; root 145 PASS / 2 optional skips; typecheck, executor governance and build PASS. Connected installed-CLI/synthetic-provider qualification: 26/26 PASS, with zero additional real model operations.
