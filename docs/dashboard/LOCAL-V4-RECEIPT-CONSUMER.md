# Inactive local V4 receipt custody

The explicit `admitLocalFactoryResultV4` and `resumeLocalFactoryResultV4` APIs
prepare durable local V4 custody using the existing Q37 receipt transaction.
No route, worker, default, producer emitter, owner MyApps reader, installed source
or protected verifier selects these APIs. Existing legacy APIs remain legacy.

Trusted request admission must independently supply `localSnapshotVersion: 4`,
the input Git tree and exact configuration before receiving a Result. Construct
the binding with `prepareAuthenticatedLocalFactoryInputV4`; retain it through
`FactoryReceiptStore<LocalResultManifestV4, LocalFactoryBindingV4>`. The existing
immutable full JSON binding and operation conflict rules remain unchanged.
There is no migration, old-request upgrade or payload-driven version dispatch.

Both admit and resume validate the retained binding for their statically selected
mode before receipt writes, provenance changes, hooks or keys reads. Wrong-mode
calls fail without rejecting or changing pending custody. The correct API can
then recover the same original receipt. Strict parsing captures a separate copy
of configuration expectations; returned manifests never supply those values.

Recovery authenticates the envelope before attesting the V4 schema and exact
request/profile. It preserves delivery identity, envelope digest and retained
provenance checks, historical artifact integrity, current key validation, current
Work eligibility and canonical admission matching. Storage or hook failures stay
retryable. A lost response is reconciled through the same request/receipt, never
by resubmitting Work. Existing scoped, Work-serialized SQL owns concurrency and
admission; in-memory consumer tests do not qualify that database boundary.

A verified producer Result still grants no execution authority, protected
independent verification, signed Proof or Ready status. The workspace path is
only signed provenance; the consumer never reads it or executes its contents.
Actual service adoption, protected acceptance/custody, financial admission,
independent verification, generic MyApps delivery and installed qualification
remain separate requirements. Paid execution and tester activation remain off.
