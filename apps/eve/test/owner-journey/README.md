# Deterministic owner journey qualification

This harness runs real owner login, Eve context assembly, model admission, executable tools, canonical Work, PostgreSQL authority/accounting, signed Result ingestion and browser readback. Model output and Factory transport/results are deterministic synthetic fixtures. It cannot qualify a real producer, hidden verifier, paid execution or deployment.

From `apps/eve`, with disposable PostgreSQL 17 at the exact local fixture URL:

```sh
MYEVE_EXTERNAL_ALPHA_TEST_DATABASE=postgresql://ux_fixture:local-only@localhost:55491/blocker_fixes node --import tsx test/owner-journey/runner.ts
# Wait for Next 3183 and Eve 3185, then warm /api/auth/status.
MYEVE_OWNER_JOURNEY=1 npx playwright test -c test/owner-journey/playwright.config.cjs
```

Install the Playwright-managed Chromium browser first. The runner copies source into a temporary directory, never reads deployment `.env` files, uses synthetic keys, denies non-fixture external transport and drops its random test database on SIGINT/SIGTERM. Restart the runner before each clean-owner test. Ports 3183–3185 must be free.

The test follows login → Today → Sofie creation → Work resume → original conversation continuation → one Factory dispatch → signed private candidate → scheduled reconciliation → Result/Proof → Needs You private acceptance → completed Work → original conversation “What did you change?” → browser reconnect. Both conversation handoffs use the visible Sofie navigation and assert the original thread identity.

The post-dispatch acknowledgment and exact Result readback use retained canonical records without a model operation. Acceptance leaves the original PARTIAL Proof unchanged; a separate bound owner decision establishes private completion. Assertions require one Work, authority, execution, Result and acceptance, zero publication and unresolved model operations, and unchanged deterministic model call count during readback. No real paid provider is reachable.

Desktop and 390px completion captures include accessibility checks and provenance sidecars. Source changes mark captures non-authoritative until the committed candidate is rerun. The fixture owner identity and fixture file digests are retained with each capture; no tester identity or data is used.
