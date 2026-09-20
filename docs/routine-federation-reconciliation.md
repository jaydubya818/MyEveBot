# Routine + Federation reconciliation

**ROUTINE + FEDERATION RECONCILIATION QUALIFIED**

Local deterministic qualification on 2026-09-20. This qualifies the cumulative code
lineage, not live provider operation or production enablement.

| Baseline | Value |
| --- | --- |
| Branch | `codex/openbot` |
| Starting HEAD | `60d341f` |
| Common ancestor | `4d3f1eb` |
| Routine source | `82fbc7b` / `8364835` |
| Reconciliation implementation | `ee904d3` |
| Final documentation commit | The commit containing this report; exact HEAD in completion response |
| Federation migration | `0027_relay_federation.sql`, byte-for-byte unchanged |
| Restored Routine migration | `0028_routine_pending_send.sql` |

`60d341f` and `4d3f1eb` remain ancestors. `82fbc7b` and `8364835` remain sibling
history, not ancestors. Their reviewed diff was reapplied; the schema marker and
executor inventory were reconciled with the Federation additions. No historical
commit, branch or migration was rewritten.

## Restored behavior

| Requirement | Result / evidence |
| --- | --- |
| Continuation without repeated research | PASS: real runner unit fixture counts research=1, analysis=1, draft=1 before and after approval; send=0 before, 1 after |
| Same occurrence, Run and pending Action | PASS: PostgreSQL continuation claim race, immutable checkpoint, exact approval, one winning claim and one send |
| Current version and authority | PASS: existing SQL executor qualification rejects old occurrence versions and mid-run Agent revocation |
| Changed binding | PASS: recipient/account/content changes invalidate approval; zero additional provider effects |
| One-use/replay | PASS: consumed handle rejected; completed checkpoint replay adds no send |
| Owner recovery decisions | PASS: occurred/not occurred/cancel; cross-owner, stale and concurrent decisions fenced; no resend |
| Unknown outcome | PASS: provider inspection precedes retry, indeterminate result stays Needs You, owner attestation is separately labeled |
| Browser effect enforcement | PASS: email/publish/deploy/delete/purchase interactions denied before sandbox/provider lookup |
| Human takeover | PASS: existing Computer control tests and PostgreSQL OWNER/stale-control fences preserved; human input path unchanged |
| Execution/delivery separation | PASS: notification failure/denial does not repeat completed work |
| Pending-send migration | PASS: isolated fresh and upgrade databases |

Restoration touches the runner, tool policy, Gateway recovery, API/UI, schema, tests
and inventory because these are the missing source-lineage behaviors. No new
provider, execution authority system or capability-aware admission was added.
Checkpoint payload contains the exact private send parameters and execution identity,
not an API credential. Actions API does not expose this private payload.

## Federation integration and qualification limits

Federation identity, grants, publication boundaries, encrypted adapter state,
receipts, tests and disabled-by-default posture are preserved. The only Federation
runtime change is explicit Action trigger attribution: `relay_request` replaces the
generic `delegation` label. Routine Actions retain `scheduled_occurrence`. The
Actions UI displays these as Federated request and Scheduled routine. The request's
`local_run_id` links external caller/grant metadata to the canonical Run and Action;
action decisions, approvals, result and evidence remain in the existing audit tables.

The actual bounded work executor calls Action Gateway, consumes one-use authority,
then refreshes Relay authorization immediately before model invocation. Its model
has no email, browser, shell, private-data or delegation tools. Published Knowledge
is an exact projection read, not execution authority or a canonical repository search.

| Integration invariant | Result |
| --- | --- |
| Federation → Action Gateway | PASS: forged handles fail before Relay acceptance/model calls; current local decisions remain authoritative |
| Relay ALLOW + local ALLOW | PASS: signed fixture delivery + real Gateway SQL/handle permits one fake effect |
| Relay ALLOW + local APPROVAL | PASS: REQUIRE_APPROVAL, zero fake effects |
| Relay ALLOW + local DENY | PASS: DENY, zero fake effects |
| Relay DENY + local ALLOW / APPROVAL | PASS: no admissible signed delivery, DENY before local execution |
| Federation cannot expand Routine | PASS: Relay trigger cannot attach to a Routine Run; local authority rejects missing/broadened manifest |
| Published Knowledge privacy | PASS: real projection SQL returns exact granted record only; private/unshared, other caller, changed version and revoked publication return no result |
| Federation default state | DISABLED; existing `MYEVE_RELAY_ENABLED === "true"` gate unchanged |

The five-case PostgreSQL matrix uses deterministic Relay issuance and local policy
inputs, the actual signature validator, actual Gateway persistence and actual
one-use handles. It is not a live Relay server/grant-service qualification. Existing
Federation unit regressions also cover signature binding, private projection boundaries,
publication revocation races, exact approval continuation, accounting and default denial.

**Email distinction:** the local policy contract for a Relay-attributed email Action
returns REQUIRE_APPROVAL when required, with zero sends. The current public Federation
work executor rejects email requests outright and has no email tool. This stricter
existing restriction is preserved; the reconciliation does not claim a newly supported
federated email workflow. Browser authority is similarly not granted by Federation.
No real provider, model, external Agent deployment or billable sandbox was used.

## Migration qualification

The repository had exactly one migration 0027, owned by Federation; 0028 was free.
Pending-send has foreign keys only to `task_runs` (introduced in 0002) and
`action_requests` (introduced in 0023). Its position after Federation is migration
ordering, not a semantic dependency on any Federation table.

- Ordering: PASS, normal migration checker validates 28 ordered migrations.
- Fresh database: PASS, all migrations 0001–0028 applied to a new isolated schema.
- Upgrade: PASS, schema through 0025 with existing Action receipt/binding/attempt
  upgraded through 0026 and Federation 0027; a Federation grant was then inserted,
  followed by 0028. Existing Action and Federation grant remained unchanged.
- Current-canonical upgrade segment: PASS, the same fixture explicitly exercises
  populated 0027 → 0028. New pending-send table starts empty.
- Shared/Production mutation: NONE. Harnesses pin `127.0.0.1:55441`, never read
  DATABASE_URL or env files, and drop fixture schemas in `finally`.

## Qualification results

| Check | Result |
| --- | --- |
| Complete unit suite | PASS: 499 tests, 76 files |
| Core contracts | PASS: 130 tests |
| Federation unit tests | PASS: 51 tests across adapter, review regressions and work authority |
| Routine unit tests | PASS: 16 tests across release, activation, final gate and runner continuation |
| Action/recovery API and authority units | PASS: 17 tests; included above |
| PostgreSQL execution/Action/recovery/continuation/integration | PASS: all nine qualification groups |
| PostgreSQL upgrade | PASS |
| TypeScript + root typecheck | PASS, both workspaces, uncached |
| Capability Registry | PASS: 133 definitions, 98 authored tools |
| Skill routing | PASS: 93 checks, 50/57 rank one (87.7%) |
| Builder manifest | PASS: 145 prunable files all claimed, template release 255 |
| Eve production build | PASS |
| Builder production build | PASS |
| Source hygiene | PASS: `git diff --check` |
| Targeted secret scan | PASS: added lines/new files contain no credential patterns; this is a pattern scan, not a claim of exhaustive secret detection |

Executor inventory: **507** classified source files, **UNKNOWN=0**.

| Classification | Count |
| --- | ---: |
| ENFORCED | 33 |
| BLOCKED | 89 |
| READ_ONLY | 34 |
| INTERNAL | 325 |
| NOT_APPLICABLE | 26 |
| UNKNOWN | 0 |

Commands: `npm test --workspace=eve-agent`, `npm test`,
`node --import tsx apps/eve/test/execution-reliability.integration.mjs`,
`node --import tsx apps/eve/test/action-upgrade.integration.mjs`,
`npm run db:migrations:check`, `npm run typecheck -- --force`,
`npm run build --workspace=eve-agent`, `npm run build --workspace=eveclaw-builder`.

The first local PostgreSQL/tsx runs encountered sandbox IPC restrictions; authorized
local-only retries passed. New test fixtures needed an idempotency-key length correction,
the runner's actual `send` method, and an explicit TypeScript `this` annotation; all
were corrected before the final successful runs.

## Release posture

Global Routine execution: **DISABLED**. Federation: **DISABLED BY DEFAULT**.
Deployment: **NONE**. Real sends: **0**. Shared migrations: **NONE**.
No merge, enablement, account/credential creation or capability-aware admission work.
Disposable test schemas were removed and the local PostgreSQL fixture was stopped.
Stop after this reconciliation and await owner review.
