# Independent review: dormant Relay MCP memory operations

**Verdict: PASS_SCOPED_DORMANT_SOURCE.** No remaining blocker was found for retaining this unexposed source implementation. This is not permission to register capabilities, connect an Agent, activate paid execution, deploy, or claim a qualified production integration. Eve's separate public-connection framework result remains TRANSPORT_UNQUALIFIED.

Reviewed branch `codex/relay-mcp-operation-20261023`, based on `eab67052663399cd1a5b7f0f3cad85f4e3fef436`, including the untracked operation and fixtures, the narrow ActionGateway extension, paid-path inventory, executor fingerprints and nondeployment branch guard. Application source was not edited by the independent reviewer.

## Findings resolved before this verdict

- Canonical parameter hashing now uses the gateway's `canonicalActionValue`; object key ordering no longer rejects valid operations.
- The provider boundary consumes the existing private, one-use handle and retains only its bound durable revalidator. Every real POST rechecks current Action, Run, Agent, capability/approval authority, expiry/cancellation, and the canonical connection binding. An ALLOW decision is not cached across discovery and the tool call.
- The canonical entry forwards `ctx.abortSignal` to the gateway. Actual initializing-request and pre-tool cancellation are covered by the local wire fixture; the entry-point propagation is also source reviewed.
- Initialize acknowledgements with HTTP202 are rejected even when they contain a matching valid result. Unrelated response IDs fail closed. The client promise also closes a client that fulfills after cancellation, covering ownership before the SDK factory resolves.
- Get identifiers are limited to 100 characters, matching selected Relay's input contract. A 101-character input is rejected before identity/database resolution.
- An independent run caught the new test's null-versus-undefined registry expectation; it was corrected to the actual canonical contract. Both capabilities remain absent from the registry.

## Independently executed evidence

The selected Relay fixture was copied from the reviewed MyEve test into `/tmp/unified-relay-wire-20261023/source/relay-mcp-memory-wire.test.ts`. The following ran from that exported source with a clean environment:

```sh
env -i PATH="$PATH" NODE_ENV=test \
  RELAY_TEST_DATABASE_URL=postgresql://auth_test@127.0.0.1:55482/postgres \
  MYEVE_MCP_SOURCE=/tmp/myeve-auth-password-management \
  MYEVE_MCP_RESULT=/Users/jaywest/Myeve/output/relay-mcp-operation-20261023/independent-wire.json \
  ./node_modules/.bin/vitest run relay-mcp-memory-wire.test.ts --fileParallelism=false
```

**PASS: 1/1 Vitest test, 24 fixture checks, 8.24 seconds.** Evidence is `independent-wire.log` and `independent-wire.json` in `/Users/jaywest/Myeve/output/relay-mcp-operation-20261023/`. The fixture identifies selected Relay source `43298bd359c3562c6efffa1efc292c3d0ce7dfc1` and uses the installed public `@ai-sdk/mcp@2.0.19` against actual selected Relay handlers over loopback TLS. Only the MyEve child receives the synthetic test CA. Separate disposable SQL databases supply the real canonical owner/Agent/Run/connection and durable Action queries; the Neon fetch bridge is test database plumbing. The positive capability decision is a clearly synthetic, child-only AuthorityProvider. Default production capability evaluation is independently exercised and denies the unregistered IDs.

The campaign covers real add/get/list; separate-owner/account private-memory fixtures; completed-read deduplication; canonical issuer/address/local-Agent and caller identity denials; actual selected Relay credential rotation plus encrypted canonical-row update; reconnection; and both alpha installation denials. Rotation, revocation, Run cancellation, policy denial and caller abort after discovery each send zero `tools/call` requests. RPC/tool errors, redirect, oversized body and dropped response each send one tool request and leave one UNKNOWN attempt. Held initialize/list and invalid initialize responses terminate within the fixture bounds. No owner cookie or wrong-path request was observed. Safe receipts contain neither fixture credentials nor memory content.

After the final get-id narrowing, this command ran from `/tmp/myeve-auth-password-management/apps/eve`:

```sh
env -i PATH="$PATH" NODE_ENV=test ../../node_modules/.bin/vitest run \
  lib/relay/mcp-memory.test.ts lib/action-authority.test.ts \
  lib/relay/key-version.test.ts lib/external-alpha/memory-provider.test.ts \
  lib/external-alpha/paid-paths.test.ts
```

**PASS: 36/36 tests, 5 suites, 1.01 seconds.** Evidence: `independent-regressions-final.log`. The prior independent 35-test run and initial registry-expectation failure are distinct attempts, not additional passing coverage. The 24-check wire campaign preceded only the final narrowing from 200 to 100 identifier characters; its actual generated identifiers remain accepted. No other runtime behavior changed after that campaign. `git diff --check` passed.

## Boundaries and residual limits

- These are dormant authored operations. No runtime tool/route/connection imports the module, no capabilities or grants were registered, both tester names fail closed before resolution, and this branch is explicitly nondeploying. No new service, runtime enrollment, environment setting or identity/accounting ledger was introduced.
- HTTPS origin, canonical privileged provisioning/storage, encrypted Agent credential custody and Relay's bearer authentication remain trusted. Caller arguments cannot supply identity, credentials, URLs or arbitrary tools. The binding detects stored issuer/account/Agent/key/credential changes; it does not independently attest an opaque bearer beyond those existing trust boundaries. Owner session material is not retained by the binding or forwarded to MCP.
- Add is fixed to FACT/AGENT_PRIVATE. Reads inherit Relay's same-account SHARED-or-own-Agent-private visibility; this review does not describe them as private-only reads or claim an exhaustive same-account multi-Agent visibility matrix.
- The 3-second HTTP request/body bounds and 10-second total bound apply to the MCP exchange. Canonical resolver and database/gateway waits before it are not covered by that exchange deadline. JSON-only responses are required; SSE-only peers fail closed. Optional SDK GET is answered locally with HTTP405, redirects are refused, responses are bounded to 256 KiB, method retransmission is refused and SDK tool retries are zero.
- Completed-read replay was exercised. UNKNOWN replay, financial delayed/refund behavior, live providers, private custody, hosted CI, browser integration, deployment, and runtime capability/approval activation were not qualified here. Earlier Factory financial/private-custody/final-peer holds remain open. Dependency audit/remediation is a separate unresolved release stage; this is not a whole-candidate release verdict.
- No production credentials, databases or installations were accessed by this reviewer. Only synthetic loopback credentials and disposable local databases were used. Parent reported all fixture databases removed and the local cluster stopped after the independent run. Application typecheck/governance results are parent-owned evidence, not independently rerun here.

## Reviewed source fingerprints

SHA256 after the final identifier correction:

| File | SHA256 |
| --- | --- |
| `apps/eve/lib/relay/mcp-memory.ts` | `73960f318acc28b6abee3bad68c06a5c443b38751390cacc2368c237eb5653b1` |
| `apps/eve/lib/action-gateway.ts` | `1525319ff20e1084fd34067a422dbd6aea42f38bac25b8d60e72bafc4bd89d0c` |
| `apps/eve/lib/external-alpha/paid-paths.ts` | `35895337606c76bd6e75ace89407e6a4c665ab9587aab3cc1d24a5241f01548e` |
| `apps/eve/lib/relay/mcp-memory.test.ts` | `2f1ae3d82cd6ba1a9da657d15d99effea3c25be5d1284e3d36d08a2b71388e1e` |
| `apps/eve/test/qualification/relay-mcp-memory-wire.test.ts` | `4ac8ba02efe9a89e63b5189f1540c505269f646f09def95f4552205c6aaff5d4` |
| `apps/eve/test/relay-mcp-memory.integration.mjs` | `6de7a9ecf333dc7e4381d74528d25ad012448fb79fdaf1367b35596ae0562109` |
