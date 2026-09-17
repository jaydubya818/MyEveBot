# Production operations

This is the operator runbook for MyEve's single-owner production deployment. The authenticated **Manage → System** view is the first stop: it shows provider readiness, browser availability, six 24-hour reliability signals, and schema canaries for Chat, Browser, Goals, Results, and Routines. An inactive browser is normal; **Available on demand** means its isolated runtime will be provisioned by the first browser action.

## Monitoring and alerts

The operator view monitors failed Agent Runs, stuck Agent and delegated Runs, failed/expired Computer sessions, failed routine deliveries, resource-limit failures, and failed artifact transfers. Canary failures or critical signal counts are release blockers. Configure the hosting platform to alert on application errors containing `[operator-alert]` and on repeated 5xx responses from `/api/readiness`, `/api/operator-health`, or `/api/cron/computer-cleanup`.

The authenticated operator endpoint is `GET /api/operator-health`. It never returns credentials or cross-owner records. Vercel calls `GET /api/cron/computer-cleanup` every ten minutes using `CRON_SECRET`; this cadence requires a Vercel plan that supports sub-daily cron. The job expires over-time sessions and fails provisioning or running sessions that have stopped advancing. Provisioning has a two-minute grace period and running browser actions have a five-minute stale threshold.

## Release canary

Before promotion and after production deploy:

1. Confirm `/api/readiness?fresh=1` reports required services ready and **Isolated browser: Available on demand**.
2. In a new chat, ask for a small browser-research task against a public site. Confirm the first navigation creates an isolated Computer session, the page is read, the response cites the page, and the session is stopped.
3. Create and complete a disposable Goal; verify it appears in Goals and Activity.
4. Complete a bounded work Run with one small text artifact; verify it appears in Results and can be opened.
5. Test a paused disposable routine once; verify one run-history record and no duplicate side effect.
6. Remove the disposable Goal, Result, routine, and session evidence allowed by retention policy.

Do not use a live customer account, credentials, a purchase, or any consequential external action for a canary.

## Incident and rollback

Stop promotion immediately for cross-owner access, false completion, permission expansion, a duplicate consequential action, or an unrecoverable Computer orphan. Pause affected routines and stop active Computer sessions first. Preserve redacted IDs, timestamps, failure codes, and deployment identity; never copy tokens, cookies, typed form values, or secrets into the incident record.

Rollback the application to the last production deployment that passed the full release canary. Re-run database compatibility checks before rollback because migrations are additive and are not rolled back with application code. After rollback, run fresh readiness and operator checks, repeat the five product canaries, and keep the incident open until stale sessions are closed and no duplicate external action is possible.

For a browser incident, classify the failure before acting: provisioning failure, authentication required, network-policy block, browser timeout, or browser unavailable. Authentication requires owner takeover; a policy block permits only the exact required public hostname; a timeout can be retried once in a fresh session; runtime unavailability is a release blocker.
