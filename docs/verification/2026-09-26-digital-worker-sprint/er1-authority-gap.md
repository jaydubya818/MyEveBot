# ER1 current-authority caller audit

Status: **blocked for live route admission**. The route-admission transaction exists and can be tested with synthetic current facts, but no trusted production caller can supply its complete `CurrentRouteAuthority` snapshot. There is intentionally no API or Sofie tool that invokes it. A saved routing proposal remains advisory.

| Required fact | Current source | Qualification gap |
| --- | --- | --- |
| Scoped Work revision, control, criteria and writer fence | `WorkStore`, `RoutingStore` and the new route-run tables | Available for an atomic admission check. The older `engineering_execution` row is deliberately treated as a competing writer. |
| Coordinating Agent and Work authority | `getAgent` can read the active primary Agent; `engineeringRuntime` uses it for the separate Golden Work executor | No persisted v2 Work grant tying that Agent, operations, resources, spending, deadline, policy version and route policy to one Work revision. The static Golden profile is not a v2 route policy. |
| Context package with source revisions, trust and freshness | Chat has a bounded Work-context narrative | No authenticated `ContextPackage` assembler/revision store for an admitted Run. Chat text or a model statement cannot be substituted. |
| Remaining budget | Work stores a maximum cost; legacy execution has its own accounting | No common per-Work budget reservation/ledger across the six routes. Treat remaining budget as unknown. |
| Provider binding, qualification and live health | Provider interfaces and v2 schemas exist; the Golden Docker executor has its separate qualification | No current, source-linked qualification/health service for `DIRECT`, `DEEP_AGENT`, `EXECUTOR`, `MYFACTORY` or `RELAY`. ER2's virtual boundary test does not qualify a live harness. |
| Route-specific admission | MyFactory has a signed **intake observation** for a bound request; Relay has owner connection policy metadata | Neither is a current Factory admission grant or the combined Relay grant and peer policy for a route Run. The Factory observation does not prove execution or a result. |

The next implementation should produce a server-owned, versioned authority service that reads these facts independently of request bodies, model output and stored proposal text. It should return `UNKNOWN`/deny when any source is missing or stale, then bind one immutable context and policy snapshot to a Work revision. The route dispatcher must recheck generation, authority and provider health immediately before an effect. Only after the direct provider or harness is qualified should a live caller and UI admission action be exposed. The PostgreSQL integration now checks that an unavailable or malformed authority source leaves the proposal, transition and Run unchanged.

This audit is not an ER1 or M1 qualification result. It records why the remaining live gate cannot safely be marked complete with the current codebase.
