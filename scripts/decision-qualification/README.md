# Local Decision Intelligence qualification

These helpers are developer tests, outside the deployed Eve template. They must never use shared databases or real provider credentials.

1. Install `pg`, `playwright`, and `@axe-core/playwright` in an isolated temporary tools directory. Set `JEV_QA_TOOLS` to it; Chrome must be available.
2. Initialize local PostgreSQL on loopback port 55449, database `jev_v0`, user `jev_fixture`. Start `services.mjs` with `JEV_QA_DATABASE=postgresql://jev_fixture@127.0.0.1:55449/jev_v0` and `DATABASE_URL=postgresql://jev_fixture@jev-db.local:55449/jev_v0`.
3. Use `NODE_OPTIONS=--import=<absolute-path>/preload.mjs` for migrations, app startup and `knowledge.mts`. It directs the Neon HTTP transport to local PostgreSQL, stubs existing Gateway model calls, and rejects evaluation-model and all other external fetch requests. Apply only the repository's existing migrations to this empty database.
4. Generate fake evidence with `npm run decision:evaluate --workspace=eve-agent -- --fixture --output <temporary-directory>`. Start Eve on loopback port 3217 with that `MYEVE_DECISION_EVIDENCE_DIR`, `MYEVE_OWNER_ID=decision-fixture`, and the synthetic Gateway credential `local-qualification-only`. Do not enable Jev.
5. Run `browser.mjs` for desktop/mobile, axe, keyboard, navigation and Chat. Optional `JEV_QA_SCREENSHOTS` must name an existing directory. Run `states.mjs` separately for intentionally injected loading/error/empty/retry behavior.
6. Run `knowledge.mts` from repository root with `node --import tsx`, `TSX_TSCONFIG_PATH=apps/eve/tsconfig.json`, the fake database URL and preload. It tests actual PostgreSQL persistence, owner isolation and canonical Forget for all seven types.
7. `assemble.mts` writes a Sarah/Ava template to `JEV_QA_GENERATED` under `/private/tmp`. Build with no provider configuration. Reuse the qualified dependency installation **with its original root/app nesting**; flattening different OpenTelemetry versions is invalid. All three builds use the preload and no credentials.
8. Stop application/proxy/PostgreSQL processes afterward. Keep logs, screenshots, generated source, database files and run artifacts outside Git. No live benchmark command is exposed by these helpers.

## V0.5 cohorts

Use the same CLI with `--fixture --experiment CHALLENGE_SEVEN` (or `V0_REPRODUCTION`, `STANDARD_SIX`, `STANDARD_SEVEN`, `CHALLENGE_SIX`, `TAXONOMY_STRESS`). Use `node --import tsx apps/eve/scripts/decision-evaluate.ts` from the repository root when invoking directly. `--dry-run` prints bounded estimates without calling a provider. Store all artifact JSON outside Git, in the explicit `--output` directory.

Run `challenge-browser.mjs` after generating six/seven Challenge and Stress fixtures; it checks cohort selection, matched comparison, keyboard/filter/detail/history, primary/stress desktop/mobile and axe. The original `browser.mjs` selects the V0 fixture explicitly and checks the preserved view and Chat. See `docs/experiments/jev-v05/revision-02/stage1-report.md` for methodology and qualification. No helper grants live evaluation authorization.
