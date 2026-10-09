# Deterministic owner journey qualification

This harness runs real owner login, Eve context assembly, model admission, executable tools, canonical Work, PostgreSQL authority/accounting, signed Result ingestion and browser readback. Model output and Factory transport/results are deterministic synthetic fixtures. It cannot qualify a real producer, hidden verifier, paid execution or deployment.

From `apps/eve`, with disposable PostgreSQL 17 at the exact local fixture URL:

```sh
MYEVE_EXTERNAL_ALPHA_TEST_DATABASE=postgresql://ux_fixture:local-only@localhost:55491/blocker_fixes node --import tsx test/owner-journey/runner.ts
# Wait for Next 3183 and Eve 3185, then warm /api/auth/status.
MYEVE_OWNER_JOURNEY=1 npx playwright test -c test/owner-journey/playwright.config.cjs
```

Install the Playwright-managed Chromium browser first. The runner copies source into a temporary directory, never reads deployment `.env` files, uses synthetic keys, denies non-fixture external transport and drops its random test database on SIGINT/SIGTERM. Restart the runner before each clean-owner test. Ports 3183–3185 must be free.

The current test intentionally records an unsupported product boundary: after one Work dispatch, the shared spending fence blocks a paid conversational acknowledgment. It requires the exact retained `EXTERNAL_ALPHA_SHARED_FENCED` failure; a generic failure is insufficient. The fixture then delivers a signed private candidate and invokes the existing scheduled reconciliation path. Reconnect must retain one Work, authority, execution and Result.

The failed acknowledgment leaves a local unresolved reservation. The test also requires the exact subsequent `Unresolved exposure fences further admission` failure; it does not clear accounting state. Canonical Work/Proof remain readable. This is a regression reproduction of the blockers, not a successful conversational completion test.

The Needs You decision is a canonical pre-admission fixture. It is not a model-created post-result acceptance decision. A verified candidate remains PARTIAL. A passing **partial** integration test must never be reported as a passing full Golden Journey or owner acceptance/completion.
