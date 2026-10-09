# Agent Computer runtime

Phase 6 adds an owner-scoped control plane around Eve's existing per-session sandbox and `agent-browser` runtime. It does not introduce a second task engine or a second browser implementation.

## Architecture audit

| Existing area | Decision | Phase 6 treatment |
| --- | --- | --- |
| Eve durable session | REUSE | `runtime_session_id` binds a ComputerSession to the durable execution context. |
| Eve sandbox | EXTEND | Keep `/workspace`, Vercel Sandbox isolation, lifecycle, and sandbox id; add ComputerSession records and explicit resource policy. |
| `@agent-browser/eve` | EXTEND | Keep the installed browser and extension tools; add granular capability gates and action telemetry. |
| Phase 4 Agents and `agent_runs` | EXTEND | Agent identity and limits are authoritative for session creation and every action. |
| Goal / Task / Task Run | REUSE | Optional links point to canonical Goal OS and Task Run rows; no parallel autonomous-task model exists. |
| `task_artifacts` | MIGRATE concept | Reuse its private Blob/checksum/redaction pattern. A separate `computer_artifacts` table is necessary because QA artifacts require a product-QA task, specialist, and acceptance check. |
| Activity (`eve_events`) | EXTEND | Record session lifecycle and artifact checkpoints only. Detailed clicks remain in `computer_actions`. |
| Browser profiles / takeover | NEW later | Explicitly excluded from Phase 6. |

## Runtime model

One active ComputerSession may exist for an Eve durable session. It belongs to exactly one owner and Agent and may link to one Goal, Goal Task, and Task Run. A BrowserSession is one-to-one with the ComputerSession and is ephemeral.

Lifecycle:

`provisioning -> ready <-> running -> completed | failed | stopped | expired`

`paused` is represented so a later phase can add takeover without changing persistence, but Phase 6 exposes no user-control state or takeover operation. Terminal states cannot be reopened. A new ComputerSession is created instead.

The runtime lazily expires overdue sessions during reads and action checks. Eve remains responsible for stopping or idling the underlying sandbox compute; its public sandbox handle does not expose a portable remote destroy operation. Stopping a ComputerSession immediately revokes MyEve action authority. The Agent tool also closes the ephemeral browser when possible.

## Capabilities and isolation

Granular capabilities are enforced at every model step:

- `computer.session.create`
- `computer.session.stop`
- `browser.navigate`
- `browser.read`
- `browser.click`
- `browser.type`
- `files.read`
- `files.write`
- `terminal.execute`

Legacy `computer.browser` assignments remain an umbrella dependency for compatibility. A secondary Agent cannot inherit the primary Agent's capability or use a ComputerSession attributed to another Agent. Owner APIs can inspect all of that owner's sessions; Agent tools may only use the session bound to the current Eve runtime and Agent identity.

Disabled and archived Agents cannot create sessions. Owner and relationship checks fail closed before persistence.

## Resource and network boundary

Computer limits derive from Phase 4 Agent limits and are further capped:

- runtime: never longer than the Agent's `maxRuntimeSeconds`
- browser actions: default 100, hard maximum 500
- individual file/artifact: default 20 MiB, hard maximum 100 MiB
- terminal command: default 30 seconds, hard maximum 120 seconds

Every live sandbox starts with `deny-all`. `start_computer_session` opens only the exact public hostnames declared in `allowedDomains`, while IPv4 private, loopback, carrier-grade NAT, and link-local ranges remain denied at the provider firewall. Literal IPs, localhost, and reserved internal/test suffixes are rejected before provisioning. Stopping the session restores `deny-all`. Secrets are not placed in the sandbox.

Vercel's current firewall API rejects IPv6 CIDRs even though its TypeScript surface accepts them, so Phase 6 cannot express IPv6 private-range denies directly. The exact-host allowlist is the stricter primary boundary; the remaining provider limitation is documented rather than silently falling back to unrestricted egress.

Because browser and terminal share the same sandbox firewall in the current Eve API, Phase 6 does **not** expose arbitrary shell. `terminal.execute` is limited to a read-only diagnostic allowlist (`pwd`, `ls`, `wc`, `head`, `tail`, `sort`, `uniq`) and rejects shell operators, expansion, scripts, and network clients. General terminal execution needs a separately network-isolated primitive in a later phase.

## Evidence and artifacts

Every supported browser, file, and terminal call creates a structured ComputerAction with redacted, bounded input/output summaries. Action failures distinguish capability denial, timeout, and general failure.

The Agent captures meaningful evidence explicitly with `record_computer_artifact`. Files are read from the isolated sandbox, text is redacted, size is checked, bytes are checksummed, and the artifact is stored privately in Vercel Blob. The owner-scoped download API never reveals Blob storage keys. Screenshots are checkpointed intentionally rather than captured for every micro-action.

## Platform constraints

- Vercel Sandbox is the configured backend and requires its normal credentials in local development.
- Database migration `0010_agent_computer_runtime.sql` is required before Computer capability reports ready.
- Durable evidence requires `BLOB_READ_WRITE_TOKEN`.
- Browser state is isolated but ephemeral from the product perspective. No persistent login profile, cookie export, owner-authenticated profile, or desktop bridge is implemented.
- Owner API stop revokes authority immediately; underlying compute cleanup follows Eve server shutdown and Vercel idle behavior.

## Phase 7 seam

Phase 7 can add takeover by extending lifecycle and authorization around the existing ComputerSession and BrowserSession. It should not overload `paused` silently: takeover must add explicit controller identity, lease/heartbeat semantics, and audited handoff transitions. Phase 6 intentionally contains no `user_control`, Take Over, or Return Control state.
