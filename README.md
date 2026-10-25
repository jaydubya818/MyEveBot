# MyEve

[![CI](https://github.com/jaydubya818/MyEveBot/actions/workflows/ci.yml/badge.svg)](https://github.com/jaydubya818/MyEveBot/actions/workflows/ci.yml)

## Overview

**MyEve is an autonomous, multi-agent AI software engineering platform that transforms developer intent into independently verified, deployable software.** Sofie is the primary AI engineering assistant and developer interface.

MyEve is for software engineers, development teams, engineering leaders and organizations building software with autonomous agents. It brings requirements, engineering context, coordinated execution and evidence of results into one developer experience.

**Status: limited beta.** Two external installations have been activated for bounded chat. Developer-agent execution and hosted Factory integration remain separately gated; full autonomous software delivery is under development.

## Product Vision

`Intent → Plan → Code → Test → Verify → Deploy → Operate → Improve`

An engineer describes an outcome and its acceptance criteria. Sofie maintains the context, coordinates qualified agents and tools, and presents progress, decisions and verifiable results. The goal is software that can be reviewed, deployed and operated with confidence.

MyEve's distinguishing principle is independent verification: a coding agent's answer is not proof of success. Construction, verification and permission to publish are separate responsibilities. Durable Work records connect intent to the exact candidate, test evidence and result, while explicit permissions and budgets bound execution.

## Architecture

The ecosystem has six components. This repository contains the MyEve application, Sofie's Eve-based runtime, Builder and shared capability packages; other components have separate implementation and release boundaries.

| Component | Responsibility | Implementation and availability |
| --- | --- | --- |
| **MyEve / Sofie** | Developer intent, engineering context, agent coordination and developer experience | Conversation, persistent agent identities, Work and result surfaces are implemented. The external beta exposes a bounded chat subset. |
| **Relay** | External development tools, agent connectivity and authorized actions | Authenticated peer discovery, scoped requests, messaging and evidence exchange are implemented. Each installation and peer needs its own configuration, grants and qualification. |
| **Deep Agent** | Autonomous planning, implementation, testing, debugging and deployment coordination | Experimental harness and routing contracts exist. No qualified production Deep Agent provider is registered in this release. |
| **MyFactory** | Software construction, isolated execution and independent verification | Work intake, candidate custody and verification integration exist, with retained bounded qualification evidence. General developer execution and hosted beta integration remain gated. |
| **MissionControl** | Enterprise orchestration, governance, policies, permissions and budgets | Shared capability controls exist on `main`; additional orchestration consumers are on beta development branches. Full enterprise execution is not enabled for the chat beta. |
| **MyApps** | Application installation, delivery, updates and rollback | Builder installs and updates MyEve. Separate MyApps runtime and delivery foundations exist on beta branches; general application delivery and rollback remain under development. |

See the [integration setup](docs/setup/myeve-relay-myfactory.md), [Deep Agent boundary](docs/setup/deepagent-harness.md) and [current source/release reconciliation](docs/verification/readme-status-2026-10-25.md). These components describe the target lifecycle, not six production services automatically invoked by every chat message.

## Developer Workflows

For example, an engineer asks Sofie:

> Build a team issue-triage application with authenticated users, searchable issues and assignment history. Propose acceptance criteria, test the critical flows, and prepare a reviewable deployment candidate.

The intended workflow is:

1. **Sofie clarifies requirements and acceptance criteria.** Bounded conversation is operational today; autonomous execution does not follow automatically from a request.
2. **Deep Agent creates and executes the implementation plan.** The dedicated autonomous harness remains under development and qualification.
3. **Relay connects authorized development tools and compatible agents.** Scoped protocol integration exists; a tool or peer must be configured and qualified before use.
4. **MyFactory builds, tests and independently verifies the candidate.** Construction and verification boundaries are implemented for qualified scopes. Arbitrary application builds and the external beta's hosted Factory path are still gated.
5. **MissionControl governs execution throughout.** Permissions, policies and budgets are checked at action boundaries; the full enterprise orchestration path remains under qualification.
6. **MyApps delivers the approved application and manages its release.** General delivery, updates and rollback are roadmap work. Production publication and deployment require separately authorized effects.

The current chat beta can discuss this application and refine its requirements. It cannot yet deliver this entire workflow autonomously. Operating feedback and improvement complete the target lifecycle after delivery.

## Multi-Agent Collaboration

Sofie's intended coordination model includes internal MyEve coding agents, Codex, Claude Code, Cursor, Grok, ChatGPT Dots and other compatible external agents.

| Agent surface | Verified support in current source |
| --- | --- |
| Internal MyEve agents | Persistent specialists, instructions, selection and scoped Work/delegation foundations. Creating an agent does not grant coding or external execution authority. |
| Claude Code | A bounded Docker executor adapter exists in the engineering source. It requires an explicit execution contract and qualified environment; the chat beta cannot invoke it. |
| Codex, Cursor, Grok and ChatGPT Dots | No dedicated, production-qualified connector or execution path was verified in the reviewed MyEve source. These are integration goals. |
| Other external agents | Relay implements a compatible peer protocol. A real recipient, supported protocol, authentication and exact grants must be verified independently. |

Selecting a model is separate from connecting an external agent. A delivered message is separate from completed software work. See [peer setup and acceptance](docs/setup/agent-communication.md) for the supported protocol and its limits.

## Current Capabilities

**Reconciled October 25, 2026 (Pacific).** Source on `main`, the serving beta release and draft engineering branches are different states.

| Area | What works today / remaining boundary |
| --- | --- |
| External beta | Two isolated installations activated for bounded Sofie chat. Read-only checks on October 25 confirmed both production aliases still resolve to the retained chat-only deployments and both health endpoints report ready. |
| Authentication and recovery | Owner authentication, database-backed password changes and owner-assisted, single-use password recovery are implemented on the serving beta lineage. Recovery is not an automatic email service. |
| Conversation persistence | Assistant replies and completed turns survived browser refresh in the documented two-installation qualification. This does not qualify every reconnect or recovery scenario. |
| Accounting | Owner/cohort reservations, limits and conservative handling of uncertain outcomes are qualified within the documented chat-only scope. Developer Work and paid Factory execution remain denied for this cohort. |
| Engineering foundation | Scoped Work, decisions, private artifacts and independently checked Result/Proof consumption exist in source, with bounded historical execution evidence. General autonomous delivery is not production-ready. |
| Beta feedback | Six improvements are under qualification in [draft PR #101](https://github.com/jaydubya818/MyEveBot/pull/101): accurate capability limits, reliable Today state, visible turn allowance, clear budgets, concise preference-aware replies and removal of the unexplained primary-agent chip. Runtime qualification remains incomplete; these changes are not verified as serving. |

The beta is time- and budget-bounded, not general availability. Production availability must be checked against actual serving deployments, current authorization and expiry. Health does not establish authenticated chat success or engineering readiness. [Status evidence and release links](docs/verification/readme-status-2026-10-25.md) record the distinction.

## Getting Started

Use **Node.js 24.x** and **npm 11.16.0**, as declared in the [root manifest](package.json). Install from the repository root using the committed lockfile.

```bash
git clone https://github.com/jaydubya818/MyEveBot.git
cd MyEveBot
npm ci
cp apps/eve/.env.example apps/eve/.env.local
```

Configure your own development resources before starting the app:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Dedicated Neon/PostgreSQL application database. The shipped migration CLI uses Neon's serverless driver; a plain local PostgreSQL connection alone is not equivalent. |
| `MYEVE_OWNER_ID` | Stable owner identity for this installation. |
| `MYEVE_ACCESS_PASSWORD`, `MYEVE_SESSION_SECRET` | Web authentication/bootstrap settings; required when authentication is enforced. Use at least 12 characters for the password and a random signing secret of at least 32 characters. Serving beta password management has additional requirements in its release documentation. |
| `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` | Model transport authentication. Credential configuration does not grant paid execution authority. |
| `BLOB_READ_WRITE_TOKEN` | Private Vercel Blob storage for Files and artifact flows. |
| `MYEVE_RELAY_*`, `MYFACTORY_*` | Optional integration configuration; follow the component setup guides before enabling it. |

The [environment example](apps/eve/.env.example) lists optional services. Model access and paid integrations require your own authorized credentials and limits. Keep `.env.local` private and use isolated development data.

```bash
npm run db:migrations:check
# Applies migrations to the development DATABASE_URL you configured above:
npm run db:migrate
npm run dev --workspace=eve-agent -- --port 3001
```

Open [localhost:3001/chat](http://localhost:3001/chat). The Next.js application mounts the Eve service at `/eve/v1/**`; wait for that backend to start before testing chat.

The root `npm run dev` starts both application and Builder development tasks. To run Builder alone, copy `apps/builder/.env.example` to `apps/builder/.env.local`, configure its separate provisioning resources, and run `npm run dev --workspace=eveclaw-builder` on port 3100.

These instructions target `main` for development. It does not contain the complete serving beta authentication/accounting lineage. Do not deploy it over existing beta installations without release reconciliation.

## Development and Testing

| Path | Contents |
| --- | --- |
| [`apps/eve/app`](apps/eve/app), [`apps/eve/components`](apps/eve/components) | Product UI and authenticated routes. |
| [`apps/eve/agent`](apps/eve/agent) | Eve agent definition, instructions, tools, channels and skills. |
| [`apps/eve/lib`](apps/eve/lib) | Identity, stores, Work, integrations and evidence handling. |
| [`apps/eve/migrations`](apps/eve/migrations), [`apps/eve/scripts`](apps/eve/scripts) | Ordered SQL migrations and operational/qualification tooling. |
| [`apps/builder`](apps/builder) | Installation assembly, provisioning, deployment and updates. |
| [`packages`](packages) | Shared capability policy and enforcement. |
| [`docs`](docs), [`.github/workflows`](.github/workflows) | Design, operations, evidence and CI. |

From the repository root:

```bash
npm test
npm test --workspace=eve-agent
npm test --workspace=eveclaw-builder
npm test --workspace=@mission-control/capability-control
npm run typecheck
npm run db:migrations:check
npm run security:patches
npm run build
```

`npm ci` applies reviewed dependency patches through `postinstall`. Typechecking also validates capability registration, skill routing and executor governance. Database integration tests need explicitly configured disposable databases; skipped suites are not passing qualification. Live evaluations and provider tests can incur costs.

Migrations use `NNNN_description.sql`, unique ordered numbers and SHA-256 ledger checksums. Apply them explicitly with `db:migrate`; builds do not migrate databases. Add forward migrations, preserve applied bytes and keep the [schema registry](apps/eve/lib/database-schema.ts) aligned. Follow the [source and migration policy](docs/consolidation/DEVELOPMENT-POLICY.md) when working across branches or existing deployments.

[Standard CI](.github/workflows/ci.yml) checks installation, dependency patches, protocol contracts, selected regressions, types/governance, migration validation and builds, with a separate PostgreSQL job. [Capability qualification](.github/workflows/capability-control.yml) and the dedicated [CLOUD](.github/workflows/cloud-qualification.yml) / [assembled CLOUD](.github/workflows/consolidation-cloud-qualification.yml) workflows have separate triggers and scope.

To contribute, branch from current remote `main`, keep changes focused, add meaningful regression coverage for behavior changes and open a PR with validation and limitations. Check the existing [Vercel branch rules](apps/eve/vercel.json) before publishing a branch: `main` is deployment-disabled, but unlisted branches may trigger previews. A merge is not a production release.

## Security and Governance

- **Explicit authority:** tools and agents require current owner, capability and resource scope. Discovery, model output and agent creation grant no permissions.
- **Isolation:** private conversations, memory, files and credentials remain owner-scoped. Shared Work requires explicit authorization.
- **Bounded execution:** enforce budgets, deadlines and writer controls before effects. Unknown paid outcomes retain exposure and block automatic redispatch.
- **Independent evidence:** candidate custody and protected verification precede canonical Result/Proof acceptance. Publication, merge and deployment are separate actions.
- **Controlled releases:** preserve owner identity, conversations, credential/session protections and accounting history. Validate the actual serving source and migration lineage before updates or rollback; isolate preview credentials and data.

The beta uses isolated installations. Enterprise-wide policy administration and orchestration remain a separate MissionControl delivery goal.

## Roadmap

1. Complete qualification and authorized rollout of the six beta-feedback improvements and related reliability fixes in PR #101.
2. Qualify Deep Agent execution and hosted MyFactory construction/verification for supported developer tasks.
3. Add and qualify external agent adapters individually, including authentication, cancellation, evidence and budget controls.
4. Complete MissionControl enterprise orchestration and MyApps application delivery, updates and rollback.
5. Extend verified delivery into operation, feedback and controlled improvement.

These are development priorities, not availability commitments. The [historical roadmap](docs/roadmap.md) retains earlier planning context; current release gates above take precedence.

## Documentation Links

- [Product experience](docs/product/agent-native-work-experience.md) and [product guide](docs/private-alpha/PRODUCT-GUIDE.md).
- [MyEve, Relay and MyFactory setup](docs/setup/myeve-relay-myfactory.md).
- [Agent communication](docs/setup/agent-communication.md) and [Deep Agent status](docs/setup/deepagent-harness.md).
- [Source and migration policy](docs/consolidation/DEVELOPMENT-POLICY.md).
- [Current README evidence reconciliation](docs/verification/readme-status-2026-10-25.md), including serving beta password/recovery, accounting and rollout references.
- [Historical qualification checkpoints](docs/verification/readme-historical-checkpoints.md), including the superseded October 6 README and its original scope limits.
