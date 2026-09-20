# Capability-aware Routine admission qualification

Date: 2026-09-20. Result: **CAPABILITY-AWARE ROUTINE ADMISSION QUALIFIED**. This qualifies deterministic admission and its local integration, not global activation or a real communication provider.

## Source and release state

- Branch: `codex/openbot`.
- Verified clean starting HEAD: `d4c374c`.
- Commit boundary: one feature commit above that baseline; the completion reply records the resulting commit hash and push result.
- `d4c374c` ancestry: PASS.
- Migration 0027 Federation: PRESERVED, byte-identical.
- Migration 0028 Routine reconciliation: PRESERVED, byte-identical.
- Global Routine execution: DISABLED; frozen release decision unchanged.
- Federation: DISABLED BY DEFAULT; default policy unchanged.
- Phone live execution: DISABLED / UNQUALIFIED; unchanged.
- Live Computer: previous qualification preserved; no new sandbox or live requalification performed or required for these admission changes.

The scope spans admission metadata, canonical occurrence storage, review/API/UI, runtime rechecks, and packaging. Touching each boundary is necessary to prevent UI-only readiness and scheduler/Run Now inconsistencies. Existing provider executors, recovery and continuation are reused, not replaced.

## Qualification totals

| Gate | Actual result |
|---|---|
| Full unit suite | PASS — 568 tests, 80 files |
| Core contracts | PASS — 131 tests |
| New admission tests | PASS — 69: engine/metadata/template classes 51, APIs 11, Agent tool 3, post-claim preflight 4; included in unit total |
| Federation tests | PASS — 51 unit tests: adapter 35, review regressions 12, work authority 4; plus isolated-PG Federation/Gateway scenario |
| Action Gateway tests | PASS — 17 unit tests: authority 5, recovery 5, recovery routes 3, resolution routes 4; exact approval tests add 5; plus real SQL executor/recovery/coverage scenarios |
| Migration ordering | PASS — 29 ordered migrations |
| Fresh database | PASS — migrations 0001–0029 and full reliability/Gateway/Federation/admission integration on isolated PostgreSQL |
| Upgrade database | PASS — populated 0025 upgraded through 0029; Action ID, binding, receipt, attempts and Federation grant preserved |
| Database test count | 2 executable scenarios: fresh integration and populated upgrade; fresh suite repeated successfully after race correction |
| TypeScript / root typecheck | PASS — both workspaces |
| Capability Registry | PASS — 135 definitions, 99 authored tools |
| Skill routing | PASS — 93 checks, 50/57 rank one (87.7%) |
| Builder manifest | PASS — 146 prunable files, all claimed; release 255 |
| Eve production build | PASS |
| Builder production build | PASS |
| Provider-free generated build/boot | PASS — local Sarah/Ava artifact; Goals/Knowledge features; no email, messaging, Phone or Federation credentials |
| Desktop qualification | PASS — actual component fixture at 1440×1000 |
| Mobile qualification | PASS — actual component fixture at 390×844 |
| Source hygiene / secret scan | PASS — final diff, source inventory and credential-pattern scan |

Counts distinguish unit test cases from database scenarios; they do not pretend every SQL assertion is a separately registered test. Tests used synthetic owner/Agent identities and proper injected dependencies, not a production `forceReady` or admission bypass.

Final executor inventory: **513 sources** — ENFORCED 33, BLOCKED 89, READ_ONLY 37, INTERNAL 328, NOT_APPLICABLE 26, **UNKNOWN 0**. Fingerprints were refreshed only after reviewing changed sources and preserved executor boundaries.

## Admission and security results

| Requirement | Result / evidence |
|---|---|
| Admission engine | PASS — same service for scheduled enqueue, Run Now, claims, worker preflight, APIs and tool |
| Permission vs availability | PASS — connected metadata cannot grant a denied capability; send approval remains explicit |
| Required vs optional | PASS — missing required capability blocks; explicit optional delivery fallback preserves work |
| Version/manifest binding | PASS — exact tools and capability ceiling; stale reminder/Routine reviews and concurrent reviews fenced |
| Skill/Role expansion | PASS — expanded/unknown tools blocked; current tool filtering intersects immutable manifest |
| Provider / account awareness | PASS — missing provider vs missing authenticated account vs unqualified executor distinguished conservatively |
| Budget preflight | PASS — positive approved limits/current Agent limits; Run cost/steps/deadline guards retained |
| Blocked occurrence / no-model preflight | PASS — one period, one receipt, no Run/attempt/model/provider/Computer, known cost zero |
| Optional delivery degradation | PASS — saved result retained; unavailable delivery skipped, no work rerun or retry spam |
| Disconnect / reconnect | PASS — current readiness recomputed; historical blocked receipt immutable; no backlog replay |
| Race revalidation | PASS — enqueue, bounded claim set, post-claim preflight, Gateway and one-use handle checks |
| Action Gateway | PASS — denial/pending approval invokes zero effects, exact binding and one-use replay protection retained |
| Browser effects / opaque MCP | PASS — send/publish/deploy/delete/purchase and arbitrary browser JavaScript cannot bypass semantic policy; opaque paths remain denied |
| Delegation / Federation ceiling | PASS — no Routine delegation/MCP expansion; Relay cannot attach itself to a local Routine Run |
| Profile grants | PASS — owner and specific Agent grant checked; missing/ungranted/unqualified profile fails closed |
| Stale version / owner isolation | PASS — stale occurrence and cross-owner readiness denied; other owner's account metadata not inspected |
| Dependency failures | PASS — registry/authority/availability/Agent and post-claim lookup failures fail closed with safe messages; unknown provider/capability unavailable |

The fresh build uncovered an existing packaging failure: tests imported optional provider files that Builder had pruned. Generated deployments now exclude tests and qualification harnesses. A regression contract protects the packaging rule. The regenerated 867-file Sarah/Ava artifact compiled and booted without external credentials: `/login` returned 200, `/manage/routines` returned the expected authentication redirect. This is local boot qualification, not a deployment or authenticated production-data check.

Desktop/mobile checks covered all six states, disabled Run Now controls with descriptions, readiness filtering, expanded capability details, labeled review form, visible keyboard focus, live status text, and no horizontal overflow. The UI used synthetic API metadata and prohibited writes. Owner authentication and server enforcement were tested separately; no owner Routine was reviewed or activated through the browser.

## Reliability preserved

All PASS: occurrence uniqueness, blocked-period uniqueness, renewable claims, heartbeat/stale-worker fence, retry/backoff, bounded catch-up, auto-pause, execution/delivery separation, approval continuation, and recovery.

The fresh PostgreSQL qualification executes the prior executor, six-capability matrix, recovery, pending-send continuation, Federation, review and reliability scenarios alongside the new admission scenario. The mixed READY/blocked race initially exposed a primary-key conflict; conflict handling now covers both uniqueness constraints, and only a winning occurrence can insert a Run. Subsequent complete integration runs passed with no orphan Run.

Continuation preserves the same Run and pending draft. Research/analysis/draft occur once before approval; the simulated send and result delivery occur once after exact approval. Expired approval, changed recipient/account/content, consumed handle, revoked authority, and stale Computer control remain denied. Recovery inspects the simulated provider before deciding completion, retry eligibility or Needs You; it does not blindly resend.

Initial blocked prechecks have zero attempts. A dependency loss after an existing Run/claim is created instead preserves that Run and pauses execution; it is not misreported as an initial zero-Run receipt. Post-claim metadata failures do not increment ordinary execution failure counters.

## Initial Routine class inventory

These are **technical eligibility results for the actual isolated provider-free qualification configuration**, using canonical registry availability, approved synthetic Sarah/Ava manifests and local database capability. They are not claims that existing owner Routines are already reviewed, enabled, or that shared deployment health was queried. No shared database was inspected or changed for this inventory. Every class has `canRun=false` because global execution remains disabled. Existing unreviewed definitions must still receive owner review.

| Class | Required capabilities | Available / unavailable | Approval / blocked reason | Final readiness |
|---|---|---|---|---|
| Daily Brief | list_goals, get_goal, search_knowledge, search_owner_knowledge | All required available | Approved fixture ceiling; no external send | READY |
| Weekly Goal Review | list_goals, get_goal, search_knowledge, record_observation | All required available | Approved fixture ceiling | READY |
| Stalled Work Review | list_goals, get_goal, search_knowledge, record_observation | All required available | Approved fixture ceiling | READY |
| Research Digest | web.read, search_knowledge, search_owner_knowledge, record_observation | All required available | No Computer needed | READY |
| Competitor Monitor | web.read, search_knowledge, search_owner_knowledge, record_observation | All required available | No Computer needed | READY |
| Campaign Performance Review | Research capabilities plus files.read | Registry metadata available; Routine file access unsupported | No approved persistent workspace binding | BLOCKED |
| Draft Follow-Up | list_emails, search_emails, read_email, search_knowledge | Knowledge available; email unavailable | Provider/account configuration required | NEEDS_CONFIGURATION |
| External Follow-Up Send | Draft capabilities plus send_email | Knowledge available; email unavailable | Exact send approval additionally required; provider qualification absent | NEEDS_CONFIGURATION |

Tool names in this table use their canonical `tool.` capability IDs except `web.read` and `files.read`. Every template proposes optional `notification.send` with explicit `in_app_result` fallback; the tested external notification is unavailable and does not block an otherwise ready class. In-app result retention is available.

Technically eligible candidates: Daily Brief, Weekly Goal Review, Stalled Work Review, Research Digest, Competitor Monitor. Required configuration: Draft Follow-Up and External Follow-Up Send. Required authority: every legacy/unreviewed version; exact send approval is additional. Blocked: Campaign Performance Review, Phone-dependent work, default-disabled Federation work and unsupported connected-app/Browser/Computer executors. None were enabled.

## Provider readiness and limits

| Provider / capability | Qualified readiness behavior |
|---|---|
| AgentMail | Implemented; absent in provider-free fixture. Credential presence alone returns account-missing, never READY; authenticated account/real send qualification unproven |
| Email generally | No authenticated email adapter/receipt qualified by this work; no Gmail/Outlook/Composio account inferred |
| Messaging / Telegram | Absent in fresh fixture; configured Telegram remains unqualified for Routine delivery |
| Phone | DISABLED / UNQUALIFIED, independently gated |
| Web Push | UNQUALIFIED; optional saved-result fallback |
| Browser / Computer | Owner/profile/grant metadata inspected locally; Routine executor remains unavailable/unqualified; interactive Live Computer gate preserved |
| Federation | DISABLED BY DEFAULT; transport enablement would not authorize local consequential work |

No new provider authentication-health store was invented. A future provider adapter must supply trustworthy owner/account/qualification metadata before related Routines become eligible. Routine architecture is provider-, model- and harness-neutral; the current finite executor set remains deliberately conservative.

## Migration, cleanup, and external activity

Migration: **0029**, additive receipt columns plus nullability/status/FK constraint changes; no authority backfill. 0027 and 0028 remain untouched. See [rollout and rollback requirements](routine-admission-architecture.md#migration-and-rollout). No shared rollout is authorized by this report.

Local qualification schemas were dropped by test cleanup. Temporary UI/generated-app servers, browser session and isolated PostgreSQL were stopped after checks. Temporary generated artifacts and harness files were removed; durable source tests and these safe reports are retained. No credentials were created. Build output remains ignored local tooling output.

| Activity | Result |
|---|---|
| Real provider qualification | NOT RUN |
| Real model calls | 0 |
| External sends | 0 |
| External resources created | 0 |
| Shared/Production database mutation | NONE |
| Configuration/account/credential creation | NONE |
| Deployment | NONE |
| Merge / global enablement / Routine activation | NONE |
| Federation enablement | NONE |
| Worktree at completion | Clean after the qualified feature commit and branch push; exact HEAD reported in completion reply |

Final recommendation: admission is qualified for review. The five technically eligible classes are candidates for a separately authorized controlled-enablement decision after verifying the target deployment, owner-reviewed version and runtime dependencies. **Keep global Routine execution disabled now.** Real-provider qualification remains outside this work order.
