# Product blocker regression tests

These tests use the real Eve UI, authenticated-owner routes, file services and an
isolated local PostgreSQL database. Only the Neon HTTP transport and private Blob
provider are replaced by local fixtures. Model requests are intercepted before
execution. The harness rejects non-local database URLs and outbound network access.
It never loads a Vercel environment or model/provider credentials.

1. Install workspace dependencies with `npm ci` and make Chrome available.
2. Create a disposable local PostgreSQL database named `blocker_fixes`, apply the
   repository migrations, and configure the synthetic Sarah/Ava owner fixtures.
   For this qualification it was restored from the preserved acceptance dump.
3. From `apps/eve`, run:

   ```sh
   MYEVE_TEST_DATABASE_URL=postgresql://localhost:55473/blocker_fixes node test/browser/local-server.cjs
   ```

4. In another shell, from `apps/eve`, run:

   ```sh
   npx playwright test -c test/browser/playwright.config.cjs
   MYEVE_TEST_DATABASE_URL=postgresql://localhost:55473/blocker_fixes node --import tsx test/browser/owner-isolation.ts
   ```

The browser suite expects the server log at
`output/playwright/product-acceptance-fixes/server.log` to check for secret-value
leaks. Redirect server stdout/stderr there when launching it. The existing
acceptance configuration enables all ten navigation destinations and nineteen
settled Manage options. Tests make normal taps/clicks, never forced clicks.

File contents are synthetic and stored only in the local Blob fixture; metadata
persists in PostgreSQL. Restarting the fixture intentionally makes old objects
unavailable. The browser always uploads a fresh uniquely named file. Failed
uploads retain drafts and do not call the model. Cross-owner qualification reads
the browser-created record, never inserts a substitute file row.

The Agent retrieval check proves authorized content readback and the canonical
file identity/bytes in the intercepted Agent request. A grounded model answer is
still a separate, unqualified gate.

## Eve 0.66 durable-session qualification

Run `eve-session.spec.cjs` only against an **isolated source copy**, using the
same disposable database and `local-server.cjs` transport. Copy
`test/browser/eve-session-fixture.ts` to that copy's `agent/agent.ts`, and
`test/browser/eve-approval-fixture.ts` to its
`agent/tools/migration_approval_probe.ts`, then restart the dev server. Never
replace these files in a deployment checkout.

The deterministic model changes only model output; the actual Eve compiler,
session service, auth, dynamic tools, application hooks, database, React client,
and persistence still run. The approval probe has no external effects. Run:

```sh
MYEVE_SESSION_FIXTURE=1 npx playwright test -c test/browser/playwright.config.cjs
```

The four additional scenarios cover first send, follow-up on the same session,
reload without duplicate replies, structured questions, approval after reload,
and a single durable cancellation followed by another message. Voice first-send,
resume, and cancellation-during-creation are covered by `lib/voice/dispatch.test.ts`.
Browser tests alone do not qualify a real microphone, phone call, or cloud Computer.

Use `localhost` (not a numeric host) in the fixture's database URL: Next wraps
fetch and parses Neon's derived API hostname before the test adapter runs.
Existing schema upgrade suites have their own explicit loopback database guards.
The mobile test warms routes to avoid development Fast Refresh replacing a
page between taps, and tolerates asynchronous count badges in Manage labels.
