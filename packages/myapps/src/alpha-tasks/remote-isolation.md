# Dormant remote isolation contract

`myapps.remote-isolation.request/v1` and `myapps.remote-isolation.observation/v1`
prepare the existing Alpha Tasks execution boundary for a separately qualified
host. Nothing imports this adapter from the installed bootstrap. There is no
HTTP listener, URL fetcher, credential loader, registered host, migration runner,
new runtime profile or ingress exception. Existing production, Vercel and tester
denials remain unchanged.

The controller signs with its enrolled Ed25519 key. Requests bind the exact
owner, installation, agent, host, enrollment revision and key identities through
the enrollment digest, plus operation UUID, package/origin/source/runtime digests,
validated operation/input, before-state and a maximum 30-second request window.
The original package retains Mission, WorkOrder, Result, Proof and FactoryVersion
identity. The source closure is independently reconstructed against its Git tree
and signed digest. It is transported separately from the signed document to keep
the existing 100KB canonical-document bound and 4MiB source bound unchanged.

The receiving controller adapter is required to resolve current canonical
authorization for every EXECUTE, READ and FENCE, including duplicates. It must
return the exact command/enrollment/action and bounded expiry; this source does
not implement that future authenticated service connection. Signature validity,
a matching package or a journal row is never an owner approval, capability grant,
spending authorization or Factory execution contract. The existing AlphaTasksHost
must still perform its canonical approval/policy transaction, reserve the durable
operation before transport, and fence stale completion with its RUNNING comparison.
No remote composition is registered here.

The host-local PostgreSQL delivery table is separate from the canonical app
database. A unique operation claim is committed before calling the executor.
Conflicting payload or enrollment bytes deny. A duplicate never launches a
worker, even if the original process died before dispatch. Retained completed
output can be read after response loss; an incomplete claim remains UNKNOWN.
There is no lease expiry, deletion, automatic retry, redispatch or accounting
reconciliation. Keep the original signed command in the controller's canonical
operation custody for readback. A transport timeout is UNKNOWN, not cleanup.

FENCE retains a durable denial even before a delayed EXECUTE arrives and prevents
late completion from replacing it. Without a qualified backend fence method,
the answer is PENDING_BACKEND. A backend must atomically prevent **all delayed
launchers**, including workers with a lost database connection, before confirming
authority fencing. Container absence alone is insufficient. Its acknowledgment
must match the exact binding and command digests. AUTHORITY_FENCED and
CLEANUP_CONFIRMED are distinct; cleanup can advance only on the exact backend
acknowledgment. The supplied local Docker adapter has no such fence method and
cannot produce that remote acknowledgment. Synthetic fencing tests establish
the interface contract, not a real host's containment or fencing qualification.

Every recovery request is freshly authenticated. Revoked enrollment can recover
the same immutable identity, but cannot execute. A changed revision, key, expired
enrollment or unavailable authorizer fails closed; this contract does not invent
cross-revision recovery. Database restoration that loses delivery custody is
unsupported: do not restart an executor against a rolled-back journal. It requires
an independently reviewed incarnation/enrollment recovery before any new admission.

Required before installation: actual host selection and resource envelope,
credential/enrollment authorization, independent database/role and journal
durability/backup controls, authenticated current-policy service, bounded network
transport, atomic runtime fencing, containment and cleanup qualification, installed
same-Mission journeys, current source review/CI, and the preserved source/activation
approvals. Local synthetic signatures, PostgreSQL and offline Docker tests do not
provide any of those installation authorities. UNKNOWN accounting remains with
the canonical accounting owner; this journal neither refunds nor clears it.
