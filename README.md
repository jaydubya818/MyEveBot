# MyEve

MyEve is a deployable personal-agent platform. Sofie is the reference agent instance; MyEve Builder lets anyone name, configure, deploy, and own a persistent personal AI in their own Vercel account. Relay is the internal governed capability layer that connects one or more authorized agents to the owner's digital world. Built on the durable [eve framework](https://eve.dev) with a Next.js chat UI styled with Whop's [Frosted UI](https://github.com/whopio/frosted-ui) design system.

Each deployment serves one owner by default for a simple security boundary. Code and data remain owner-scoped and agent-neutral so a future Relay capability plane can authorize a primary agent, specialists, and additional agents without renaming product concepts or rebuilding integrations.

## What it does

**Chat**

- **Web chat** — threads (rename/pin/delete), streaming responses, file attachments, slash-command prompts, model picker, and HTML artifact previews.
- **Command palette (⌘K)** — jump to threads, start a new chat, open goals or reviews, open the manage page, toggle notifications.
- **Full-text search** — sidebar search matches message content across all threads, not just titles.
- **Message actions** — copy a reply, edit & resend, regenerate the last reply, or fork a thread from any message.
- **Telegram channel** — private-DM-only bot with a user-id allowlist.

**Proactive**

- **Reminders & schedules** — ask Eve for one-off or recurring (cron) reminders; they fire into a new thread.
- **Event triggers** — Eve can mint webhook URLs so external services can start conversations.
- **Push notifications** — browser web-push for proactive threads, plus unread indicators in the sidebar.

**Agent capabilities**

- **Goal OS** — persistent goals, versioned plans, milestones, tasks, dependencies, progress, Focus, and explainable next actions.
- **Outcome loop** — first-class effectiveness outcomes linked to goals, tasks, runs, and evidence; explicit owner feedback stays separate from execution status.
- **Daily brief and weekly review** — deterministic priorities, due work, blockers, completion, stalled-work, and dependency/capability risk signals from persisted state. Owner-controlled schedules create durable, deduplicated checkpoints and deliver them in-app or through a configured Web Push or Telegram channel.
- **Long-term memory** — Supermemory-backed remember/forget/search tools with nightly consolidation and a profile summary injected each turn.
- **App integrations** — Composio connections (Gmail, GitHub, Notion, Linear, …) with a UI to connect/disconnect apps.
- **Chat-created skills** — Eve can write, list, and delete her own skills at runtime; manage them from the UI.
- **File sharing** — Eve uploads sandbox files to Blob storage and hands back a public link.
- **Receipt tracking** — log/query/summarize spending, backed by Neon.
- **Browser control** — sandboxed browser extension for web tasks.

**Review page** — `/review` generates the owner’s daily brief or weekly review and exposes recent outcome feedback.

**Manage page** — `/manage` shows review schedules and delivery history, reminders (with run history), webhooks, memories, connections, and skills in one place.

**MyEve Builder (`apps/builder`)** — create a named personal agent and deploy it into **your** Vercel account, then update it later when the template changes:

- **Create** — wizard for name, personality, capabilities, channels, custom cron jobs, and editable generated instructions; one click deploys into the owner's Vercel account.
- **Template** — the live `apps/eve` source, assembled at deploy time with feature pruning, so the personal agent and the product never drift. A manifest completeness check fails CI if a new tool isn't mapped to a feature.
- **Deploy** — Vercel REST API with the user's token: create project → set env vars → deploy inline files → stream build status → health check. Keys pass through in memory and are never stored; VAPID push keys are generated automatically; models bill to the deployer's own AI Gateway (no provider keys). Telegram webhooks register automatically when a bot token is provided.
- **Update** — each deployment is stamped with a template version (content hash), a monotonic release from `apps/eve/.eve-template-release` (bump that file when shipping changes agents should pick up), and an `eve-builder.json` manifest. When the builder's release is higher, the agent's `/manage` page shows an update banner that deep-links to the builder's `/update` page (not shown on the create home). The owner pastes their Vercel token and clicks once: the builder reads features, instructions, and custom schedules back from the deployed files, reassembles them on the latest template, and redeploys into the same project. Env vars, VAPID keys, storage, chat history, memories, skills, and the URL are preserved. Agents that predate the manifest need one Create-tab redeploy into the existing project before Update is available.

## Structure

```
apps/eve/         # the agent app (also the builder's deploy template)
  agent/          # eve agent: channels, tools, skills, schedules, instructions
  app/            # Next.js web chat UI + API routes (threads, search, update-check, …)
  components/     # UI components (Frosted UI design system)
  lib/            # Neon-backed stores (threads, push), Composio connect, web auth
apps/builder/     # the eveclaw agent builder
  app/            # create/update UI + API routes (deploy, update, template-version, …)
  components/     # wizard + update flow
  lib/            # Vercel API client, feature manifest, assembler, generators
  scripts/        # manifest completeness check, manual smoke deploy
```

The Next.js app mounts the agent on the same origin via `withEve` — `/eve/v1/**` routes to the agent service. One dev server, one Vercel deployment.

## Getting started

Requires Node 24.

```bash
npm install
cp apps/eve/.env.example apps/eve/.env.local   # then fill in values
npm run dev   # turbo runs next dev for apps/eve on localhost:3000
```

`next dev` automatically boots the eve agent backend and proxies to it. Wait for `[eve:dev] server listening at ...` before chatting.

### Environment

See [`apps/eve/.env.example`](apps/eve/.env.example) for the full annotated list. The essentials:

| Variable | Used for |
| --- | --- |
| `MYEVE_ACCESS_PASSWORD`, `MYEVE_SESSION_SECRET`, `MYEVE_OWNER_ID` | Single-owner production web access |
| `OWNER_TIMEZONE` | Default IANA timezone for owner-facing review schedules |
| `DATABASE_URL` | Neon Postgres (threads, goals, outcomes, reviews, reminders, webhooks, receipts, push) |
| `SUPERMEMORY_API_KEY` | Long-term memory |
| `COMPOSIO_API_KEY` | App integrations |
| `BLOB_READ_WRITE_TOKEN` | File sharing + skill store |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web push notifications |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET_TOKEN`, `TELEGRAM_ALLOWED_USER_IDS`, `TELEGRAM_PROACTIVE_CHAT_ID` | Telegram channel and explicit proactive destination (optional) |

Before starting a deployed app, apply the checked-in database migrations:

```bash
npm run db:migrate
```

Migrations are ordered, checksum-protected, and safe to rerun. Apply them to local, preview, and
production databases before the matching application release. Existing runtime table guards remain
temporarily for backwards compatibility; new schema changes must be added under
`apps/eve/migrations/` instead of application startup code.

Preview deployments use the same fail-closed owner authentication as production. Configure
`MYEVE_ACCESS_PASSWORD`, `MYEVE_SESSION_SECRET`, and `MYEVE_OWNER_ID` for the Vercel Preview
environment before qualification; do not weaken the auth boundary to make a preview testable.

## Scripts

- `npm run dev` — dev servers (agent app on :3000, builder on :3100)
- `npm run build` — production build
- `npm run db:migrate` — apply pending database migrations
- `npm run db:migrations:check` — validate migration order and files without a database
- `npm run typecheck` — TypeScript checks + builder manifest completeness
- `VERCEL_TOKEN=… DATABASE_URL=… npx tsx apps/builder/scripts/smoke-deploy.ts` — manual end-to-end deploy test (creates and deletes a real project)

## Deploy

Deployed to Vercel; the agent service is bundled into the same deployment and routed under `/eve/v1/**`.
