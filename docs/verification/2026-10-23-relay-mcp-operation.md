# Dormant Relay MCP authored operation qualification

Result: **PASS_SCOPED_DORMANT_SOURCE**. This is not an activated integration or production qualification. Parent framework characterization `eab67052` remains **TRANSPORT_UNQUALIFIED** for Eve's public connection API; no Eve connection was added or patched.

## Implemented boundary

The already direct public `@ai-sdk/mcp@2.0.19` dependency supplies one fresh client per Action. The authored operation accepts only strict add/get/list arguments. Add is fixed to FACT/AGENT_PRIVATE; list is bounded to20 and get IDs to100 characters, matching the selected Relay contract. Reads retain Relay's same-account shared-or-own-Agent-private visibility. Search, execution, arbitrary tools, model URLs, owner IDs and credentials are not accepted arguments.

The canonical web ToolContext supplies signed MyEve owner/Agent identity through existing `toolActionRequest` and `resolveSessionAgent`. Existing encrypted `FederationStore` connection custody supplies the Agent bearer. Exact active local owner/Agent, issuer, Relay account/Agent address, signing-key/version, Agent revision and credential hash bind the gateway target. These are the existing privileged provisioning/storage trust boundaries; the opaque bearer is authenticated by Relay, not decoded into a new identity scheme.

The existing durable ActionGateway authorizes and deduplicates execution. A narrow extension consumes its existing private provider handle once and retains only that handle's read-only, expiring durable authority revalidator. Every real POST repeats that validation plus the fresh canonical connection check. Revocation/rotation never silently switches credentials within an Action. Errors after transmission claim use the gateway's existing conservative UNKNOWN outcome; no refund, reset, retry or new accounting ledger is introduced.

Transport is pinned to the configured trusted HTTPS origin and `/mcp`, with redirect error handling and only the Agent bearer. No owner cookie, authentication refresh, process-wide fetch override or private runtime import exists. The public SDK's per-client fetch hook enforces three-second HTTP response bounds, 256 KiB JSON bodies, matching JSON-RPC response IDs, and a ten-second **MCP exchange** deadline/cancellation. Database resolution/gateway waits precede that exchange and are not claimed to share its deadline. HTTP202 for a request ID and SSE-only responses fail closed. The optional background GET receives a local405, with no network transmission or reconnect. Each permitted RPC method is transmitted at most once in that exchange; SDK tool retries are explicitly zero. Late fulfilled initialization clients are closed after cancellation.

`relay.memory.read` and `relay.memory.write` remain **unregistered**, so the default canonical capability provider denies them. No tool, route, Agent connection, grant, environment switch or alpha exposure was added. Both beta installation names deny before resolver or transport access, classified explicitly as a DENIED paid path because remote Memory may incur provider activity. A future activation requires separate capability/approval qualification and explicit release authority.

## Verification

- Actual selected Relay source `43298bd359c3562c6efffa1efc292c3d0ce7dfc1`, real public MCP SDK, local TLS with a child-only test CA, and separate disposable MyEve/Relay PostgreSQL databases: **24 checks PASS**, independently repeated.
- The positive path uses actual canonical owner/Agent/Run/connection resolution and durable gateway SQL with a clearly synthetic **test-only** AuthorityProvider. Production evaluation still denies the unregistered capability. This test authority is not an environment option or application escape hatch.
- Real add/get/list, two-owner private-memory isolation, completed-read deduplication, issuer/address/local-Agent mismatch, foreign/conflicting signed Agent, unsupported input/identity overrides, real selected-Relay credential rotation and encrypted canonical row update, reconnect with the new credential, and both alpha names pass.
- Rotation, connection revocation, Run cancellation, policy denial and caller abort after discovery each yield zero tool calls. JSON-RPC error, `isError`, redirect, bounded oversized response and dropped response each yield one tool call and UNKNOWN. Held initialize/list, caller initialization abort, HTTP202 with a matching initialize response and wrong response ID all terminate within bounds.
- Five affected Vitest suites: **36/36 PASS**, independently repeated. App typecheck, capability registry157/tools130, skill routing93 checks and executor governance904 sources/UNKNOWN0 pass. Existing Routine release stays disabled.
- No production call, tester turn, external provider/model call, production schema/credential change or budget alteration occurred. The local fixture applies existing migrations to disposable databases and rotates its synthetic Relay credential. No browser surface changed; prior browser qualification is not claimed as an exact-head test of this new source stage.

Evidence: `/Users/jaywest/Myeve/output/relay-mcp-operation-20261023/`. Initial missing fixture path, invalid foreign-key/status fixture values and a null-vs-undefined expectation are retained as failed attempts, followed by final passing evidence. Independent review is adjacent. The disposable databases are dropped and the local cluster is stopped before freeze.

## Remaining release holds

The baseline npm production audit on23October reports Zod plus additional Next.js, DOMPurify and TOML advisories. Dependency remediation, compatibility tests and strict Builder metadata resealing are a **separate subsequent source stage**. This MCP commit does not claim an audit-clean or deployable whole candidate. Factory final-peer/private custody/financial holds remain separate and open; no old delayed/refund/replay demonstration was run.
