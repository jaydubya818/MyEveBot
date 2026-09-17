# MyEve operations runbook

## What is monitored

Manage → System is the operator source of truth. The Operations section reports failed turns, stuck work and Agent Runs, orphaned Computer sessions/actions, routine and review-delivery failures, model/runtime limits, and artifact failures over a rolling 24-hour window. A five-minute schedule expires stale Computer sessions, times out abandoned actions, and fails Runs that exceeded their declared runtime boundary.

Set `MYEVE_ALERT_WEBHOOK_URL` to a private operator webhook to receive deduplicated warning or critical summaries. Payloads contain only signal names, counts, and state; they do not contain prompts, credentials, or artifact contents.

Run production canaries after every deployment:

```sh
MYEVE_SMOKE_BASE_URL=https://YOUR_DEPLOYMENT \
MYEVE_SMOKE_PASSWORD=YOUR_OWNER_PASSWORD \
npm run smoke:production --workspace=eve-agent
```

The core canary verifies authenticated chat, Goals, Results, routines, and operations. The browser canary verifies automatic isolated-session provisioning, rendered navigation/read, exact URL citation, and clean shutdown.

## Incident response

1. Confirm the production alias and deployment in Vercel, then inspect Manage → System and the five-minute schedule logs.
2. Classify impact: owner access, false completion, unauthorized capability expansion, duplicate consequential action, data loss, or isolated service degradation.
3. For an active safety or isolation issue, disable the affected integration or roll back immediately. Do not wait for a root-cause diagnosis.
4. Preserve deployment logs, failing session/Run identifiers, timestamps, and redacted evidence. Never copy credentials or private artifact content into an incident record.
5. Run the production canaries against the rollback target. Restore traffic only when the affected flow and the general health checks pass.
6. Record the cause, user impact, timeline, corrective action, and a deterministic regression test.

## Rollback triggers

Roll back for cross-owner access, false completion, delegation that expands permissions, duplicate external writes, unrecoverable Computer orphans, repeated production turn failures after one retry, or any corruption/loss of owner data. A single provider outage with correct fail-closed behavior may remain deployed while the provider recovers.

Use the prior known-good Vercel production deployment. Promote it to the production alias, verify `/api/readiness`, run both production canaries, and confirm no new critical Operations signals appear. Database migrations in this release are additive; never reverse a migration until compatibility with the restored application is verified.
