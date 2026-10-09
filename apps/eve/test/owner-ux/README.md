# Isolated owner UX qualification

This fixture uses a disposable PostgreSQL 17 database on **localhost:55491**, named `blocker_fixes`, with synthetic role `ux_fixture`. It does not load Vercel environments or live credentials. Its transport rejects non-local fetch/HTTP destinations, except the local private-Blob adapter. No model message is sent by the shell or isolation suites.

From `apps/eve`, with the disposable cluster running:

```sh
export MYEVE_TEST_DATABASE_URL=postgresql://ux_fixture:local-only@localhost:55491/blocker_fixes
node --import tsx test/owner-ux/setup.ts
node test/owner-ux/local-server.cjs
```

In another shell:

```sh
npx playwright test -c test/owner-ux/playwright.config.cjs
```

The clean owner starts with no seeded Work, Goals, files or conversations. Opening Sofie initializes its ordinary primary Agent. Isolation tests temporarily create records owned by a second synthetic account and delete only those exact fixture IDs afterward. Historical records are not removed from a real owner.

Baselines cover settled alpha routes at desktop and 390px. Layout and axe checks also run at 1024px and 768px. Fixed browser time and settled-content assertions prevent accepting a spinner as a page baseline. Baselines are generated on macOS Chrome; other browser/OS combinations need their own reviewed baseline set.
