# Independent review: selected Relay MCP fixture rerun

**Verdict: PASS_SCOPED_LOCAL_ACTUAL_HANDLER_COMPATIBILITY.** No blocker was found in this one-line provenance correction or the existing local fixture's result. Installed/production qualification and capability activation remain unverified and unauthorized by this result.

Reviewed MyEve `81bc45bcb181bc4bd6be487f831f0a6f51b63003` with selected Relay `ccd32878759bd03a8d6775141769498487496958`, tree `18541de305e84a017bd036330bd02498af03721f`. The parent exported the exact Relay source with `git archive` and installed its own pnpm9 frozen lock with lifecycle scripts disabled. The install log records fresh downloads rather than reuse of the historical graph. This reviewer ran the already installed, selected source; no dependency installation or peer application edit was performed by the reviewer.

## Exact source scope

Independent byte comparison proves the only fixture change replaces the old `relaySource` receipt literal with the selected revision. The MyEve MCP operation, ActionGateway and child fixture are byte-identical to the frozen baseline. No assertions, authority rules, request handling, timeouts or positive/negative cases changed. The copied parent fixture is byte-identical to the owned source.

| Reviewed file | SHA256 |
| --- | --- |
| MyEve parent fixture | `00b31a32f09f6e77e55bea5874165c6ca2a134dd361cc861f9504f42aa572c69` |
| MyEve MCP operation | `73960f318acc28b6abee3bad68c06a5c443b38751390cacc2368c237eb5653b1` |
| MyEve ActionGateway | `1525319ff20e1084fd34067a422dbd6aea42f38bac25b8d60e72bafc4bd89d0c` |
| MyEve child fixture | `6de7a9ecf333dc7e4381d74528d25ad012448fb79fdaf1367b35596ae0562109` |
| Selected Relay lock | `ae2f8bc4da1288ff2712f7ba34ad7fd306680aa7dfabaa4bbb06e5d149aec5b1` |
| Selected Relay MCP route | `993b249f205da7efb9d13f61a11c1edf04b2a97bd775b33d2d7e7eed3c46a851` |

Evidence: `independent-source-check.json` in `/Users/jaywest/Myeve/output/beta-relay-finalpair-20261023/`.

## Independent execution

Executed from `/tmp/myeve-relay-finalpair-20261023/source` after the parent's run completed:

```sh
env -i PATH="$PATH" NODE_ENV=test \
  RELAY_TEST_DATABASE_URL=postgresql://auth_test@127.0.0.1:55482/postgres \
  MYEVE_MCP_SOURCE=/tmp/myeve-auth-password-management \
  MYEVE_MCP_RESULT=/Users/jaywest/Myeve/output/beta-relay-finalpair-20261023/independent-actual-handler-receipt.json \
  ./node_modules/.bin/vitest run relay-mcp-memory-wire.test.ts
```

**PASS: 24 internal checks, one Vitest test, 7.57 seconds test time / 8.27 seconds total.** Evidence: `independent-actual-handler-tests.log` and `independent-actual-handler-receipt.json`. The initial sandboxed attempt failed before connecting with loopback `EPERM`; it is retained as `independent-sandbox-socket-denial.log`. The identical command passed with narrowly approved local socket access. This was a sandbox limitation, not an application failure.

The existing fixture uses actual selected Relay HTTP/auth/memory/database handlers over loopback TLS, random disposable local SQL databases, and MyEve's real resolver and operation in a separate child. Positive cases inject synthetic authority only inside that child. It is not runtime configuration.

The results cover separate owner credentials and private-memory scope, add/get/list, canonical binding checks, default capability denial, both beta names denied before resolver/network, revalidation after rotation/revocation/cancellation/policy changes, initialization/discovery bounds, caller cancellation, response/error classification and uncertain single-transmission handling. The observed error cases each transmit one `tools/call`; no automatic resend follows. Completed read deduplication is covered. No completed UNKNOWN replay or financial demonstration was run. The MCP exchange bound does not establish a bound on independent database waits.

The receipt records no cookies, no non-`/mcp` path, zero production calls, zero tester turns and zero paid calls. The parent's separate run passed the same 24 checks; it is overlapping evidence, not another set of unique cases. Parent qualification document `2026-10-23-relay-finalpair.md` accurately limits the claim.

## Constraints retained

Memory capabilities remain unregistered and denied by the canonical default policy; both external-alpha installations remain denied. No provider account, real credential, private environment, production database, remote enrollment, live grant, financial/private-custody fixture, deployment or paid path was used or changed by this reviewer. Only local fixture-generated credentials and synthetic data were exercised. The fixture's cleanup hooks drop its disposable databases; the parent owns final cluster verification and shutdown.

This checkpoint does not qualify installed Relay bindings/grants, a hosted bundle, the full Factory/Relay/MyEve pair, production activation or a release-wide security verdict. Dependency, hosted-build, financial/private-custody and installation holds remain open. The queued Effect dependency assessment was not started.

