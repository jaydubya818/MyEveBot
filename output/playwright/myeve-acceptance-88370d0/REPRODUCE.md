# Reproducing the isolated acceptance run

The frozen source and PostgreSQL data remain under `/tmp/myeve-acceptance-88370d0` and `/tmp/myeve-acceptance-88370d0-pg`. A custom-format copy of the synthetic database is saved in `evidence/isolated-state.dump`. This dump is not a product backup/restore test.

The canonical source is `88370d0662c7824445b59779a8b8e8b21abfa10b`. Do not substitute the current working checkout. No source fixes were made for this run.

Start the dedicated database on its explicit port:

```sh
/opt/homebrew/opt/postgresql@17/bin/pg_ctl \
  -D /tmp/myeve-acceptance-88370d0-pg \
  -o '-p 55473 -h 127.0.0.1' \
  -l /tmp/myeve-acceptance-88370d0-pg.log start
```

From `/tmp/myeve-acceptance-88370d0/apps/eve`, use a scrubbed environment:

```sh
env -i PATH="$PATH" HOME="$HOME" USER="$USER" TMPDIR="$TMPDIR" \
  DATABASE_URL='postgresql://jaywest@localhost:55473/postgres' \
  OWNER_NAME=Sarah NEXT_PUBLIC_OWNER_NAME=Sarah NEXT_PUBLIC_AGENT_NAME=Ava \
  MYEVE_OWNER_ID=acceptance-sarah OWNER_TIMEZONE=America/Los_Angeles \
  NODE_OPTIONS='--import=/tmp/myeve-acceptance-88370d0/local-transport.mjs' \
  node node_modules/next/dist/bin/next dev --webpack --port 3073 --hostname 127.0.0.1
```

The harness blocks nonlocal fetch calls and adapts Neon HTTP queries to local PostgreSQL. Do not copy a shared `.env.local` into this snapshot. Successful model qualification requires a fresh model-only credential and a narrowly allowed model gateway transport; do not remove the database destination fence or enable unrelated providers.

Use `/chat`, `/goals`, `/knowledge`, `/results`, `/computer`, `/agents`, `/review`, `/channels`, `/files` and `/manage` at `http://localhost:3073`. Direct `/` is the introduction page, while the in-app Back to chat control can use the root URL with client state.

Browser evidence was captured with a dedicated Playwright session, `myeve-acceptance`, using the installed `@playwright/cli`. The action scripts appear verbatim inside the evidence text files. Start at1440×900, then390×844. Use synthetic data only.

The saved ZIP adversarial fixtures contain fake markers only. `harness/archive-cases.py` creates bounded variants; do not replace them with unbounded decompression bombs. `owner-backup-populated.zip` has SHA-256 `2de2d1341d5178b97de1da75c0c513ef7a9c7157f361a51cc8ea494430ed4872` and35 independently verified file checksums.

`harness/control-fixtures.mjs` uses canonical application functions to create explicitly labeled synthetic state; it is not proof of model execution. Re-running it creates additional fixtures. `isolated-pg-loader.mjs` redirects only the execution integration script's hardcoded local port to55473 and rejects unexpected targets.

Read `REPORT.md` and `COVERAGE.md` before interpreting raw logs. Selector errors, missing providers and product defects are distinguished there. Several raw automation files intentionally retain failed attempts.
