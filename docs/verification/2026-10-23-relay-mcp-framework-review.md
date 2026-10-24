# Independent review — dormant Relay MCP framework qualification

Date: 2026-10-23 (America/Los_Angeles)

**Verdict: the characterization accurately reports TRANSPORT_UNQUALIFIED. The conditional framework investigation is complete; a working Relay MCP integration is not qualified or implemented.**

## Scope

Reviewed `codex/relay-mcp-framework-20261023` against `2c8b92a62b98bf52a8af1e7131ade6ec27701949`. Changes are limited to a local qualification script, evidence/review documents and the branch's false Git deployment guard. No connection definition, canonical resolver, credential callback, runtime adapter, grant, alpha exposure or alternate protocol client was added.

Inspected the actual installed Eve 0.66.3 public MCP definition, connection client and internally compiled SDK. The script imports that installed connection client for local characterization only; it does not substitute the separately installed standalone MCP SDK.

## Findings and decision

The inspected public definition has no startup deadline/cancellation, discovery request-options, fetch or custom-transport hook. Eve constructs its MCP client without initialization options and invokes `listTools()` without request options. The compiled timeout helper returns no deadline without timeout/max-total-timeout input.

Observed results, independently repeated:

| Check | Result and limit |
| --- | --- |
| Pending initialization followed by connection close | GAP: close returned while the held initialize operation remained pending; closing the synthetic peer allowed cleanup. |
| Tool-list discovery after initialization | GAP: no per-connection request deadline is exposed. Explicit close cancels the established client's held read. |
| Ambiguous benign in-memory fixture write | One call; no automatic resend observed for this one fault. This is not a universal retry guarantee. |
| HTTP 200 with JSON-RPC error | Connection client rejected; one call. |
| HTTP 200 with `isError:true` tool result | Returned a flagged `{content,isError}` object without throwing. Requires result-classification review; no claim that higher framework/application layers misclassify it as success. |

The fixture sets `protocolVersionDiscovery:false`. Its discovery case means `tools/list`; it does not characterize the SDK's separate protocol-discovery path, which has an internally supplied timeout.

These findings justify leaving the connection absent. External harness deadlines are not application transport controls and do not resolve the missing public integration surface. No private framework patch, global fetch override, transport proxy or new identity/ledger was introduced.

## Independent execution

Reran the script against synthetic 127.0.0.1 HTTP peers and the static dummy header:

```sh
node apps/eve/test/qualification/relay-mcp-framework-contract.mjs \
  /Users/jaywest/Myeve/output/relay-mcp-framework-20261023/independent
```

The command ran as a child of Node `spawnSync` with a **20-second whole-process timeout** and only PATH/NODE_ENV=test passed to the child. It exited 0 and wrote `independent/receipt.json`, matching the implementation agent's final observations and installed-source hashes. Exit 0 means the characterization completed; the receipt's verdict is still **TRANSPORT_UNQUALIFIED**.

The script uses two-second deadlines around explicit held-operation waits. Some cleanup awaits are not individually deadline-wrapped; the independent run's outer watchdog bounded the overall process. No startup/discovery application deadline was inferred from this harness.

Inspected `characterization-result-shapes.log` and `final/receipt.json` under `/Users/jaywest/Myeve/output/relay-mcp-framework-20261023/`. The earlier failed expectation that both error forms throw remains separate failed evidence. The final script reports the actual flagged result rather than claiming an exception.

`git diff --check` passed. No application source was edited by the reviewer. No PostgreSQL, live Relay, provider/model, credential store or production service was used. No connection was registered; no paid operation occurred.

## Unqualified work

Canonical signed owner/Agent resolution, FederationStore binding, per-user credential/cache isolation, issuer/account/Agent checks, trusted origins, credential revocation/rotation, selected-Relay wire behavior, response bounds and upper-layer tool-error classification are **NOT_RUN/not implemented** here. Earlier standalone SDK evidence cannot qualify those MyEve/Eve boundaries.

Keep the integration absent until a separately reviewed supported surface can meet the required bounds and cancellation semantics. No runtime integration, deployment, financial-hold closure or paid-execution approval follows from this report.

## Reviewed hashes

| Installed source | SHA-256 |
| --- | --- |
| Public MCP definition | `180ec088bc97f365052c957477fb568401dfcea55e9e037b24106317d5f23e1e` |
| Eve connection client | `181042941c0dd06fade93c80259ca1013ec95989c3ceb15048cdbc3b8d4a0e85` |
| Eve's compiled MCP SDK | `4b6b280f9e1943ba3c6f777e0eb70b88fa6fc55d9d9cc258c47c7ab40c756015` |

Qualification script SHA-256: `3661c0e9eb480d02eafee73882c90483a9977d233090233330149d41698bbc70`.

