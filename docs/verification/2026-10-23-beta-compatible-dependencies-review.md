# Independent review: compatible dependency patch and Builder reseal

23 October 2026. **ACCEPT_SCOPED_DEPENDENCY_AND_RESEAL.** No blocker was identified in this closed dependency change or its two-field metadata reseal. Existing hosted, installed-authority and broader release boundaries remain unchanged. This is not deployment approval or a whole-platform security clearance.

Reviewed source checkpoint: `263241f9efba1c92221cbf350c399735d3feac2c`, relative to `62622445cc10acff2dd46c4e45d87a1dfe0c4482`, on explicitly nondeploying `codex/beta-telemetry-public-20261023`. The previously accepted telemetry/schema core at `ef6d574a` is unchanged and was not reopened. Factory `c5416e65f786f8f9abf14692a984b5a176271b67` and Relay `f7264e0a8df036c5fb505b61c55ad978f5a81f9e` remain fixed.

The reviewer made no application/manifest/lock edits, dependency installation, production or credential access, provider/model/vendor call, CI dispatch, deployment, grant change or financial/private-custody test. Independent execution was restricted to existing ordinary loopback HTTP/URI cases, two focused mocked test suites and the unchanged mandatory packaging verifier. Evidence/report files are the only reviewer-authored files.

## Closed dependency delta

Independent comparison proves that the source commit changes exactly three files: root manifest, Eve manifest and root lock. There are **19 changed existing lock entries, zero additions and zero removals**:

- Nine Undici instances resolve to the selected 6.29.1, 7.30.1 or 8.12.2 versions.
- Eight Vitest-family packages advance together from 4.1.11 to 4.1.12.
- fast-uri advances from 3.1.8 to 3.1.9.
- Eve's workspace dev-dependency metadata records Vitest 4.1.12.

All twenty unrelated Vite/Rolldown/oxc/nanoid/PostCSS entries from the initial rejected proposal were restored exactly before installation. No other package entry or top-level lock metadata differs. Vite remains 8.3.4 within Vitest's unchanged supported range. No Eve, provider, SDK, API, schema, runtime, SQL, peer pin or execution-authority source is edited.

All nine Undici parent declarations are unchanged. The eight 6/7-parent resolutions satisfy their original caret ranges. Eve's exact `8.9.0` declaration remains outside the selected 8.12.2 version, as it was outside the previous overridden 8.10.2 version: this is the already established same-major override exception, not a new cross-major override or an assertion that every parent declaration admits the replacement. No 6/7 parent is forced to major 8.

The six supplied official package-version records match the corresponding locked integrity values and declared engine requirements. Installed versions match all eighteen changed package entries; the synchronized Vitest-family versions match its public dependency contract. Local Node 24.18.1 satisfies the declared engine floors. The frozen installation retained the exact lock, SHA256 `debed795a8e948e1829e15097e32b90c73f779747d11d986159eb6879a9ca892`. Existing dependency patching is unchanged. Details: `independent-closed-delta.json`, official metadata and frozen-install records.

## Independent targeted checks

The existing ordinary public smoke script was repeated with only its receipt output path changed. **14/14 checks passed** against installed Undici 6/7/8 public fetch/request, ordinary HTTP status and AbortSignal behavior, plus fast-uri roundtrip and relative resolution. Only owned loopback endpoints and normal synthetic inputs were used; no exploit, stress or vulnerability reproduction was performed. See `independent-public-http-smoke.mjs`, log and receipt.

```sh
env -i PATH="$PATH" NODE_ENV=test node node_modules/vitest/vitest.mjs run \
  --config apps/eve/vitest.config.ts \
  apps/eve/agent/lib/telemetry-startup.test.ts \
  apps/eve/agent/lib/raindrop-hook-http.test.ts
```

**7/7 tests in two suites passed on Vitest 4.1.12**, including mocked module/reset behavior and the existing synthetic HTTP fixture. Log: `independent-vitest-mocker-tests.log`. These are targeted dependency compatibility checks, not a new review of immutable core behavior or an additive release-wide test total.

## Final metadata and packaging

Independent reseal verification confirms that only `sourceCommit` and `packageLockSha256` change, binding source `263241f9` and the lock above. The **separate nineteen-entry Builder metadata list** is unchanged: all version/integrity pins and installed file body hashes match, and zero paths are added. This list is distinct from the nineteen changed lock entries.

After the parent completed the clean build and restored negative-test traces, the reviewer independently ran the unchanged mandatory verifier:

```sh
env -i PATH="$PATH" NODE_ENV=test \
  node --import tsx apps/builder/scripts/verify-template-trace.ts
```

Result: **PASS, 1,596 exact source inputs across deploy/update/template-version, zero normal dependency metadata and zero generated contexts**. The synthetic tripwire is absent. `git diff --check` passes. See `independent-final-reseal.json` and `independent-template-verifier.log`.

The mandatory verifier SHA256 remains `485001fb394d8217c9590d817b93464f4db676f6dc3e48549f3ebdd575b3a3f7`; the negative qualifier remains `32d4700d1c52c8affdd9eb2d81410e8aaddf1a5fb558a770fd82bad9c6c49ffd`. Both are byte-unchanged. The parent negative campaign reports all exact-inventory, injection, qualified metadata/body tamper, generated-context, no-Git byte-parity and changed-source checks passing with **1,596 inputs / 1,632 exports**. No gate, source exclusion or metadata allowlist was widened.

## Parent evidence inspected

The following overlap independent results and are not summed into a unique release-wide count:

- 171 affected tests / 25 files; 40 accounting/usage/context tests / five files including disposable PostgreSQL; four typecheck tasks with 907 governed sources and UNKNOWN=0.
- Existing capability qualification: 59 SQL/control checks and 11 real browser cases. Existing selected Relay actual-handler fixture: 24 checks with the patched MyEve child. No peer, fixture or capability activation change.
- Composition: 3/3 PASS from clean `263241f9` with an all-denied envelope and exact Factory c541. It preserves Work created after the first 104 migrations across `0109` applied twice, while retaining canonical source-identity controls.
- Clean build: three uncached tasks PASS in 19.885 seconds. Exact Eve ID `iPTAxJHbCmUMEfsnYY2OM`; Builder ID `XABrL1aYmsI3f-pPkTsS4`.
- Final built UI: ten checks PASS on that exact Eve build, desktop/mobile serious accessibility findings zero, and viewport/BFCache 5/5 PASS with no skipped, unexpected or flaky case. These use synthetic resources and no live model. The parent reports owned UI servers stopped and disposable database cleanup/cluster shutdown completed.

The parent report `docs/verification/2026-10-23-beta-compatible-dependencies.md` accurately separates the package graph, built-in runtime, overlapping results and installed-authority limits.

## Remaining boundaries

The captured final npm audit has **zero findings at every severity**. That resolves the earlier six-moderate observation for this exact npm package graph only; the old evidence remains retained. No advisory was suppressed.

Local Node 24.18.1 independently reports bundled Undici **7.29.0**. These npm package updates do not patch Node's built-in global fetch and do not qualify or change the hosted platform runtime. No whole-platform clearance or untested vulnerability inference follows from either version string. The unchanged root React 18.3.1 / shadcn >=19 peer issue remains visible; a clean full dependency graph is not claimed.

Official exact-final-source CI, hosted OIDC/bundle qualification, installed accounting-status SQL and canonical remote Relay bindings/grants remain separate. Existing private financial/custody, paid execution, activation and MissionControl holds are unchanged. Local synthetic passes and source records create no installed authority. Publication to the same draft PR remains the root coordinator's authorized step; this candidate remains nondeploying.
