# MyEveBot

[MyEveBot](https://github.com/jaydubya818/MyEveBot) is the source repository for MyEve, a deployable personal-agent platform. [Sofie](https://sofie-personal-agent.vercel.app) is the production reference agent; MyEve Builder lets anyone name, configure, deploy, and own a persistent personal AI in their own Vercel account. Relay is the internal governed capability layer that connects one or more authorized agents to the owner's digital world. Built on the durable [eve framework](https://eve.dev) with a Next.js chat UI styled with Cloudflare's [Kumo](https://github.com/cloudflare/kumo) components.

Each deployment serves one owner by default for a simple security boundary. Code and data remain owner-scoped and agent-neutral so a future Relay capability plane can authorize a primary agent, specialists, and additional agents without renaming product concepts or rebuilding integrations.

## Finding current priorities

Current product priorities and shipped foundations are tracked in the canonical [MyEve roadmap](docs/roadmap.md). Dated files under `docs/plans/` are historical implementation records, not the current backlog.

Maintainers can delegate scoped issues to [Foreman](docs/foreman.md), which turns GitHub and Linear issues into independently reviewed draft pull requests.

## What it does

**Chat**

- **Web chat** — threads (rename/pin/delete), streaming responses, file attachments, slash-command prompts, model picker, and artifact previews.
- **Artifact workspace** — create, revise, restore, comment on, and share versioned documents, spreadsheets, presentations, and other generated files.
- **Email and file views** — first-class inbox and file-library routes alongside chat, goals, reviews, and agent management.
- **Command palette (⌘K)** — jump to threads, start a new chat, open goals or reviews, open the manage page, toggle notifications.
- **Full-text search** — sidebar search matches message content across all threads, not just titles.
- **Message actions** — copy a reply, edit & resend, regenerate the last reply, or fork a thread from any message.
- **Messaging channels** — private Telegram DMs, Slack, routed iMessage, dedicated SMS/iMessage/voice, and browser-based realtime voice. Each channel fails closed when its required owner or provider configuration is absent.

**Proactive**

- **Reminders & schedules** — ask Eve for one-off or recurring (cron) reminders; they fire into a new thread.
- **Event triggers** — Eve can mint webhook URLs so external services can start conversations.
- **Proactive delivery** — browser web push, Telegram, email, phone, iMessage, and Slack destinations when configured, plus unread indicators in the sidebar.

**Agent capabilities**

- **Persistent Agents** — one protected primary personal Agent plus owner-created specialists with durable identity, instructions, lifecycle, model preferences, explicit Relay capabilities, risk/cost/runtime limits, direct chat, and run attribution. Secondary Agents fail closed instead of borrowing the primary Agent's tools.
- **Goal OS** — persistent goals, versioned plans, milestones, tasks, dependencies, progress, Focus, and explainable next actions.
- **Outcome loop** — first-class effectiveness outcomes linked to goals, tasks, runs, and evidence; explicit owner feedback stays separate from execution status.
- **Daily brief and weekly review** — deterministic priorities, due work, blockers, completion, stalled-work, and dependency/capability risk signals from persisted state. Owner-controlled schedules create durable, deduplicated checkpoints and deliver them in-app or through a configured Web Push or Telegram channel.
- **Long-term memory** — Supermemory-backed scoped memory and retrieval. Authorized `remember` calls pass through the action gateway and verify the stored record before reporting success. Some mutation tools, including autonomous `forget`, remain blocked pending executor qualification.
- **App integrations** — Composio connections (Gmail, GitHub, Notion, Linear, …) with a UI to connect/disconnect apps.
- **Chat-created skills** — Eve can write, list, and delete her own skills at runtime; manage them from the UI.
- **Files and controlled sharing** — private Blob-backed uploads, immutable artifact revisions, authenticated content routes, and revocable exact-version share links.
- **Receipt tracking** — log/query/summarize spending, backed by Neon.
- **Computer control** — sandboxed browser tasks, a persistent Orgo cloud desktop, and an approval-gated local Mac bridge with explicit filesystem roots.
- **Agent communications** — an AgentMail inbox, custom email domains, Slack, routed iMessage, and a dedicated AgentPhone number.
- **Payments** — owner-approved Agentcard connection, verification, consent, wallet funding, and bounded virtual-card workflows.
- **Voice and media** — OpenAI realtime voice, inbound phone voice streaming, image conversion, and server-side Remotion video rendering.
- **Observability and evals** — privacy-aware OpenTelemetry, optional Braintrust and Raindrop export, plus routing, memory, safety, reminder, receipt, and persona evaluation suites.

**Review page** — `/review` generates the owner’s daily brief or weekly review and exposes recent outcome feedback.

**Agents page** — `/agents` creates, configures, pauses, resumes, duplicates, archives, and opens persistent Agents. Capability assignment and actual deployment availability are shown separately.

**Manage page** — `/manage` shows review schedules and delivery history, reminders (with run history), webhooks, memories, connections, and skills in one place.

**MyEve Builder (`apps/builder`)** — create a named personal agent and deploy it into **your** Vercel account, then update it later when the template changes:

- **Create** — wizard for name, personality, capabilities, channels, custom cron jobs, and editable generated instructions; one click deploys into the owner's Vercel account. The configured identity and instructions deterministically seed the deployment's protected primary Agent record.
- **Template** — the live `apps/eve` source, assembled at deploy time with feature pruning, so the personal agent and the product never drift. A manifest completeness check fails CI if a new tool isn't mapped to a feature.
- **Deploy** — Vercel REST API with the user's token: create project → set env vars → deploy inline files → stream build status → health check. Keys pass through in memory and are never stored; VAPID push keys are generated automatically; models bill to the deployer's own AI Gateway (no provider keys). Telegram webhooks register automatically when a bot token is provided.
- **Update** — each deployment is stamped with a template version (content hash), a monotonic release from `apps/eve/.eve-template-release` (bump that file when shipping changes agents should pick up), and an `eve-builder.json` manifest. When the builder's release is higher, the agent's `/manage` page shows an update banner that deep-links to the builder's `/update` page (not shown on the create home). The owner pastes their Vercel token and clicks once: the builder reads features, instructions, and custom schedules back from the deployed files, reassembles them on the latest template, and redeploys into the same project. Env vars, VAPID keys, storage, chat history, memories, skills, and the URL are preserved. Agents that predate the manifest need one Create-tab redeploy into the existing project before Update is available.

## Structure

```
apps/eve/         # the agent app (also the builder's deploy template)
  agent/          # eve agent: channels, tools, skills, schedules, instructions
  app/            # Next.js web chat UI + API routes (threads, search, update-check, …)
  components/     # UI components (Kumo design system)
  lib/            # Neon-backed stores (threads, push), Composio connect, web auth
apps/builder/     # the MyEve agent builder
  app/            # create/update UI + API routes (deploy, update, template-version, …)
  components/     # wizard + update flow
  lib/            # Vercel API client, feature manifest, assembler, generators
  scripts/        # manifest completeness check, manual smoke deploy
```

The Next.js app mounts the agent on the same origin via `withEve` — `/eve/v1/**` routes to the agent service. One dev server, one Vercel deployment.

### Capability readiness

Core chat, goals, reviews, agents, skills, reminders, and authenticated owner scoping ship with the application. Integrations are included but only become ready when their configuration is present:

| Capability | Required setup |
| --- | --- |
| Database-backed state | `DATABASE_URL` plus applied migrations |
| Artifacts and file sharing | Private Vercel Blob store |
| Connected apps | Composio or Vercel Connect credentials |
| Email | AgentMail key or a key saved from `/email` |
| Cloud computer | Orgo key or a key saved under Manage → Computer |
| Local Mac control | Sofie Local MCP bridge, token, and an optional Cloudflare Access pair |
| Card workflows | Agentcard backend credentials, database, and admin token |
| Routed iMessage | Photon Spectrum router or an `IMESSAGE_ROUTER_URL` |
| Dedicated phone | AgentPhone key and admin token |
| Realtime browser voice | OpenAI API key |
| Telemetry export | Braintrust, Raindrop, or generic OTLP configuration |

Unavailable integrations stay disabled or report setup requirements; they do not silently inherit another agent's authority.

## Getting started

Requires Node 24.

```bash
npm install
cp apps/eve/.env.example apps/eve/.env.local   # then fill in values
npm run dev --workspace=eve-agent -- --port 3001
```

Open [http://localhost:3001/chat](http://localhost:3001/chat). This command starts only the agent app and leaves port 3000 available for other projects. The root `npm run dev` command still uses the default app port 3000 and builder port 3100.

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
| `BLOB_READ_WRITE_TOKEN` | Private artifacts, file sharing, and skill store |
| `AGENTMAIL_*` | Agent inbox, custom domain, and inbound email webhook |
| `ORGO_*` | Persistent cloud desktop and computer tasks |
| `SOFIE_LOCAL_*` | Approval-gated local Mac bridge |
| `AGENTCARD_*` | Card connection, verification, consent, and spending workflows |
| `SPECTRUM_*`, `IMESSAGE_*` | Shared-number iMessage router and pairing |
| `AGENTPHONE_*` | Dedicated phone, text, iMessage, and voice |
| `SLACK_CONNECT_CLIENT_ID`, `SLACK_OWNER_USER_ID` | Slack channel and owner authorization |
| `OPENAI_API_KEY` | Browser realtime voice |
| `BRAINTRUST_*`, `RAINDROP_WRITE_KEY`, `OTEL_*` | Optional tracing and evaluation export |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web push notifications |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET_TOKEN`, `TELEGRAM_ALLOWED_USER_IDS`, `TELEGRAM_PROACTIVE_CHAT_ID` | Telegram channel and explicit proactive destination (optional) |

Before starting a local or deployed app, apply the checked-in database migrations:

```bash
npm run db:migrate
```

Migrations are ordered and checksum-protected; already-recorded migrations are skipped. The current schema includes migrations through `0029_routine_admission.sql`.

**Migration runner limitation:** the Neon HTTP runner rejects migration blocks containing multiple SQL statements with `cannot insert multiple commands into a prepared statement`. If encountered, apply the pending files through a PostgreSQL client, with each file and its migration-ledger entry in the same transaction. Preserve the original files and their SHA-256 checksums; do not mark an unapplied migration as complete.

Apply migrations to local, preview, and
production databases before the matching application release. Existing runtime table guards remain
temporarily for backwards compatibility; new schema changes must be added under
`apps/eve/migrations/` instead of application startup code.

Preview deployments use the same fail-closed owner authentication as production. Configure
`MYEVE_ACCESS_PASSWORD`, `MYEVE_SESSION_SECRET`, and `MYEVE_OWNER_ID` for the Vercel Preview
environment before qualification; do not weaken the auth boundary to make a preview testable.

## Chat and memory reliability

- Submitted prompts render immediately. Restored chats reconcile their saved stream cursor with the transcript and catch up with the durable session before accepting another message.
- Replayed events are deduplicated, and delayed persistence callbacks cannot overwrite the completed turn with an older cursor.
- Memory writes require an authenticated execution, an allowed capability, and an authorized owner/Agent/Goal/Task scope. Denied or uncertain results instruct the agent not to retry blindly or promise background saves.
- A missing `execution_occurrences` table means the configured database is behind the application schema. Apply the pending migrations to that database before retrying; changing the prompt will not repair the schema.

Focused regression checks:

```bash
cd apps/eve
npx vitest run lib/chat-session.test.ts lib/thread-sync.test.ts agent/tools/remember.test.ts agent/lib/memory-store.test.ts lib/action-authority.test.ts
npx tsc --noEmit
node --import tsx scripts/check-executor-governance.ts
```

Optional PostgreSQL integration checks use `ACTION_CONTEXT_TEST_DATABASE_URL` pointing to a **local test database** and require the `pg` package to be resolvable. They use temporary tables or an isolated schema that is removed after the test; the gateway test mocks the external memory provider.

```bash
# From apps/eve, after setting ACTION_CONTEXT_TEST_DATABASE_URL:
node --test test/action-context-sql.integration.mjs
npx vitest run agent/lib/remember-gateway.integration.test.mjs
```

## Scripts

- `npm run dev` — dev servers (agent app on :3000, builder on :3100)
- `npm run build` — production build
- `npm run db:migrate` — apply pending database migrations
- `npm run db:migrations:check` — validate migration order and files without a database
- `npm run typecheck` — TypeScript checks + builder manifest completeness
- `npm test` — core Node test suite
- `npm test --workspace=eve-agent` — agent, integration, API, and security regression suite
- `npm run eval:list --workspace=eve-agent` — list available agent evaluations
- `npm run eval:fast --workspace=eve-agent` — run the fast evaluation set
- `npm run eval:ci --workspace=eve-agent` — strict CI evaluations with JUnit output
- `VERCEL_TOKEN=… DATABASE_URL=… npx tsx apps/builder/scripts/smoke-deploy.ts` — manual end-to-end deploy test (creates and deletes a real project)

## Deploy

Sofie runs in the existing Vercel project `sofie-personal-agent`:

| Setting | Value |
| --- | --- |
| Production URL | [sofie-personal-agent.vercel.app](https://sofie-personal-agent.vercel.app) |
| Source repository | [jaydubya818/MyEveBot](https://github.com/jaydubya818/MyEveBot) |
| Production branch | `main` |
| Vercel root directory | `apps/eve` |
| Current template release | `255` |

The agent service is bundled into the Next.js deployment and routed under `/eve/v1/**`. Pushes to `main` create production deployments through the Vercel Git integration. Other branches create previews.

Before shipping, run the repository checks from the root:

```bash
npm test
npm test --workspace=eve-agent
npm run typecheck
npm run db:migrations:check
npm run build
```

Database migrations must be applied before deploying application code that depends on them:

```bash
npm run db:migrate
```

For an intentional manual production deployment, use the linked application directory:

```bash
cd apps/eve
vercel deploy --prod --yes
```

After deployment, verify the Vercel deployment is Ready, confirm `/eve/v1/health`, and complete an authenticated conversation plus a sandboxed Computer task. A successful build alone is not production qualification.
