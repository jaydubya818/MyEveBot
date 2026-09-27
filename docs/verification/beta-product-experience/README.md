# Design partner beta UX qualification

**READY FOR INTEGRATION — UI/API-contract qualified**

**LIVE DESIGN-PARTNER E2E — NOT YET QUALIFIED**

Accepted candidate: `ed0f6b5dad0e3a131a9f5332139e627245cbd4e8`.
The UI is accepted for integration. The original qualification below uses explicit
fixtures and intercepted API contracts; unattended live use remains unqualified.
Canonical dependencies include Engineering Work/Current Truth, MyFactory receipts,
Sofie direct admission, Relay collaboration, protected verification, Goal/Task
projections, Inbox response binding and scoped recall/learning. Exact sources,
fields and gaps are in the [integration crosswalk](../../beta-ux-integration-contract.md);
follow the [Beta UX Integration Checklist](../../beta-ux-integration-checklist.md).

The final preparation pass adds those documents and two bounded copy/fallback fixes.
Its checks are recorded separately in [integration-preparation.md](integration-preparation.md).
The original 27 screenshots, source manifest and qualification logs are retained
unchanged and are not relabeled as evidence for the preparation changes.

Branch: `codex/beta-product-experience`.
Baseline: fetched `origin/main` at `d64f2f96003818b2f51341b54a2edd6f426a0dae`.
Application code qualified: `e6ed1b2e5ed71459e9a57c3a6814c0b797b45554`.
The accepted candidate documentation commit added this dossier, evidence, and a test-only wait
for the mobile drawer animation before its screenshot; it did not change runtime
code. Exact file hashes are in [source-manifest.json](source-manifest.json).

## Acceptance matrix

PASS below means UI/API-contract qualification, **not** database or live agent E2E.

| Area | Status | Evidence or remaining boundary |
| --- | --- | --- |
| Today | PASS | Active/completed work, results, decisions, blockers, prior visit changes, partial failures and empty state |
| Daily Brief | PARTIAL | Existing period, completed work, results, risks and recommendations. Knowledge change feed and scheduled execution times not supplied by current contract |
| Work UX | PARTIAL | Goal/task detail, criteria, plans, phases, progress, decisions, evidence and next steps. Canonical engineering Work integration remains separate |
| Needs you | PASS | Exact-action decisions, expiry, stale binding, human-input exceptions, retained history |
| Results | PASS | Existing outcomes, states, rationale, evidence, feedback and contextual correction |
| Proof of Work | PARTIAL | Exact-run checks and artifact links, including retained runs outside the recent list. Independent-verifier provenance and event content reader unavailable |
| Delegation UX | PARTIAL | Explicit MyFactory sample; producer labels from real result contracts. Canonical Sofie-direct/MyFactory/Relay route projection remains unavailable |
| Failure / recovery | PARTIAL | Network, service, session, stale decision, failed execution and retry states qualified. No claim of autonomous Factory recovery or custody handling |
| Onboarding | PASS | Progressive introduction, first assignment, memory and approval boundaries |
| First work | PASS | Draft creation, criteria/context, retained failed form, stable idempotency retry, conversation draft handoff |
| Feedback | PARTIAL | Helpful/unhelpful Result contract and contextual correction. General Work feedback remains conversation-based; no new learning backend |
| Desktop | PASS | 1440×1000 browser journeys and screenshot review |
| 390px mobile | PASS | 390×844 journeys, overflow checks, settled navigation, decision controls and composer |
| Accessibility | PASS | 23 axe scans with zero WCAG 2 A/AA and 2.1 AA violations; skip/focus checks and mobile Escape restoration. Not a formal accessibility certification |
| Component/application tests | PASS | 1,101 passed; 40 existing skips across 3 skipped suites |
| Root application tests | PASS | 135 passed |
| Browser journeys | PASS | 12 passed: six scenarios at each viewport; API responses / sample adapter are fixtures |
| Typecheck | PASS | Both workspaces; capability registry, skill routing, executor governance and builder manifest checks |
| Production build | PASS | Both workspaces; unchanged Builder build reused its valid cache |
| README updated | PASS | Product guide, audit, Digital Worker UX boundary and this dossier linked |

## What was exercised

The sample golden journey covers new owner → introduction → first Work draft →
Sofie planning handoff → working/delegated example → Needs you → Result → Proof
of Work → feedback → simulated next-day Today/Daily Brief. Preview actions make
zero live API writes; their persistence is confined to browser session storage.

The live-adapter UI journey uses the real production Next/React build and
synthetic signed owner authentication, with browser-intercepted API payloads.
It checks the request contracts for goal creation, approval binding, result
feedback, and automatic context transfer into the existing unsent chat composer.
Model/Eve requests are blocked. No cloud/provider/database credentials are loaded.

Adversarial cases cover per-resource 503 failures, missing session responses,
expired and stale approvals, feedback save failure/retry, slow loading, empty
state, last-visit timestamps, first-work idempotency, exact historical-run evidence,
linked failed execution navigation, and both appearance modes.

The harness uses an isolated production server with synthetic auth configuration.
Script login omits Origin because Next's loopback production origin comparison
rejects the numeric host Origin header in this setup. Only the harness relaxes the
secure-cookie flag for HTTP loopback. Production authentication is unchanged;
these checks do not qualify production ingress or real write authorization.

## Evidence

- [Browser report](../../../output/playwright/beta-product-experience/report.json)
- [Accessibility scans](../../../output/playwright/beta-product-experience/accessibility.jsonl)
- [Browser log](browser.log), [application tests](application-tests.log), [root tests](root-tests.log)
- [Typecheck and governance](typecheck.log), [workspace build](build.log)
- [Initial audit](AUDIT.md), [all initial worktree SHAs and dirty states](worktrees.json)

| Screen | Desktop | 390px |
| --- | --- | --- |
| Today | [Screenshot](../../../output/playwright/beta-product-experience/desktop-today.png) | [Screenshot](../../../output/playwright/beta-product-experience/mobile-today.png) |
| Introduction | [Screenshot](../../../output/playwright/beta-product-experience/desktop-onboarding.png) | [Screenshot](../../../output/playwright/beta-product-experience/mobile-onboarding.png) |
| First work | [Screenshot](../../../output/playwright/beta-product-experience/desktop-first-work.png) | [Screenshot](../../../output/playwright/beta-product-experience/mobile-first-work.png) |
| Delegated work example | [Screenshot](../../../output/playwright/beta-product-experience/desktop-delegated-work.png) | [Screenshot](../../../output/playwright/beta-product-experience/mobile-delegated-work.png) |
| Needs you | [Screenshot](../../../output/playwright/beta-product-experience/desktop-needs-you.png) | [Screenshot](../../../output/playwright/beta-product-experience/mobile-needs-you.png) |
| Result and proof | [Screenshot](../../../output/playwright/beta-product-experience/desktop-result-proof-feedback.png) | [Screenshot](../../../output/playwright/beta-product-experience/mobile-result-proof-feedback.png) |
| Daily Brief | [Screenshot](../../../output/playwright/beta-product-experience/desktop-daily-brief.png) | [Screenshot](../../../output/playwright/beta-product-experience/mobile-daily-brief.png) |
| Conversation draft | [Screenshot](../../../output/playwright/beta-product-experience/desktop-conversation-draft.png) | [Screenshot](../../../output/playwright/beta-product-experience/mobile-conversation-draft.png) |
| Failure / recovery | [Screenshot](../../../output/playwright/beta-product-experience/desktop-failure-recovery.png) | [Screenshot](../../../output/playwright/beta-product-experience/mobile-failure-recovery.png) |

Additional images cover empty Today, partial outages, expired session, dark theme,
and the [settled mobile navigation drawer](../../../output/playwright/beta-product-experience/mobile-navigation.png).
All depicted people, messages, outcomes, decisions and costs are synthetic.

## Reproduce

From the dedicated worktree with Node 24 and Chrome installed:

```sh
npm ci
npm run typecheck
npm run test --workspace=eve-agent
npm test
npm run build
npm install --prefix /tmp/myeve-beta-accessibility --no-save axe-core@4.13.0
node apps/eve/test/owner/local-server.cjs
```

In another terminal, run:

```sh
MYEVE_OWNER_EVIDENCE_DIR=/tmp/myeve-beta-reproduction \
  npm exec --workspace=eve-agent playwright -- test -c test/owner/playwright.config.ts
```

The test server binds only `127.0.0.1:3091`. Stop that process after testing. It
inherits only PATH/HOME/TMPDIR and its synthetic test auth values, not provider or
database credentials. To use a different axe installation, set `MYEVE_AXE_PATH`.
Use a fresh `MYEVE_OWNER_EVIDENCE_DIR` for reproduction to preserve the accepted
evidence. Without the override, test output goes to
`output/playwright/beta-product-experience`.

## Release gates left open

No Factory, Relay, protected verifier, writer custody, execution routing,
canonical Current Truth, Memory backend, or database migration changed. No live
WorkOrder was sent, no production action was approved, and no deployment or merge
was performed. The dedicated branch remains a reviewable local deliverable.

Before a real unattended beta: integrate the canonical engineering Work projection
with its owner, qualify real provider/verification provenance, run authenticated
owner/database/agent execution E2E, and supply the missing brief feeds. See
[Digital Worker UX integration](../../digital-worker-ux.md) for exact boundaries.
