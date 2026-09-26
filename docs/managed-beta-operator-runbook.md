# Managed beta operator runbook

## Current release state

Managed provisioning is disabled by default. Keep it disabled until the live qualification gates in `managed-beta-control-plane.md` pass. The public `/beta` page explains the managed path and keeps the existing BYO Vercel Builder available as an advanced path.

## Control-plane setup

Use a **separate** Postgres database for the Builder control plane. Apply `apps/builder/managed/001_control_plane.sql` with `psql -v ON_ERROR_STOP=1` or run `apps/builder/managed/migrate.ts` with `MANAGED_EVE_DATABASE_URL` configured. Back up this database before schema changes. It contains tester emails, resource identifiers, audit events, and encrypted Relay invitation URLs; it never contains Eve access passwords.

Configure these Builder server-side variables only in the deployment environment:

| Variable | Purpose |
| --- | --- |
| `MANAGED_EVE_DATABASE_URL` | Control-plane Postgres, separate from every Eve database |
| `MANAGED_EVE_INVITE_KEY` | 32 random bytes encoded as base64url for Relay invitation encryption |
| `MANAGED_EVE_ADMIN_TOKEN` | Random operator bearer token, at least 32 characters |
| `MANAGED_EVE_VERCEL_TOKEN` | Operator Vercel token scoped to the beta account/team |
| `MANAGED_EVE_VERCEL_TEAM_ID` | Team scope if managed projects live in a Vercel team |
| `MANAGED_EVE_RELAY_FINGERPRINT` | Operator-reviewed production Relay signing-key SHA-256 fingerprint |
| `MANAGED_EVE_PUBLIC_ORIGIN` | Exact public Builder origin, such as `https://myeve-builder.vercel.app` |
| `MANAGED_EVE_MAX_ACTIVE` | Maximum reserved beta slots; defaults to 5 |
| `MANAGED_EVE_PROVISIONING_ENABLED` | Set to `true` only after qualification |
| `CRON_SECRET` | Random secret of at least 32 characters; Vercel sends it to the daily monitor as a bearer token |
| `MANAGED_EVE_RETIREMENT_ENABLED` | Separate retirement switch; leave unset until scoped deletion passes a disposable live test |

Never put the operator token, Vercel token, invite encryption key, or tester password in a browser URL, issue, chat, or repository. Rotate the invitation key only with a migration plan for existing encrypted invitations.

## One tester

1. Confirm an available slot and agree on a monthly AI Gateway budget. Issue a private Relay production signup invitation for that tester's email through Relay's governed operator flow.
2. From an operator terminal, `POST /api/managed/invites` with `Authorization: Bearer <admin-token>` and JSON containing `email`, `relayInviteUrl`, and `monthlyModelBudgetUsd`. Send only the returned `/join?invite=...` link to that email through the approved invitation channel. The link expires after seven days and can be claimed once.
3. The tester opens Relay signup from the join page, sets an Eve password in the join form, and waits for deployment and health verification. The Builder creates a new opaque-named Vercel project and Neon database, sets and confirms the project AI Gateway budget before deploying, then pins the approved Relay key.
4. `GET /api/managed/environments` with the admin bearer token. Check `project_id`, `database_store_id`, `public_url`, `state`, `last_health_status`, and `modelBudgetStatus`. A missing or unavailable budget is not zero spend or a pass.
5. `POST /api/managed/environments/{id}/health` with the admin bearer token. This checks the exact recorded project ID, the budget and spend record, and the Eve health endpoint. Investigate any non-200 result before inviting another tester.
6. The owner signs in, opens Manage → Your data, downloads the archive, and retains it. The operator checks the archive and records its filename, byte size, SHA-256, and owner confirmation through `POST /api/managed/environments/{id}/export`. The archive is never uploaded to the control plane.

`POST /api/managed/environments/{id}/lifecycle` with `{ "action": "pause" }` or `{ "action": "resume" }` operates only on the project ID bound to that managed environment. Resume requires the paused state. A project-state API error requires manual inspection before retrying.

`POST /api/managed/environments/{id}/upgrade` upgrades only a ready, builder-owned project whose Vercel project ID matches the environment record. It preserves Eve secrets and storage connections. The response is a deployment ID, not proof of a healthy upgrade. Poll `POST /api/managed/environments/{id}/deployment` until the new deployment passes the Eve health check and returns `ready`. If the upgrade route reports an uncertain state, inspect the exact project and deployment in Vercel before retrying.

The daily Vercel cron calls `GET /api/managed/monitor` with `Authorization: Bearer <CRON_SECRET>`. The endpoint is inert while provisioning is disabled. Once enabled, it checks ready Eves for project identity, model budget, and health, and advances deployments still awaiting verification. It records an alert for each failure and returns HTTP 503 when an environment needs attention. Inspect the environment and its event log; the cron is not an automatic repair mechanism. Vercel cron is best effort, so also check the latest health timestamps in the operator view.

After the owner has downloaded and checked an archive, pause the exact environment and confirm its Vercel project is paused. For a disposable live qualification environment, set `MANAGED_EVE_RETIREMENT_ENABLED=true` and call `POST /api/managed/environments/{id}/retire` with the admin bearer token and the exact JSON below. The export must have been verified within 24 hours. The endpoint checks the recorded project identity, dedicated Neon ownership and connections, then disconnects and deletes that Neon resource, deletes the project, verifies both disappear, and records each step. If a step fails, inspect the recorded IDs and Vercel resources before retrying the same environment; the `retiring` state supports resumption. Keep the retirement switch off for tester environments until that disposable test is complete.

```json
{
  "confirmProjectName": "myeve-beta-<opaque-environment-suffix>",
  "confirmDatabaseStoreId": "<exact-recorded-store-id>",
  "exportSha256": "<exact-verified-archive-sha256>",
  "confirmPermanentDeletion": true
}
```

## Release and incident gates

- A managed Eve has **no binary-producing features** in the first profile because the current owner archive does not include binary file contents. Do not turn those features on until export coverage is complete.
- AI Gateway's project budget is a soft cap for the request that crosses it. Set a separate Vercel team infrastructure spend limit and monitor both. A project budget applies to project OIDC requests; verify the deployed Eve actually uses that identity with a model call before launch.
- Do not run a blind retry after a provisioning failure. The record may already own a project or Neon store. Compare recorded IDs with Vercel resources, then recover the exact environment.
- Do not retire a real tester environment before the disposable live qualification proves both the Vercel project and dedicated Neon resource are gone. Keep `MANAGED_EVE_RETIREMENT_ENABLED` unset until then.
- Do not represent Relay registration or agent conversation as complete until a live Ava/Sofie exchange and one approved memory share have been observed. Denied unauthorized sharing must also be observed.

## Qualification before invitations

Use a disposable tester email and resources. Verify issuance, replay denial, capacity, isolated project and database creation, model budget, Eve sign-in, owner export, Relay pairing, agent-written two-way exchange, approved and denied memory sharing, upgrade preserving credentials, and complete deletion. Capture exact resource IDs and final states. Keep provisioning disabled in production until these checks pass.
