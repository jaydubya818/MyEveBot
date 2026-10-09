# Environment Fabric → Product Expansion contract handoff

Read-only handoff prepared for “Build private alpha product shell - pluto” (`01a0ebb5-6b20-75b3-9555-fa56a6f48313`). No merge, deployment, admission, paid execution, publication or protected-worktree change is authorized by this document.

## Exact source and status

Remote refs reverified for this handoff:

| Repository | Canonical main | Fabric feature checkpoint |
| --- | --- | --- |
| MyFactory | `c0b4c1155a6a98f91375163443938042e6a0be10` | `fc8c26f4fb8190d938247a855b2bc7711bf3c677` |
| MyEveBot | `d75091eb333a531fa91ed9d39e273948aa9d0eaf` | `314036c36b94b1ccbc5f6f343ce922be26098b7e` |
| Relay | `a61f0ef697b02cf22da72ff2904c584d7faa026a` | Unchanged |

Both Fabric checkpoints are on `codex/environment-fabric`. They are remotely durable feature work, **not merged canonical Environment Fabric contracts**. MyEve preserves landed Attempt-8 changes unchanged. Existing cloud checkpoint `7a69c472f05d540f490a41e33014b978f1165e82` is retained in MyFactory history.

Overall **PARTIAL / NOT_READY**. Cloud admission DISABLED, no promoted FactoryVersion or qualified cloud image. Do not enable Routine release or background-cloud availability from this handoff.

## Implemented interfaces available for review

At MyFactory `fc8c26f4fb8190d938247a855b2bc7711bf3c677`:

- `packages/contracts/src/environment.ts`, package export `@factory/contracts/environment`: `EnvironmentDescriptor`, `EnvironmentCapability`, `EnvironmentType`, `CapabilityName`, `parseEnvironment`, `negotiatedProtocol`, `environmentSummary`. The package is private/version 0.1.0; this is a source export, not a published cross-repository dependency.
- Descriptor: schemaVersion=1; id/name/type; ownerId/businessId; provider/runtime/factoryVersion; protocol min/max; capabilities `{name,version,available}`; connectivity; observedAt (epoch milliseconds); capacity; revoked. CLOUD requires an immutable `sha256:` runtime and a FactoryVersion. No endpoint, credential, root path or machine hostname is in this schema.
- `apps/supervisor/src/environment-router.ts`: pure `deriveRequirements`, `requirementsDigest`, `environmentIdentity`, `routeEnvironment`. This supervisor module is not an HTTP API or public package export.
- `WorkRequirements`: workId, generation, ownerId, businessId, repository, environmentType, environmentId, capabilities. Structured resources are repository, a specifically identified owner-file/owner-desktop, or operator-only local-qualification. Derivation records bounded capability/resource reasons; it is not authorization.
- `EnvironmentAuthority`: exact Work/generation/owner/business, allowed environment IDs, capabilities, repositories and expiry. `EnvironmentQualification`: independently trusted exact identity digest, capability set, evidence ref, qualified/expiry times and QUALIFIED/REVOKED status.
- `EnvironmentBinding`: environment ID/type, identity digest, FactoryVersion, protocolVersion=1, policyVersion=`environment-routing-v1`, requirements digest.
- Router returns SELECTED or BOUND with a binding, or WAITING_FOR_ENVIRONMENT/DENIED with a reason. BOUND is retained readback, **never permission to start/restart**. Production admission, writer fencing and Relay authorization remain separate.
- `apps/supervisor/src/environment-adapters.ts`: `ownerComputerEnvironment` and `localFactoryEnvironment` are metadata projections. They do not register an environment, issue grants, enqueue operations or establish qualification. Existing lifecycle provider is accurately labeled LOCAL_FACTORY.

`environmentSummary` returns id/name/type/status/capability names only. Status is ONLINE, OFFLINE, UPDATE_REQUIRED or REVOKED. It intentionally does **not** declare Available/Qualified/Working. Those product claims require qualification and authoritative Work execution state. Router waiting strings distinguish cloud from Mac, but it does not yet supply a durable detailed waiting-reason projection.

## Existing canonical request, status, result and cancellation paths

These already exist in MyEve canonical `d75091e` and are preserved by Fabric. Consume via trusted backend services; do not invoke execution from a read projection.

- `apps/eve/lib/engineering/factory-live-adapter.ts`: `FactoryPrepareRequest` contains requestId, workId, workGeneration, repository, deadline, maxSpendUsd, optional spendContract and bounded input. The current input includes a local absolute repositoryPath and workerProfile=mac. `LiveFactoryAdapter` explicitly requires configured HTTP loopback. It is **not a usable cloud transport**.
- Current Factory endpoint family: POST `/api/connect/v1/dispatches` (prepare); GET `/api/connect/v1/dispatches/:requestId`; POST `/api/connect/v1/dispatches/:requestId/dispatch`; POST `/api/connect/v1/dispatches/:requestId/stop`. These are authenticated local Factory backend interfaces, not new owner-facing routes.
- `FactoryReadback`: requestId, workOrderId, nullable runId/snapshot/identity/evidenceRef, state, quiescent, spend/accounting, blocker. States: PREPARING, PREPARED, DISPATCHING, RUNNING, UNKNOWN, STOPPING, COMPLETED, FAILED, CANCELLED, NOT_DISPATCHED. There is no persisted EnvironmentBinding in this readback yet.
- `apps/eve/lib/engineering/factory-writer.ts`: `FactoryExecutionIdentity` binds runId, writerGeneration, dispatchIdentity, workId/workGeneration, factoryId/FactoryVersion, requestId, workOrderId/remoteRunId, repository/baseSha/allowedPaths/deadline. `FactoryWriterStore` commits UNKNOWN before dispatch I/O, stops the exact identity, and reconciles quiescence without blindly resending a dispatch. `FactoryExecutionTransport` exposes dispatch/stop/observe. Missing observation does not release authority.
- `apps/eve/lib/engineering/factory-receipt-store.ts`: `FactoryBinding` additionally correlates Work/criteria versions, agentId, source/configuration digests, attempt/input commit and operation ID. The receipt store rechecks owner scope, current generation, cancellation and active agent; stale evidence may remain historical without becoming eligible for current admission.
- MyFactory `packages/hosted-routing/src/result.ts`: `ExecutionSnapshot`, `ResultManifest`, `SignedResult`, `ResultArtifact`, `ResultEvidence`; protocol `MYFACTORY_RESULT_V1`. Exact candidate commit/tree/base, evidence and artifact hashes are retained. This producer result is not by itself independent verification, canonical Ready, owner acceptance or publication permission. MyEve consumer/writer/custody and independent-verifier paths remain authoritative.

## Explicit gaps for the nine requested Product boundaries

1. Natural authenticated request → capability derivation → production EnvironmentRouter is **not connected**. Pure routing tests do not qualify this journey.
2. No Routine occurrence/origin contract was added to Fabric. Current requirements do not contain responsible agent, originating thread, Routine ID or occurrence ID. Preserve Product's canonical origin/occurrence identity; jointly map it to Work/request idempotency during canonical integration. Do not invent a competing scheduler or synthetic cloud dispatch.
3. Browser-off/cloud reconnect is NOT_RUN. Existing durable local readback is useful, but not cloud survival proof.
4. Mac-off cloud production and independent cloud verification are NOT_RUN.
5. No authenticated environment registry/read API or durable qualification/revocation store is shipped. Product cannot consume an authoritative live Fabric status endpoint yet.
6. Existing Work/agent/result bindings are available. Environment provenance and origin/Routine result-delivery integration remain pending; do not add a second Inbox delivery authority.
7. Descriptor ONLINE means connectivity, not qualification. SELECTED means a pure routing decision, not executing. Render Working in cloud only after durable authoritative admission/start evidence. Fixtures must remain visibly deterministic.
8. Existing exact-identity writer cancellation/reconciliation is available for local Factory. Cloud command/effect idempotency, leases, cancellation and recovery are unimplemented/unqualified. No transparent fallback.
9. Tests exist under `apps/supervisor/test/environment-{router,adapters}.test.mjs`; local lifecycle tests protect duplicate/restart/cancel behavior. There is no Fabric natural-input P0 Playwright hook or admitted cloud test endpoint yet. Do not bypass owner input to manufacture passing cloud E2E.

Product may continue read-only work against its existing canonical Work projections and define explicit absent/unavailable states. Please do not copy these source schemas, import supervisor internals into client code, remove loopback guards, or infer production qualification. Package distribution and authenticated projection integration need a reviewed canonical checkpoint.

## Evidence and blocker

- Factory: 243 tests PASS, 5 gated skips; 56 new environment boundary tests; types/governance/build PASS. Hosted repaired checkpoint CI PASS: https://github.com/jaydubya818/MyFactory/actions/runs/36978238948
- MyEve Mac deterministic regression: 46 PASS, 8 gated SQL skips. Real companion E2E not repeated. Mac modules are unchanged by the reconciled canonical publication commit.
- Cloud producer/verifier, Mac-off/browser-off, environment-aware P0, multi-client and accessibility journeys: NOT_RUN. No release-wide zero safety counters fabricated.
- DeepAgent NOT_QUALIFIED; existing harness retained with a tested fast-child-output capture repair. Relay unchanged; no new federation qualifications.
- Existing staging blocker: no compatible immutable worker image available after VCR lookup/upload failures. Restore image access within the already approved staging project; no provider switch or TLS weakening.

Pinned documents:
- https://github.com/jaydubya818/MyFactory/blob/fc8c26f4fb8190d938247a855b2bc7711bf3c677/docs/environment-fabric/qualification.md
- https://github.com/jaydubya818/MyFactory/blob/fc8c26f4fb8190d938247a855b2bc7711bf3c677/docs/environment-fabric/source-manifest.json
- https://github.com/jaydubya818/MyFactory/blob/fc8c26f4fb8190d938247a855b2bc7711bf3c677/docs/environment-fabric/t3-crosswalk.md
- https://github.com/jaydubya818/MyFactory/blob/fc8c26f4fb8190d938247a855b2bc7711bf3c677/docs/architecture/cloud-execution.md
- https://github.com/jaydubya818/MyFactory/blob/7a69c472f05d540f490a41e33014b978f1165e82/docs/cloud-execution/phase-2/image-blocker.md

No protected worktree was modified to prepare this handoff. Final integration belongs to the canonical beta owner.
