# Canonical Digital Worker integration crosswalk

Branch: `codex/total-recall-learning`. Baseline: `be090db93b35c8edb9f38a3cac1344a2289c49bc`. Continuation checkpoint: `4b31ddebe8235fc1efca154d41ee37061be2a444`. Canonical integration observed read-only at `2d258cf7ca79ca56550595296a1cbe0bbab94eca` (Factory terminal-receipt fixes and backend beta-intent admission included). Consult manifest and current canonical HEAD again at integration time. Do not reset canonical code to this branch's older baseline.

## Additive integration

| Source from this branch | Integration treatment |
| --- | --- |
| `apps/eve/lib/total-recall/{learning,store,api}.ts` and their tests | Integrate the full final versions, including prior tranche; retain qualification-only API gate |
| `apps/eve/lib/total-recall/{retrieval-contract,work-retrieval,sofie-adapter,runtime,projections}.ts` | New bounded contracts/adapters; no replacement of canonical Work/Factory logic |
| `apps/eve/lib/total-recall/{fixture-consumer,retrieval-contract.test}.ts` | Deterministic fixture and contract regressions; do not wire fixture consumer into live Sofie |
| `apps/eve/agent/lib/memory-store.ts` and its tests; `apps/eve/agent/schedules/memory-consolidation.ts` | Prior tranche's scoped duplicate/correction/history improvements and removal of silent latest-wins; reconcile additively if canonical changed |
| `apps/eve/app/api/learning/route.ts`, `apps/eve/app/learning/page.tsx` | Qualification review surface from prior tranche; new Result operation is API-only; Beta owns product placement |
| `apps/eve/test/total-recall.integration.mjs`, `test/recall-integration-preparation.mjs`, `test/helpers/*recall*.mjs` | Disposable PostgreSQL/restart fixture assets; automatically skip proposal installation when the canonical chain already provides recall_learning |
| `apps/eve/scripts/executor-inventory.json` | Merge only touched Memory/Learning entries and the six new module entries; recompute integrated hashes after review. Preserve all newer Factory/Q37 classifications |
| `docs/integration/total-recall/`, current verification dossier and Memory/Digital Worker guides | Carry contracts/evidence as dated qualification, preserving historical dossier |
| Root README | Merge only Memory/Learning status and links; preserve canonical Factory/Q37/Gate status updates |

This continuation changes no existing numbered migration, database registry, Factory/Gate B/C implementation, protected verifier, action gateway or execution authority. The exact prior-tranche file list is available with `git diff --name-only be090db93b35c8edb9f38a3cac1344a2289c49bc..4b31ddebe8235fc1efca154d41ee37061be2a444`; current ownership is recorded in the manifest.

## Hooks to connect after schema ownership resolves

| Hook | Canonical location and narrow change | Must preserve |
| --- | --- | --- |
| Schema | Allocate the proposal under `apps/eve/migrations/`; update `apps/eve/lib/database-schema.ts` using actual canonical latest migration | Canonical 0057, all earlier migrations/checksums and registry ownership; no number chosen here |
| Work retrieval | `apps/eve/agent/lib/context-assembly.ts`, `engineeringWorkItem`: bind `WorkRecallStore` to the existing authenticated personal `WorkStore` and selected Work revision | Existing `EngineeringWorkerProjectionStore`, Work contract, criteria, Current Truth of execution, routing, readiness, authority and immutable Result fields |
| Sofie context | `apps/eve/agent/instructions/persistent-agent.ts`, selected Engineering Work binding and turn context; compose `assembleSofieRecall` after authenticated selection; add a separate dynamic user-role instruction using `defineInstructions({content: context.content, role: "user"})` (installed Eve API), preserving the existing system-role return | `selectedEngineeringWorkId` checks, owner/primary-agent/project rejection, existing instructions and tool authority. Do not drop evidence JSON into the system instruction assembly |
| Context retention/budget | `apps/eve/agent/lib/context-assembly.ts`, `context_assemblies` write path | Existing overall token budget and successful-assembly history; add selected source IDs and exact learning version/hash attribution/final context digest, no new execution grants |
| Result → feedback | Existing retained `engineering_native_results` read; `apps/eve/lib/total-recall/runtime.ts` and `app/api/learning/route.ts` | Factory producer custody, native Proof of Work digest/version and immutable result identity. No invocation of verifier or publication side effects |
| Learning decisions/retrieval | Server-bound Work type + `LearningRuntime.decide`; optional LearningStore in Sofie adapter after schema check | Exact owner/repository/Work-type scope, revision/hash, closed behaviors, original user decision and offered-versus-consumed distinction |
| Beta UI | Consume `projectMemory`, `projectLearning` types from `projections.ts`; place in existing canonical/Beta product surfaces under that owner's integration | Source/history/privacy labels, unavailable state, authenticated mutations; no rewrites in Beta worktree here |
| Capsule | Read only `portableMemoryRecord` v1 through Capsule-owned adapter | No export eligibility/consent/activation inferred; no private→shareable expansion or Work scope flattening |

The current Work facts subsection may be replaced with the bounded retrieval result; do not replace the full `engineeringWorkItem` or its authority/readiness projection with this branch's copy. The selection policy is a trusted caller dependency: use explicit authenticated owner selections from that turn or an owner-filtered canonical selection record; empty default selections are safe. The core requires no new search vendor, model API, background promotion loop, Capsule implementation or policy engine.

## Canonical files and ownership that must win conflicts

Preserve the current integration versions of `apps/eve/lib/engineering/` (particularly Factory writer, native execution/controller, retained results and projections), `apps/eve/lib/digital-worker/`, `apps/eve/lib/action-gateway/`, `apps/eve/agent/lib/engineering-work-binding.ts`, shared migrations, `apps/eve/lib/database-schema.ts`, canonical verification scripts and Factory/Q37 evidence. This branch only imports canonical Work, Proof of Work schema and digest; it does not replace their implementation. Keep MyFactory/Q37/Relay/Gate B/C producer-custody, approvals, quiescence/terminal fencing, budget and publication controls intact. Preserve the independently owned Beta, Capsule, Goals and Inbox worktrees.

## Post-integration acceptance

1. Confirm assigned migration, run the combined canonical chain/registry checks and both PostgreSQL fixtures with no second proposal application. Re-run relevant Factory/Q37 checks because they are canonical prerequisites, not because this branch changes execution.
2. Bind authenticated owner selections and Work type; assert no model-supplied owner/scope/authority. Feed the attributed message into real Sofie as user-role context within the canonical budget and record final assembly references.
3. Run Work A evidence → restart → Work B recalled plan with a real model; report actual source/truth/scope measurements. Then retained Result → real owner feedback → evaluation → exact promotion → comparable Work → owner acceptance, including rollback and rejection.
4. Only that combined runtime qualification can change LIVE SOFIE REUSE from NOT_RUN. Model improvement requires its own measured comparison; deterministic fixture PASS does not imply it. Decide production rollout under the integration owner's existing process.
