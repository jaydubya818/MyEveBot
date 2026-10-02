# Product / Environment Fabric integration contract

Status: **PARTIAL / NOT_READY**. Dependency boundary: **WAITING_FOR_CANONICAL_Q37**. Recorded 2026-10-02. This is a consumer crosswalk and acceptance contract, not a new execution protocol.

## Coordination and source authority

Jay explicitly authorized information/integration coordination. The nine P0 requirements and product source `ac56e5a6397a707c41a6882ac7752523a870aa49` were delivered to **Review and extend execution fabric** (`01a0fb64-7906-7ea0-bbc7-a145c9de02ab`) and **Compare cloud execution harnesses** (`01a0faaf-6b6e-7f80-a5bf-f25e82bb7f4d`). Fabric's prepared reply was received by reading its handoff artifact; no return-message permission or implementation changes were needed. The [received handoff](../verification/agent-native-work/environment-fabric-owner-handoff.md) is retained verbatim as checkpoint-specific evidence.

| Source | Inspected exact feature SHA | Meaning |
| --- | --- | --- |
| Product MyEve | ac56e5a6397a707c41a6882ac7752523a870aa49 | Remotely verified product candidate; reconciles main d75091eb333a531fa91ed9d39e273948aa9d0eaf |
| Fabric MyFactory | fc8c26f4fb8190d938247a855b2bc7711bf3c677 | Remotely verified descriptor/router/metadata source; not merged canonical main |
| Fabric MyEve | 314036c36b94b1ccbc5f6f343ce922be26098b7e | Remotely verified documentation and canonical reconciliation |
| Cloud MyFactory | faf93359a4c54daaf3e0b713a601366db02ba8d6 | Read-only inspection of hosted staging controller and V2 contract checkpoint |
| Cloud MyEve | be64a838137efa12e2cfef2fae3d9fa4a2a39653 | Read-only inspection of V2 transport and cloud custody checkpoint |

Cloud development continues independently. Its committed Phase 3 report has progressed beyond Fabric's older image-access blocker to provider-native image qualification and hosted infrastructure/queue evidence. This does not retroactively qualify the Fabric checkpoint, Routine execution, or cloud Work E2E. Readiness requires exact later evidence, not the date or existence of a deployment. No feature branch was merged or modified by this handoff.

## Consume the owner's definitions

MyFactory owns `packages/contracts/src/environment.ts`, exported as `@factory/contracts/environment` on the Fabric branch. It is a private source package, not a published MyEve dependency. Reuse its parser and types after canonical distribution/integration is established; do not copy a second schema into product code. `environmentSummary` is a safe metadata projection. Its ONLINE/OFFLINE/UPDATE_REQUIRED/REVOKED status describes connectivity and compatibility, not qualification or an executing Work.

MyFactory's `apps/supervisor/src/environment-router.ts` owns WorkRequirements, EnvironmentAuthority, EnvironmentQualification and EnvironmentBinding. The router is a supervisor-internal pure function, not an owner API or browser import. SELECTED/BOUND do not prove execution started. Work admission and writer authority remain separate. The current Work requirements do not include Routine or originating conversation identity.

The cloud owner's `packages/contracts/src/cloud-execution.ts` defines `MYFACTORY_EXECUTION_V2` and CloudPrepareRequest. Its exact repository/commit/tree replaces local source paths; requestId, workId, workGeneration, deadline, spend envelope and bounded input remain backend-validated. This software production request is not a generic research/email Routine execution contract. Product must not force those responsibilities into a synthetic repository Work.

MyEve cloud source `apps/eve/lib/engineering/factory-transport.ts` owns the reviewed backend HTTPS destination and token/protection-bypass handling. Never expose those fields to a product component. Canonical producer/result consumer, writer, custody and independent-verifier code remains execution-owner territory. Product consumes CanonicalBetaWork and existing owner decision services.

## Ownership and P0 acceptance

| Journey | Required canonical evidence / integration | Product consumer and acceptance |
| --- | --- | --- |
| Natural agent request → Work → environment | Authenticated owner/agent/thread origin, retained Work identity/generation, backend-derived capabilities and admitted environment binding | Work Canvas shows that same Work. A generated Work ID in prose cannot associate it. Do not label selected/online as Working. |
| Routine → scheduled trigger → Work → CLOUD | Existing scheduler occurrence and reviewed Routine version atomically bind to one canonical Work/request; responsible agent retained; retries reconcile the same identity | Routine/agent last and next check derive from retained records. Duplicate trigger and parallel scheduler probes must not create another Work. No product queue/engine. |
| Browser off | Execution continues without browser polling; close client before completion, then reopen authenticated UI | Same Work/generation and durable Result return. A saved completed fixture is readback evidence only. |
| Mac off | Qualified cloud producer and independent verifier with owner companion/local Factory/local verifier unavailable; measured dependency count zero | UI says Working in cloud only from admitted running state. Cloud outage cannot silently select local execution. |
| Environment-aware status | Authoritative Work read projection includes current binding and observed lifecycle; freshness and unavailable/unknown semantics owned by Fabric | Existing Work, agent home and Today display the same state. Environment infrastructure stays in Proof/Advanced. |
| Result/Proof → origin | Exact Work/generation/request/candidate binding, retained owner/agent/thread/Routine occurrence origin, current verification; existing delivery policy | Same Result appears in originating conversation/agent/Today; Inbox uses canonical delivery. Quiet checks remain history; no second notification authority. |
| Waiting for Mac vs cloud | Canonical routing requirement, detailed waiting reason and admitted state | Mac-required Work says Waiting for your Mac. Cloud-unavailable says Waiting for cloud execution. Missing binding remains unavailable; no inferred fallback. |
| Cancel/recover | Exact identity stop, UNKNOWN reconciliation, lease/cancellation ordering, terminal/current-generation proof | Show request pending until authoritative terminal readback. Reconnect/polling never dispatches, approves, retries or cancels Work. Stale result cannot enable a decision. |
| P0 browser hooks | Natural input and existing authenticated product routes; deterministic provider injection only behind canonical admission; no test-only bypass of owner flow | Desktop + 390px, keyboard/axe, status, Result, Proof, four decisions, reconnect, concurrent reads, cancellation and denied scope. Retain screenshots and separate DETERMINISTIC/CONNECTED/LIVE reports. |

## Existing product hooks; missing Fabric integration

- `/api/work-thread?threadId=…&offset=…` is an authenticated, no-store read using trusted context_assemblies + agent_runs + owner-scoped Work. Its browser region is `Work in this conversation`, with `data-thread-id`, `data-work-id` and `data-result-id`. No new admission endpoint is introduced.
- `apps/eve/lib/product/agent-home.ts` and `/api/agents/[id]/home` expose owned persisted responsibilities/history. `/api/responsibilities` and `data-responsibilities=today|inbox` expose existing runs/deliveries.
- Proof is behind `Proof of Work / Advanced`; the existing publication service owns `Needs You — owner decision`, `Review decision` and `Confirm decision`. Browser controls do not directly call Factory.
- Presently there is no canonical owner-facing Fabric registry/status API or admitted environment binding in these product projections. Defining another `ProductEnvironment` contract would duplicate authority. Keep the missing boundary explicit until the owner ships a consumable contract.
- Routine occurrence → canonical Work linkage, non-software background capability admission, per-origin Result delivery, bounded cancellation projection and detailed waiting reasons still need the canonical owners' implementation/integration. Shared schema proposals remain documentation; no migration number allocated.
- `ROUTINE_RELEASE.enabled` stays false. Neither online metadata, a stage deployment, successful pure routing tests nor a deterministic UI fixture releases it.

Groups continue to consume Relay identity and messaging. The [Group proposal](schema-proposals/agent-groups.md) does not create a second messaging plane. No Fabric, Relay or Factory authority is granted by a product status label.

## Qualification boundary

The added reconnect regression exercises an already-retained deterministic Work: two authenticated reads, network loss, hidden decision controls while refresh fails, reconnection, stable Work/version/generation/Result and zero controlled publication effects. It is not browser-off execution, a cloud provider probe, two independently deployed MyEves, or a live Routine.

Background Routines: **PARTIAL / NOT_READY**. Cloud natural Work: **PARTIAL / NOT_READY**. Qualified cloud execution, browser-off/Mac-off production, natural Routine creation and real Group execution remain **NOT_RUN** in this workstream. No unrun safety counter is reported as zero.

The canonical beta-integration owner receives this crosswalk with the source candidate. Future execution candidates must be reviewed and integrated there; this product branch will not automatically merge them. Coordination authorizes no deployment, cloud admission, production resources, paid model calls, publication, merge, force push/reset or protected-worktree edits.
