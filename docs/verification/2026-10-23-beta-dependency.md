# Compatible dependency correction and strict packaging reseal

Branch: `codex/beta-dependency-20261023`, explicitly excluded from Git deployment. Dependency provenance checkpoint: `51a6350a115291399c08f0ad11dd4fa9afef1862`, derived from independently reviewed dormant MCP source `15631e1f`. No production update is authorized by this report.

**Result: compatible partial correction and local packaging qualification pass. Whole-release/audit-clean qualification remains blocked.**

## Upstream changes and compatibility

- Both direct Zod consumers (`apps/eve` and `packages/capability-enforcement`) now pin4.6.6, the fixed floor for [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). A narrowly scoped4.x override updates the pinned Vercel configuration transitive copies without forcing v4 into legacy v3 APIs.
- Eve and Builder now pin Next16.4.3 within the existing major. The [Next advisory](https://github.com/advisories/GHSA-2464-fhr4-w9xw) identifies16.4.1 as a fixed release; the current audit's other Next findings are also absent after this update.
- The existing DOMPurify override advances from3.4.16 to3.4.17, the upstream fix for [GHSA-cg2g-xh64-v4q7](https://github.com/advisories/GHSA-cg2g-xh64-v4q7) and the other current DOMPurify findings.

No `audit fix --force`, incompatible major override, advisory suppression, reachability exemption or package-version falsification was used. Lifecycle scripts were disabled during dependency installation; the existing sprintf-js patch check passes. Initial npm installation left invalid old nested Next/DOMPurify entries; targeted reconciliation and an explicit Eve workspace install corrected them. Final `npm ls` reports no problems. Logs preserve each attempt.

The lock delta contains38 changed entries:10 new hoisted Next records,23 removed duplicate Next/Zod records,2 in-place package version changes and3 workspace records. Existing unrelated package versions/integrities remain unchanged. The new whole-lock SHA256 is `4e3bb89f004ebf70cbd75fc6a7a4e80e4fab371b61120e3795956bbd83b6a1aa`.

## Strict Builder reseal

Metadata identifies the exact dependency checkpoint51a6350a and new lock hash. Of181 earlier pins,19 remain byte/version/integrity-identical;162 refer to package owners removed by the valid hoisted graph and are removed. No new allowlist path is introduced. `verify-template-trace.ts` is unchanged.

The clean Next16.4.3 build naturally traces1593 exact template source inputs, zero template-local dependency metadata and zero generated contexts. The first negative qualification correctly failed its nonempty metadata-fixture assertion instead of silently skipping the hash test. The helper now explicitly injects one **existing exact public metadata pin** into its owned trace when the natural metadata set is empty, requires acceptance by the unchanged verifier and checks its full identity/hash receipt. It then changes only the same-name/version metadata body and requires the existing specific hash failure. Both metadata bytes and trace bytes restore in `finally`; a fresh verifier receipt must equal the original normal metadata set. Existing generated-context, private/untracked-file, changed-source and no-Git tests remain enforced.

The final negative/no-Git campaign passes:1593 inputs,1629 exported files, exact inventory, injected trace denial, metadata/body tamper denial, generated metadata tamper denial, unexpected generated trace denial, byte parity without Git and changed-source denial. The normal zero-metadata trace receipt is restored and the synthetic private-file tripwire is removed. This is synthetic conditional-policy coverage, not a claim that those dependency bodies occur in the natural trace.

## Local qualification

- Full monorepo typecheck:4/4 uncached tasks pass. Capability registry157/tools130, executor governance904/UNKNOWN0 and existing disabled Routine boundary pass. Final Builder typecheck also passes after the helper change.
- Authentication, schema/session, existing Effect API, telemetry, MCP and paid-path suites:92/92 pass. Separate beta/password/session/chat-accounting regression campaign:279/279 pass against disposable local PostgreSQL. These are distinct campaigns with overlapping coverage, not371 unique tests.
- Canonical MyEve plus actual selected Relay handler/SDK wire campaign on the patched MyEve Zod graph:24 local TLS/SQL checks pass. Dormant capabilities remain unregistered and both tester names deny the operation before resolver/network access.
- OIDC/config public module imports pass with no token retrieval, config-file read or remote call. This is import/type compatibility, not live OIDC authentication qualification.
- Clean root production build:3/3 uncached tasks pass. Eve Next build `BBP5V5aPp09HJuqsYM2J4`; Builder Next build `Gi8LNXuXEIKP27Uc7wgz9`.
- Local browser against the production build: beta feedback fixture passes desktop/mobile usage details, composer visibility, Today/Work behavior, thread/draft preservation, owner switching and accessibility checks. Five additional responsive/BFCache/session browser regressions pass. Resources and sessions are synthetic; live model replies, real phones and Wi-Fi loss were not exercised.
- Independent review repeats package identity/integrity, clean installed graph and19-pin reconciliation, executes37 affected tests plus capability-enforcement typecheck, and inspects packaging/browser receipts. Its scoped report is adjacent.

All fixture databases are dropped and the dedicated local cluster is stopped. Both owned browser fixture servers are stopped. No tester turn, model/provider request, production database/configuration/credential update or deployment occurred.

## Release holds remain open

1. Current production npm audit improves from2 critical/14 high entries to **zero critical/six high entries**, not zero findings. Remaining underlying dependencies are Zod3.25.76 in raindrop-ai0.8.0-otelv2 and @langchain/core0.3.80, plus TOML4.3.0 required by Effect4.0.0-beta.101; dependent package findings are also retained. Latest compatible Zod v3 and current Raindrop release lines still require v3. No compatible patched v3 package was found. No v4 default import was forced into them.
2. [TOML's fixed release is5.0.1](https://github.com/advisories/GHSA-4qx8-w7c3-pj3p), outside the existing Effect TOML4 requirement. Supported Effect4.0.6 removes that runtime dependency but also removes `effect/SchemaError`, which this application imports in nine places, including runtime imports. It is an API migration, not a qualified version-only substitution. The downloaded upstream archive was inspected; Effect was not silently upgraded or its behavior replaced.
3. A separate deployable hosted Eve build was attempted with a scrubbed environment and no production environment file. It stopped at four sandbox-template initializations because `VERCEL_OIDC_TOKEN` was missing. Exact output is retained in `hosted-eve-build.log`. No relink, environment pull, credential read, fake token or bypass was attempted. **Deployable hosted Eve/pg bundle qualification is not claimed for this dependency stage**, and generated failed output must not be deployed.
4. Fresh official hosted CI, final Factory source-pair qualification, private custody/financial holds and original feedback rollout prerequisites remain separate. Earlier green builds or pair tests do not qualify this new whole candidate. Neither active beta installation nor its existing conversations was modified.

Evidence: `/Users/jaywest/Myeve/output/beta-dependency-20261023/`, including baseline/reconciled audits, exact lock delta, registry identities, failed/successful installation attempts, independent review, typechecks, regression logs, local builds, browser reports and packaging receipts. No vulnerability exhaustion or financial replay demonstration was run.
