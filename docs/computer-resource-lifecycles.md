# Computer resource lifecycle ownership

Migration `0032_computer_resource_lifecycles.sql` adds one durable ownership ledger. It does not change historical migrations or the separate migration-reconciliation branch. Both branches' existing 0031 migrations were inspected; no inspected local/origin branch uses 0032.

The canonical creation adapter consumes ordinary Action Gateway creation authority, inserts the ComputerSession with its server-resolved Run, and reserves an immutable lifecycle identity before the SDK create. The resource name is derived from a server UUID. Environment identity includes provider, Vercel team/project, local versus hosted execution, environment and deployment provenance. An SDK create never adopts or retags an existing caller-named resource. The adapter revalidates the original authority immediately before and after creation. Reconnect verifies persisted identity and executable state, then performs a non-resuming lookup; it never creates a replacement implicitly.

The explicit SDK adapter is necessary because the stock Eve backend can get-or-create and retag a supplied existing name. Existing tool policy remains responsible for browser/file actions. Cached handles additionally check current lifecycle, Run, Agent and control state before I/O. A stopped provider session requires explicit new provisioning; reconnect does not resume a stopped generation. Provider timeout is bounded by the canonical ComputerSession and Run deadlines. A process shutdown does not mint termination authority: provider deadlines and the Operations recovery path bound resources after a process exits.

## Termination authority

`OWNED_RESOURCE_LIFECYCLE` lives inside ActionGateway. Its handles occupy a separate WeakMap from ordinary action/provider handles. Each handle binds one stop, delete or verification operation to the exact lifecycle identity, owner, environment, session, resource name, generation, version and current cleanup lease. A consumed handle cannot authorize creation, preparation, browser actions, input, file mutation or communication. Provider effects independently revalidate the claim and ownership tags. The old unbound LiveSessionProvider stop guard remains closed.

Authenticated owner Stop resolves the current binding and control version without an additional approval. Agent Stop uses its existing capability and exact-action approval policy first; it cannot stop under OWNER control or claim owner/system authority. Automatic cleanup must prove a terminal/cancelled Run, expired deadline, revoked Agent, failed/expired/missing session, expired provisioning deadline, or existing cleanup tombstone in SQL. A supplied reason string cannot establish authority. Resource cleanup does not modify the Run's business outcome.

The cleanup claim atomically closes input admission, advances control version and sets NONE. In-flight operations are fenced and their resource is terminated; after verified deletion their counters are cleared. Only approvals whose ComputerSession and exact provider environment/resource binding match are invalidated. Safe Control Center and lifecycle receipts contain IDs and outcomes, never tokens, cookies, input text or provider responses.

## Recovery and retention

States are provisioning, active, cleanup_pending and cleaned. Cleanup claims use an unpredictable token, monotonic version and 30-second lease. Each provider operation is bounded to eight seconds. Only independently verified absence can publish cleaned, and final SQL CAS failure cannot report success. Failed attempts remain pending for Operations recovery. Late generation-N cleanup resolves N's immutable resource name and cannot fence or mutate N+1.

Identity facts deliberately have no cascading foreign keys to ComputerSession, Run or control rows. PostgreSQL triggers reject identity mutation. Original IDs survive session deletion. The table's primary key and unique resource/provision/session-generation constraints reject ambiguous ownership.

Verified tombstones are inspected for late creates during the first 24 hours; provisioning authority expires within 150 seconds. Verified tombstones are retained for 30 days and then purged by Operations. Unverified resources are never purged. Owned snapshot IDs are persisted before provider deletion for interrupted cleanup recovery; the inherited shared preparation snapshot grants no session cleanup authority. Existing audit events retain their normal application retention policy.

Preparation retirement is separate and uses its existing lifecycle. It refuses retirement while an unresolved owned resource or a live waiter depends on it. Resource reservation locks and updates the preparation version; retirement compares the observed version so a concurrent reservation cannot be missed. The last session is deleted before the preparation is retired.

## Migration and legacy sessions

No historical provider ownership is fabricated or backfilled. Existing active sessions become lost with `legacy_resource_unbound`, and control is fenced to NONE. Historical records can be inspected but cannot execute or use the new cleanup path. An operator must establish historical ownership independently; this migration neither adopts nor deletes unknown resources. New sessions establish their own exact binding.

Qualification uses isolated loopback PostgreSQL and fake SDK effects. The permanent integration tests cover the actual migration runner and reruns, durable constraints, ownership denials, consumed authority, actual owner/Agent paths, approval scope, orphan/late-create recovery, independent-worker fencing, replacement generations, canonical creation before SDK access, reconnect and final Cold readiness.
