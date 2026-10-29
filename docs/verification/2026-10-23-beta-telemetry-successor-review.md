# Independent review: telemetry, startup and source-qualification successor

23 October 2026. **Scoped source and local-qualification PASS; release HOLD remains.** No remaining source-level security blocker was identified in the reviewed changes. This verdict does not authorize deployment, installed identity changes, grants, paid execution or activation.

Reviewed source checkpoint: `ef6d574a85c017ffceea9ebd9cecd50058ec53b6`, based on `72d4f8553e2bf3d68fb3c84f9a697f5bd04f14b3`, on explicitly nondeploying `codex/beta-telemetry-public-20261023`. Frozen seal `9c319e3f4df2316bc728c90e4dd8398e688756f9` adds the two-field Builder reseal and parent verification report. Scope includes the manual telemetry client, public OTLP adapter, retained hook/privacy/identity behavior, Effect tool-schema bridge, exact composition catalog/terminal record, Relay pin changes and packaging evidence. The later compatible-dependency patch stage is excluded from this checkpoint verdict.

The reviewer did not edit application source, install dependencies, access private environment files or production/tester credentials, call a live provider/vendor, deploy, dispatch CI or change an installed binding. Independent execution used synthetic data, owned loopback HTTP/TLS endpoints and disposable localhost databases. Review mutations were limited to ignored evidence/report files and existing fixture cleanup. The parent owns build/browser/operator evidence described separately below.

## Findings and reviewed corrections

- **Failure propagation is a deliberate bug fix.** An earlier assessment incorrectly inferred public `finish` failure from a low-level sender rethrow. Full-chain source inspection and the parent's actual public-SDK loopback capture show the intermediate wrapper catches exhaustion, so old public finish resolves after three failed sends. The new HTTP adapter exposes safe failure to the retained best-effort hook. It does not claim exact old ACK parity, vendor persistence or exactly-once delivery.
- **Multiplied retry latency is resolved.** The initial replacement could hold an awaited terminal hook for several minutes. One absolute five-second publication deadline now covers queue wait, request abort, Retry-After and terminal retries. Expired queued work checks its deadline before transport; no detached Promise.race can send later. Both begin publication and terminal publication are bounded. This is a network/retry budget, not a hard deadline for synchronous preparation, database work or the entire model turn. Standard span export separately uses a ten-second timeout.
- **Conditional deployment provenance is preserved within the documented scope.** Independent public-old-SDK execution confirmed that ordinary Vercel metadata could add commit provenance to spans and manual events without SDK tools/eval/replay calls. The replacement now shares a trusted server metadata snapshot across both destinations. Explicit operation values and raw/AI/traceloop span aliases take precedence. A changed commit loses unrelated automatic branch/dirty values while retaining explicit server defaults. Default branch discovery stays off; invalid explicit commit and configured alternate source-directory inputs do not trigger a misleading Vercel fallback. Strict complete hexadecimal SHAs and documented flag strings are supported. Local Git subprocess discovery, other hosting providers and unused SDK eval/replay/context features are deliberately outside this parity claim.
- **Privacy and authority remain bounded.** The hook retains stable UUIDs, authenticated-current-principal attribution, conversation/original time, step usage deduplication and durable cleanup. Existing disabled-I/O/AgentCard ceilings remain. Public local redaction retains the reviewed seven category labels/order and fails before network on preparation error. Responses are not logged or echoed. Production destinations/key sources are fixed server values; fixture endpoint overrides are internal only. No automatic SDK event path, Workshop, extra tracing provider, action grant or accounting authority is introduced. Test/no-key modes construct no Raindrop transport.
- **Span compatibility is qualified narrowly.** The old instrumentation-scope admission and two AI name/attribute mappings remain. Representative generic and transformed AI protobuf bytes match the captured public legacy onEnd baseline, preserving reviewed events/exceptions, links, kind, trace state, resources, scope and drop counts without mutating another destination's span. The capture intentionally disables old automatic Git discovery and is not blanket onStart or every-span parity. Git behavior has separate evidence.
- **The startup bridge preserves validation.** The Effect adapter exposes the same `~standard` metadata/validator/projection on a plain object, which the real public `ai.asSchema` consumer accepts. This corrects the callable-class JSON-serialization failure. Tool executors, input validation and authorization guards are unchanged.
- **Catalog and pin changes do not confer authority.** Only two exact already-reviewed immutable external-alpha successors replace historical comparisons. Their current bytes and SHA256s match the selected Git objects. The October 12 terminal record is unchanged; the additive October 23 record matches the exact Factory c541 source/config/version/contract record and retains `installedAuthority: NONE` / `productionIntegration: NOT_RUN`. Relay changes are exactly seven current CI literals and one receipt literal, with runtime MCP code, child fixture, workflow logic and historical pins unchanged.

## Independent verification

From `/tmp/myeve-auth-password-management`, with an empty inherited environment:

```sh
env -i PATH="$PATH" NODE_ENV=test node node_modules/vitest/vitest.mjs run \
  --config apps/eve/vitest.config.ts \
  apps/eve/agent/lib/raindrop-client.test.ts \
  apps/eve/agent/lib/raindrop-span-exporter.test.ts \
  apps/eve/agent/lib/raindrop-hook-http.test.ts \
  apps/eve/agent/lib/raindrop-hook.test.ts \
  apps/eve/agent/lib/telemetry-startup.test.ts \
  apps/eve/agent/lib/telemetry-privacy.test.ts \
  apps/eve/agent/lib/effect/tool-schema.test.ts
```

**35/35 tests in seven suites passed, 1.73 seconds.** Includes the final explicit-server-default precedence assertion. `independent-final-transport-schema-tests.log` is the final run; earlier overlapping runs are not additional coverage totals. The initial new HTTP fixture's cached-client failure was corrected with live fixture bindings; its original failing receipt remains.

Two additional bounded scripts passed: native fetch closed an actual hung loopback response after a 250 ms deadline (254.65 ms observed), made no late retry and recovered the same event queue; the old public SDK independently demonstrated conditional automatic Git provenance with fake deployment metadata. Scripts, logs and receipts are retained as `independent-native-fetch-deadline.*` and `independent-legacy-onstart.*`.

The unchanged selected-Relay fixture also passed independently: **24 checks in one Vitest test, 7.55 seconds**, against `f7264e0a8df036c5fb505b61c55ad978f5a81f9e`. It exercised the actual memory handler over disposable TLS/SQL, owner/private-memory isolation, fresh binding/rotation/cancellation checks, ordinary bounded error classification and no automatic tool resend. Synthetic test authority is not installed authority; canonical capabilities remain unregistered/default-denied and both external-alpha names deny before transport. No completed UNKNOWN replay or financial/private-custody campaign was run.

Relay evidence directory: `/Users/jaywest/Myeve/output/beta-relay-f726-finalpair-20261023/`. Independent source verification found the archive byte-exact against the canonical Git object, all 612 extracted regular files plus symlink/mode checks exact, installed pnpm lock exact, and the copied fixture exact. Tree: `63cdceaff691411921047da3e4eae1ae79226c5c`; archive SHA256: `ccd013552f81bca9d26ec916c0cbdaf823328ec3efdbeabb9b97d4781e58bf91`; lock SHA256: `e0c925e12f921d27745b21470b9a1a3d7522de5cdeb4f8f293dfe60e48c7f047`. Parent install records show frozen pnpm 9.15.9, fresh store/downloads and pending build scripts, with no dependency reuse.

Independent lock comparison confirms one package added, 150 removed and seven retained-entry metadata changes, with **no retained version/resolved/integrity changes**. Builder reseal verification confirms all nineteen existing metadata pins and installed body hashes remain exact, zero paths added, and only `sourceCommit` / `packageLockSha256` changed. Lock SHA256: `15218d69fce349cdac50c171f2fe26ea39c7253f0070e58261a806197587c0ab`.

The mandatory Builder verifier was independently rerun: **PASS, 1,596 exact inputs across three routes, zero normal dependency metadata and zero generated contexts**. Both added TypeScript files appear with their current hashes in the sealed manifest. The mandatory verifier SHA256 remains `485001fb394d8217c9590d817b93464f4db676f6dc3e48549f3ebdd575b3a3f7`; the negative qualifier remains `32d4700d1c52c8affdd9eb2d81410e8aaddf1a5fb558a770fd82bad9c6c49ffd`. Both are byte-unchanged from the baseline. `git diff --check` passed.

## Parent-owned evidence inspected

These results overlap the independent runs and must not be summed into a unique release total:

- 163 affected tests / 22 files; 40 chat/accounting/usage/context tests / five files including disposable PostgreSQL; four typecheck tasks and 907 governed sources with UNKNOWN=0.
- Real startup/public `eve info` and worker health pass after the bridge fix. Existing capability fixture reports 59 database/control and 11 browser checks, retaining real-owner/installed qualification limits. Its locale startup failure and unchanged LC_ALL=C rerun remain recorded.
- Composition is 3/3 PASS after installing the exact Factory dependencies. It installs the first 104 migrations, creates a synthetic Work record, then applies current `0109` twice and verifies preservation, a final 105-entry ledger and empty authority/admission tables. The original missing-`@vercel/oidc` failure remains recorded. No new SQL or source-identity assertion was weakened.
- Root build: three uncached tasks PASS. Exact Eve ID `WZoJowarJ7RD2XemQnpH_`; exact Builder ID `1YNYDsf51yLwhggidXt6K`. Strict negative packaging reports 1,596 inputs / 1,632 exports with injection, qualified metadata/body tamper, generated metadata, no-Git byte parity and changed-source checks passing. Synthetic tripwire removed; no allowlist widening.
- Built beta UI reports ten checks PASS on that exact Eve build, desktop/mobile serious accessibility findings zero, and the viewport/BFCache suite is 5/5 PASS. These use synthetic resources and exercise no live model. Local development fallback authentication is not evidence of unsigned production access. Parent reports owned servers/clusters stopped after cleanup.

## Residual release holds

The final captured registry audit is **zero critical, zero high, six moderate** in `audit-final.json`; the earlier two-moderate result is historical. Affected entries include fast-uri/Undici and their dependent paths plus Vitest/mocker. No exploit/stress reproduction, forced downgrade, suppression or new dependency fix was performed by this review. The compatible dependency successor remains separate release work. The preexisting React peer-graph issue is outside this scoped pass; no whole-graph or clean-audit claim is made.

Hosted OIDC/bundle qualification, official exact-source CI, installed accounting-status SQL and canonical remote Relay binding/grants remain separate requirements. Existing private financial/custody, paid execution, capability activation and MissionControl holds stay open. No source receipt or local synthetic authority may be substituted for an installed grant.

Transport evidence establishes process-local ordering and complete cold-start snapshots, not global cross-process ordering, backend persistence, parent stitching or exactly-once handling. Regex fixtures are finite evidence, not universal PII protection. No production/tester/provider/vendor-ingest traffic was used by the independent reviewer.
