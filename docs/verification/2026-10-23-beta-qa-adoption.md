# Beta QA adoption onto the serving release lineage

Status: source qualification, no deployment. Branch `codex/beta-qa-adoption-20261023` starts at the six-feedback commit `931487c4db417321c7382285096fd27eaf378558`, which preserves the serving PR #99 password-management and chat-only release. See the [six-feedback qualification](2026-10-23-beta-feedback-qualification.md) and [rollout prerequisites](../operations/beta-feedback-release-20261023.md).

## Provenance and scope

Adopted the application/test delta of QA PR #95, head `39ef79cfe021b5ef78e5de990fc45cb72a3c3c37`, against its original base `252d4c8f19f6c52368930710e80ae3499fe8612d`. That PR integrates QA #91, #92 and #94. Its main history has no common ancestor with the actual serving release; merging its complete tree would replace newer authentication and accounting work. This is a reviewed source port, not a merge of main. QA #93, dependency upgrades, sibling Relay/Factory changes and historical generated evidence were excluded.

The file count includes DOM/helper regression suites, two browser specs, one dev-only test environment and CI wiring. Runtime dependency versions remain unchanged. `happy-dom` is pinned to `21.0.4`; programmatic lockfile comparison found no existing package version/integrity changes. React test aliases use the application's React 19 rather than the monorepo root's React 18.

## Reconciled behavior

- Unconfirmed deletion preserves local history, unsynced messages, metadata and drafts. Only confirmed server success removes local state; an unconfirmed server outcome requires reconciliation. Late responses after owner unmount do not clear a newly bound namespace. Existing safe thread-path encoding remains authoritative.
- Stop failures and incomplete stream reattachment, including failures after partial events, show explicit messages instead of silently claiming success.
- Cached-page restoration hides private UI and reloads the canonical signed session gate. Valid sessions continue without password re-entry; signed-out sessions reach Login. Existing storage/401 redirects, recovery routes, 15-second verification bound and signed owner header remain intact.
- `useProductResource` callers with actions clear data after failure. Only the read-only Weekly review opts into this hook's explicitly labeled stale history; 401/403/404 always clear retained data. Task status cards may retain labeled stale displays; existing server write checks remain authoritative. Polling, visibility pauses, cancellation and request bounds are preserved.
- Activity distinguishes unavailable, confirmed empty and populated states. Task status failures and retry controls remain explicit; duplicate endpoint errors are collapsed.
- Touch inputs avoid undersized fonts; current account links have 44px targets. Landscape chat uses a drawer with usable close/backdrop, focus containment, Escape and focus return. Visibility changes immediately so focus can enter before the movement animation completes.
- The existing six feedback fixes remain: explicit disabled-capability instructions, concise defaults/latest preferences, canonical Today Work read, authoritative owner-wide turns/budgets with separate measured cost, and no unexplained alpha Agent chip. Small usage text uses the normal text color after browser measurement found the subtle color produced4.44:1 contrast.
- Loopback-origin aliases apply only outside production. Production retains exact scheme/host/port comparison and cross-site mutation rejection.

No password, owner identity, session version, accounting SQL, migration, credential, activation, quota, capability grant, paid Work/Factory authority or tool-enablement change is introduced by this adoption. The existing source-only accounting `status` prerequisite from931487c4 is still not installed in production.

## Qualification

- Combined affected regression run: 28 suites, 279 tests passed, including real disposable-localhost PostgreSQL password/session revocation, owner isolation and chat accounting. The corrected session-restore DOM suite was independently rerun:6/6 passed.
- Full typecheck, capability registry, imported skill routing and executor governance passed: 903 classified sources, UNKNOWN=0. Existing dependency source mitigation checks passed.
- Final production Next build: `t47U1026yhJmFEyv6ddbk`, exit0. The unchanged optional MyApps dynamic prototype asset resolution emits a build warning; this is not qualification of MyApps.
- Hosted Eve build passed. Workflow and server artifacts both bundle pg with zero unresolved runtime pg loads; handler SHA256 `75e37a9e5b01f89cd598c27b81dc276ac5a73407c8c491cdfff7a85bba2602db`.
- Browser qualification passed on the real production artifact with signed synthetic owners. The six-feedback runner checks Today outage/retry, owner-wide meter, quota exhaustion, failed-delete preservation through reload, desktop/mobile composer visibility, accessibility and same-browser owner switching; both viewports have zero serious/critical targeted accessibility violations. The separate QA fixture passed 5/5 checks for landscape keyboard/close behavior, touch sizing, account targets and valid/invalid persisted-page restores. The persisted event is synthetic; native browser BFCache retention and physical iOS/Wi-Fi behavior are not claimed.
- Independent review and final browser result references are recorded in the adjacent review report. Failed intermediate compiler/browser attempts are retained separately and are not passing evidence. The compiler sandbox failure required clearing its failed local cache; later clean builds passed. Browser failures drove the focus timing and text-contrast corrections.

Evidence directory: `/Users/jaywest/Myeve/output/beta-qa-adoption-20261023/`. CI adopts explicit fixture specs, bounded readiness failure, read-only checkout and no production secrets. Hosted CI on the successor commit is not yet a qualification claim. No live model response was generated: provider-boundary tests prove prompt delivery, while probabilistic refusal/style compliance still needs the bounded post-release smoke documented in the existing runbook.

## Active installations preserved

Read-only checks at `2026-10-23T20:11:50.997Z` confirmed both original deployments remained Ready on 5895b129, both health endpoints returned HTTP200 ready, original owner sessions were valid, and conversation lists retained 9/4 threads. Project settings and environment references matched retained release records. Git deployment for the adoption branch is explicitly disabled before publishing source. No deployment, production SQL, password/session change or tester/model turn was performed.

## Separate next stages — not implemented or qualified here

The Relay MCP adapter and Factory productive fixture pairing remain separate work. Prefer the installed Eve 0.66.3 dynamic per-caller MCP connection before inventing another protocol client: reuse verified session/owner/agent connection lookup, credential ownership, allowlists and existing denial gates. Validate Relay's initialize/error/timeout semantics and disable protocol discovery only if required by the actual supported transport. Existing `/api/v2/federation` compatibility remains a separate contract; loopback transport characterization is not live end-to-end proof.

For Factory pairing, reuse the existing published test-only correction `c8eec4580e964cdebe6a7351ff78546244291ebf`: derive the exact capability bindings/digest and runtime role from the actual disposable fixture. Do not weaken preflight or replace missing/foreign-owner negative tests. Bind qualification to an exact final Factory source revision; current peer fixture failures/private skips are not productive-journey or financial-invariant proof. A definitive pre-admission cancellation must never permit later admission of the identical request after configuration repair; unresolved cases must remain ambiguous without refunds. No tester replay or ledger mutation is authorized by this report.
