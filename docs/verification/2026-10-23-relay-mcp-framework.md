# Dormant Relay MCP qualification — public transport controls missing

**Result: TRANSPORT_UNQUALIFIED. No Relay MCP connection is registered or enabled.** Source branch `codex/relay-mcp-framework-20261023` derives from the separately frozen ordinary Factory fixture contract `2c8b92a62b98bf52a8af1e7131ade6ec27701949`. This stage adds only a local framework-characterization script, this evidence, independent review and an explicit false Git deployment guard.

## Reuse and overlap check

The current source has Agentcard, Composio and local-computer connection definitions, but no Relay MCP definition or equivalent MCP resolver in the canonical Relay library. Installed Eve 0.66.3 documents `defineMcpClientConnection` and `defineDynamic`; both were evaluated before adding any alternate client. Existing `FederationStore(ownerId).connection()`, signed channel user identity/Agent verification, trusted `relayOrigin()`, encrypted per-Agent credential custody and ActionGateway/capability denials remain the intended integration foundations. The federation client and every active chat-only/Deep Agent/Factory denial remain unchanged.

The safety requirement is a bounded, cancellable connection/discovery transport before any credential is released or remote tool is exposed. The installed public MCP definition supplies no startup timeout/cancellation, discovery request-options, fetch or custom transport hook. The actual Eve runtime constructs its internally compiled MCP SDK with URL/headers and protocol discovery only; it does not pass initialization bounds and calls `listTools()` without request options. The compiled SDK creates startup/request timers only when timeout options are provided. The public connection definition cannot supply them. A header callback, token expiry, approval policy or `providedArguments` cannot cancel those network requests.

## Executable local characterization

```sh
node apps/eve/test/qualification/relay-mcp-framework-contract.mjs \
  /absolute/local/evidence/directory
```

This script loads the **actual installed Eve connection client**, not the separately installed SDK used in earlier Relay wire research. It runs only synthetic localhost HTTP peers, uses a static dummy fixture header, uses two-second deadlines on the explicit held-operation waits, and tears down the peers and client. Cleanup awaits are not each deadline-wrapped; independent execution also used a 20-second process watchdog. Those external harness deadlines are not represented as application transport protection. The fixture sets `protocolVersionDiscovery:false`; discovery here means `tools/list`, not the separate internally timed protocol-discovery path.

Observed results:

| Contract | Actual result |
| --- | --- |
| Initialization held by the fixture; call client `close()` | Close returns while initialization and its network response remain pending. The harness must close its peer to finish cleanup. |
| Tool discovery held after successful initialization | No request deadline is exposed; explicit close of the established client cancels the read. |
| Ambiguous synthetic in-memory write | Exactly one attempt; no automatic resend observed in this case. This is not a real Relay mutation or a replay demonstration. |
| HTTP200 JSON-RPC application error | Actual Eve client rejects; one request. |
| HTTP200 result with `isError: true` | Actual Eve client returns `{content,isError}` without throwing. Upper execution/action classification requires separate verification before an adapter could present this as success/failure. No claim of an end-to-end masking defect is made. |

The script's verdict remains TRANSPORT_UNQUALIFIED even when its assertions complete successfully. An earlier assertion expecting both error forms to throw failed; that attempt is retained separately. The final script records the observed flagged result honestly instead of treating it as an exception.

Exact installed source SHA256 values:

- Public MCP definition: `180ec088bc97f365052c957477fb568401dfcea55e9e037b24106317d5f23e1e`.
- Runtime connection client: `181042941c0dd06fade93c80259ca1013ec95989c3ceb15048cdbc3b8d4a0e85`.
- Eve's internally compiled SDK: `4b6b280f9e1943ba3c6f777e0eb70b88fa6fc55d9d9cc258c47c7ab40c756015`.

Evidence: `/Users/jaywest/Myeve/output/relay-mcp-framework-20261023/`, including final `receipt.json`, command logs and independent review. No database, credential store, production service, tester conversation, model/provider or private custody was accessed by this characterization.

## Fail-closed boundary and remaining work

No dynamic Relay connection, token resolver or alternate protocol was added merely to work around this limit. There is no private framework patch, process-wide fetch override, transport proxy, new identity/ledger, production configuration, capability grant or beta exposure. Existing application runtime files remain byte-identical to the preceding source stage. The new connection therefore remains absent, which preserves the current chat-only boundary.

Before runtime integration, qualify a supported framework surface that bounds startup and metadata discovery and cancels an initializing client, with no uncertain mutating resend. Response-byte limits and explicit tool-error classification also need a qualified public path; the existing public MCP definition has no response-transform or body-limit option. A separately reviewed framework change or a narrowly authored operation using an existing qualified client/gateway is a future decision, not an implementation performed here.

After that boundary is resolved, the canonical signed user/Agent/FederationStore resolver, per-user credential/cache isolation, issuer/account/Agent matching, trusted-origin enforcement, revocation/rotation and actual selected-Relay local-wire campaign still need implementation and independent qualification. Prior standalone SDK/Relay positive wire evidence cannot substitute for those missing MyEve/Eve integration checks. Those checks are **NOT_RUN** here. Factory's final-peer/private-custody/financial holds and all production-release prerequisites remain open and separate.
