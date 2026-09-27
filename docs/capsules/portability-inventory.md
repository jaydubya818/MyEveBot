# Portability inventory

Integration-preparation update (2026-09-27): [current crosswalk and boundaries](integration-crosswalk.md). Supersedes older readiness/dependency notes below; core behavior remains accepted.

CAPSULE CORE: LOCALLY QUALIFIED

SECOND-EVE BENEFIT: PASS — deterministic fixtures

CANONICAL MEMORY EXPORT POLICY: INTEGRATION PENDING

CANONICAL ACTIVATION: INTEGRATION PENDING

LIVE DESIGN-PARTNER CAPSULE: NOT_RUN

| Existing surface | Decision | Capsule use |
|---|---|---|
| `lib/owner-data.ts`, owner archive ZIP and domain inventory | ADAPT | Keep account backup separate. It includes broad history and authority-related metadata that must not become portable experience. Reuse its strict allowlist principle and owner-auth patterns. |
| `lib/owner-data-operations.ts`, migrations 0016/0018 | REUSE | Existing owner operation table holds inert Capsule import reviews with a namespaced metadata envelope. No migration. |
| `lib/owner-knowledge.ts`, `owner-knowledge-types.ts` | REUSE | Owner-scoped, read-only canonical search; no competing Memory persistence. |
| Canonical source portability/classification policy | MISSING | Fail closed. This work defines the adapter facts and synthetic qualification fixtures. |
| `agent/lib/memory-store.ts`, `lib/memory-scopes.ts` | REUSE / DEFER | Preserve owner/agent/project semantics. Do not write through non-atomic per-item APIs. Goal/task scopes remain unsupported in v1. |
| Current Truth/correction via `correctOwnerKnowledge` | DEFER | Capsule conflicts stage incoming evidence; canonical correction/promotion requires Memory owner integration. |
| `agent/lib/skill-store.ts`, dynamic custom Skills | ADAPT | Portable descriptive Skill text/version; no writes to the live blob or automatic registration. Normal validation/qualification is an explicit dependency. |
| `lib/role-catalog.ts`, `solution-packs.ts` | ADAPT | Description-only portable Role/Pack content, without capability IDs, risk ceilings, budgets, tool grants or execution policy. |
| Files API/private blob storage | DEFER | Existing files have access controls, but no portable-source policy contract. v1 carries explicitly selected readable text fixtures only; never exports arbitrary private file paths or blob URLs. |
| Total Recall M6 learning at inspected SHA | ADAPT | Consume promoted/qualified learning as an advisory candidate; preserve version and qualification reference. Candidate/rejected learning is excluded. |
| Total Recall/Digital Worker M7 engineering Capsule | ADAPT / DEFER | Read its pure selection/integrity/staging contract. No wholesale copy and no implicit wire-format conversion. Future bridge must re-fetch owner/source/revocation facts. |
| Builder | DEFER | Future optional Capsule review after destination identity and scope are established. No inherited source authority or automatic import. |
| Relay, Factory, credentials, writer custody, active Work | EXCLUDE | No imports or calls to these execution/authority services. A procedure is descriptive data only. |

Inspection points: baseline `a7936898c77d157aa66c222b86aedce07e265e16`; Total Recall and Digital Worker committed HEAD `be090db93b35c8edb9f38a3cac1344a2289c49bc`. See the timestamped worktree inventory for dirty workstreams and migration ownership. No branch was merged, reset, stashed or cleaned.

Final read-only refresh: Total Recall is now `4b31ddebe8235fc1efca154d41ee37061be2a444`, clean. Its new repository/Work-type/Work-scoped learning contract is **DEFERRED**, because Capsule 1.1 must not broaden its applicability. See the precise dependency in [Memory integration](memory-integration.md).
