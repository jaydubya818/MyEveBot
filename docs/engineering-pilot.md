# Engineering preparation pilot

This branch implements an internal, personal-owner preparation slice of the [engineering plan](plans/2026-09-25-feat-myeve-engineering-plan.md). It is not the managed organization edition or an autonomous repository-to-PR product.

## Available

- `/work`: create bounded Work with a repository name, objective, cost/runtime intentions and 1–20 acceptance criteria.
- Scope-separated persistence, retry-safe creation, optimistic version checks and durable activity.
- Versioned criteria with protected-test or human-assessment requirements; inspect earlier versions.
- Human takeover, return to the Agent queue, pause, cancellation and explicit reopen paused.
- An owner-only `engineering_work` tool for list, inspect, create and criteria revision. It cannot grant repository access, spend, execute code, publish, mark evidence verified or accept a Result.
- Existing Relay messaging with explicitly approved public profiles and both local and Relay authority. The incoming inbox now retains received messages across approval/completion states.

The execution/readiness panel deliberately reports unavailable. Cost and runtime values are recorded intentions, not implemented executor budgets. Returning Work to the queue does not start a worker.

## Local setup

Use Node 24 and the repository's installed dependencies. Configure a development PostgreSQL database and owner credentials in `apps/eve/.env.local`; never point qualification tests at production. Apply the ordered migration chain, including `0036_engineering_work.sql` and `0037_app_settings.sql`.

```sh
npm run db:migrations:check
npm run db:migrate
```

Set `MYEVE_ENGINEERING_MODE="dogfood"`. This requires actual owner sign-in even in development. Leave it empty for normal deployments. Run the Eve application, sign in, then open `/work` or the Work link in chat navigation. No organization identity or membership is inferred from this shared-owner login.

The database integration test refuses non-loopback hosts and any port other than 55468. Provide a disposable PostgreSQL 18 instance at `postgresql://postgres@127.0.0.1:55468/postgres`; the test creates and removes only its randomly named database:

```sh
cd apps/eve
node --import tsx test/engineering-work.integration.mjs
```

## Limits and next gates

The Work and history views currently return the newest 100 records/versions/events. Earlier data remains stored. Work data is exportable through the personal owner-data registry; restore and deletion remain unavailable until retention/cleanup semantics are implemented. Disabling dogfood mode hides the feature and retains its data.

No coding executor, GitHub installation, independent verifier, candidate artifact, durable job dispatcher, draft-PR publisher, CI/review loop, organization membership or production cleanup flow is attached. These remain implementation work, not settings that make this branch production-ready. Do not introduce automatic execution into the preparation service; future attempts must use the approved admission, Action, budget and recovery design.

Relay qualification used isolated Sofie and Atlas instances with real model calls and synthetic public profiles. It does not certify the user's existing deployed agents or production Relay/KMS configuration. See the [test dossier](verification/2026-09-25-engineering-pilot/README.md).
