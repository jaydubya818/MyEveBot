# Independent review: compatible dependency correction and Builder reseal

**Verdict: PASS_SCOPED_PARTIAL_CORRECTION_AND_LOCAL_RESEAL.** The reviewed changes are suitable for a separate source checkpoint. Remaining dependency advisories and unavailable hosted-bundle qualification remain release holds. This is not an audit-clean, production-ready, deployment, or activation verdict.

Reviewed `codex/beta-dependency-20261023` from frozen MCP source `15631e1fc6c856bf851c01a75879beafd35c4aa7`, dependency checkpoint `51a6350a115291399c08f0ad11dd4fa9afef1862`, and its subsequent uncommitted metadata/harness reseal. The reviewer changed only this report and independent output evidence; no application implementation, manifest, lockfile, dependency installation or production state was changed by the reviewer.

## Dependency scope and remaining findings

| Surface | Reviewed result |
| --- | --- |
| Direct Eve and capability-enforcement Zod | `4.4.3` to `4.6.6`; the override selects only older v4 dependencies. No v3 major override was added. The [reviewed advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) and [upstream release](https://github.com/colinhacks/zod/releases/tag/v4.6.6) identify this fixed version. This is a patched-version claim, not a latest-version claim. |
| Eve and Builder Next | Both resolve to `16.4.3`; stale nested `16.3.8` copies were removed and Next was hoisted. The [official release](https://github.com/vercel/next.js/releases/tag/v16.4.3) is in the existing v16 line. It exceeds the `16.4.1` fixed floor for the three baseline Next advisories: [image optimization](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Server Actions](https://github.com/advisories/GHSA-p3m5-59mp-jv5r), and [cache functions](https://github.com/advisories/GHSA-673q-mjm6-r5xr). |
| DOMPurify override | `3.4.16` to `3.4.17`, matching the [upstream release](https://github.com/cure53/DOMPurify/releases/tag/3.4.17) and the baseline [critical advisory's fixed version](https://github.com/advisories/GHSA-cg2g-xh64-v4q7). |
| Zod v3 | **OPEN.** `raindrop-ai@0.8.0-otelv2` and `@langchain/core@0.3.80` retain their existing `3.25.76` copies and integrity pins. Fresh public registry metadata confirms even `raindrop-ai@1.0.2-otelv2` declares `zod:^3.23.8`, and the installed LangChain declares `^3.25.32`. Forcing v4 would violate those dependency contracts. No unsupported override, version relabeling, advisory suppression or reachability exemption is used. |
| TOML / Effect | **OPEN.** Effect remains `4.0.0-beta.101` and TOML remains `4.3.0`. The [TOML advisory](https://github.com/advisories/GHSA-4qx8-w7c3-pj3p) identifies `5.0.1` as fixed; the beta declares `^4.1.2`. Stable Effect removes this dependency edge but is not a demonstrated drop-in replacement: the inspected public `4.0.6` archive has no `SchemaError` file, while this application has nine `effect/SchemaError` imports, including two runtime imports. The [upstream migration guide](https://github.com/Effect-TS/effect/blob/main/MIGRATION.md) also documents module reorganization. No forced TOML major override was introduced. |

The parent's reconciled production audit records **0 critical and 6 high package findings**, comprising Zod/TOML and dependent packages. Those counts describe audit package entries, not six independently demonstrated incidents. No exploitation, exhaustion, financial replay or incident reproduction was requested or run in this review.

Independent lock comparison found only the intended root Zod/DOMPurify updates, 23 removals of old nested Next/Zod locations, and 10 additions for the hoisted Next package family. Required v3 copies, Effect and TOML retain their original versions and integrity pins. Fresh public npm metadata matches the installed lock integrity for Zod `4.6.6`, Next `16.4.3` and DOMPurify `3.4.17`. No signature/provenance attestation validation beyond these registry integrity comparisons is claimed.

## Builder packaging controls

The reseal points to dependency checkpoint `51a6350a` and the exact new lock hash. The metadata inventory retains **19 byte-identical entries**, removes **162 entries whose package owners are absent from the new lock**, and adds **zero allowlist paths**. All retained installed metadata bodies, package versions and lock integrities were independently checked before and after qualification. The mandatory `verify-template-trace.ts`, security-patch code and patch manifest are unchanged.

Next's new layout naturally traces zero Eve-local dependency metadata bodies and zero generated contexts. The first revised qualifier correctly failed its nonempty-metadata assertion instead of skipping the test. The final adaptation explicitly injects one existing, installed, exactly qualified public metadata path into the owned local trace, requires the unchanged verifier to accept its exact package/version/integrity/body hash, then changes only that body and requires both a nonzero exit and the specific metadata-change rejection. Nested `finally` blocks restore the metadata bytes and original trace bytes, and the verifier must restore the original normal metadata set. This is synthetic conditional-policy coverage, not a claim that the normal build traces that dependency.

The remaining untracked/private-source, unexpected generated file, generated-context tamper, exact inventory, no-Git byte parity and changed-source denials remain enabled. No wildcard metadata allowance, private-file acceptance or mandatory verifier relaxation was added. The dependency branch remains explicitly nondeploying.

## Independent checks executed

Evidence directory: `/Users/jaywest/Myeve/output/beta-dependency-20261023/`.

- Public npm metadata queried with isolated npm configuration; `npm ls next dompurify zod toml --all --json` returned no problems. Evidence: `independent-upstream-metadata.json`, `independent-installed-inventory.json`, `independent-lock-check.json`.
- **37/37 tests, 5 suites PASS** using a clean PATH/NODE_ENV-only environment, from `apps/eve`:

  ```sh
  env -i PATH="$PATH" NODE_ENV=test ../../node_modules/.bin/vitest run \
    lib/relay/mcp-memory.test.ts lib/approvals.test.ts \
    agent/lib/effect/tool-schema.test.ts lib/password-crypto.test.ts \
    lib/external-alpha/paid-paths.test.ts
  ```

  Evidence: `independent-regressions.log`; duration 1.01 seconds.
- `npm run typecheck --workspace=@myeve/capability-enforcement` **PASS**; evidence `independent-capability-typecheck.log`.
- `node scripts/security/apply-dependency-patches.mjs --check` **PASS**, preserving the existing sprintf-js package identity; evidence `independent-security-patches.log`.
- `node --import tsx apps/builder/scripts/verify-template-trace.ts` independently rerun after all negative mutations: **PASS**, three routes, 1,593 exact template inputs, zero normal dependency metadata and zero generated contexts. Evidence: `independent-template-verifier.log`. All 19 retained metadata bodies still match their pins. `git diff --check` also passed.
- Independent metadata comparison: `independent-metadata-check.json`. Application implementation and dormant MCP authority/exposure behavior remain outside the dependency diff.

## Parent-owned qualification and limits

The following receipts were inspected but their campaigns were not independently rerun by this reviewer:

- Clean root build: all three tasks uncached and successful, 21.46 seconds. Eve build `BBP5V5aPp09HJuqsYM2J4`.
- Full typecheck before the harness adjustment and final Builder typecheck after it passed. Parent reported 279 beta checks, 92 affected checks and 24 local MCP wire checks with patched Zod; these are separate campaigns with overlapping coverage, not a combined unique-test count.
- Final packaging qualifier: 1,593 inputs / 1,629 exported files, with every negative and no-Git parity flag passing; final normal trace restored. Evidence: `packaging-negative-final.log`. The earlier nonempty-metadata assertion failure remains in `packaging-negative.log`.
- Local built-app desktop/mobile owner isolation and feedback receipt **PASS**; QA **5/5 PASS**, no errors. Evidence: `browser/receipt.json` and `qa-browser/report.json`. These do not prove a live provider or production installation.
- A separate hosted Eve build in a scrubbed environment failed because four sandbox-template initializations lacked `VERCEL_OIDC_TOKEN`. `hosted-eve-build.log` is retained. No token fallback, environment pull, relink or deployment was attempted. **Hosted bundle and its PG bundle check remain NOT_QUALIFIED in this stage**, despite the successful ordinary root build.

Parent reported local servers stopped, disposable databases removed and the local cluster stopped. No production credentials, databases, provider accounts, tester turns, environment settings, grants or paid capability activation were accessed or changed by this reviewer. Previous Factory financial/private-custody/final-peer holds remain open. Further supported dependency migration and authorized hosted qualification are still required before a whole-release verdict.

## Exact reviewed fingerprints

| File | SHA256 |
| --- | --- |
| `package-lock.json` | `4e3bb89f004ebf70cbd75fc6a7a4e80e4fab371b61120e3795956bbd83b6a1aa` |
| `apps/builder/lib/template-dependency-metadata.json` | `b01a8c8fb02c637e9cc1926be9dd25517b024bb39c7a8102bed53e2d66b2b62d` |
| `apps/builder/scripts/qualification-template-trace.ts` | `32d4700d1c52c8affdd9eb2d81410e8aaddf1a5fb558a770fd82bad9c6c49ffd` |
| `apps/builder/scripts/verify-template-trace.ts` | `485001fb394d8217c9590d817b93464f4db676f6dc3e48549f3ebdd575b3a3f7` |
