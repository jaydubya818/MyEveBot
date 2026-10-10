# Capability integration dependency remediation

The initial full MyEve audit reported 51 affected packages: four critical, 13 high, 30 moderate, and four low. The first bounded remediation removes all critical and high findings. The complete follow-up audit still reports 30 moderate and four low findings; these are unresolved, not ignored or accepted. Production integration and paid operations remain NOT_RUN.

## Changes and exposure

| Dependency path | Original → qualified candidate | Exposure and scope |
| --- | --- | --- |
| MyEve and Builder → Next.js | 16.3.5 → 16.3.8 | Framework image/cache fixes; exact patch pins avoid an unrelated 16.4 upgrade. |
| MyEve → Vitest → tinypool | Vitest 3.2.7 → 4.1.11 | Development worker-pool pollution and mock path traversal; the successor no longer depends on tinypool. |
| iMessage/telemetry → grpc-js | 1.14.4 → 1.14.5 | Certificate authorization handling; no live channel is invoked. |
| Braintrust → Express → proxy-addr | 2.0.7 → 2.0.8 | IPv4-mapped IPv6 proxy-trust bypass. |
| Next.js → sharp | 0.35.4 → 0.35.5 | Native image dependency fix and matching libvips artifacts. |
| PostCSS → source-map-js | 1.2.1 → 1.2.2 | Indexed source-map denial of service. |
| Queue → minimatch → brace-expansion | 5.0.9 → 5.0.12 | Nested expansion denial of service. |
| Eve framework → Undici | 8.9.0 → 8.10.2 | HTTP/WebSocket/TLS fixes; override is scoped to affected 8.x versions. |
| Raindrop → LangChain → LangSmith | 0.3.87 → 0.6.0 | Untrusted prompt manifest handling; telemetry import compatibility tested without requests. |
| shadcn CLI → fast-glob → braces | CLI removed | MyEve uses only the stylesheet. Exact MIT-licensed bytes are retained locally; no unmaintained replacement or advisory suppression. |

The framework, Raindrop, model/provider contracts, spending ceilings, accounting assertions, capability policy, and execution permissions are unchanged. Root npm overrides express the selected transitive fixes; the previously workspace-local AI override is retained at the supported root location. Resolution was checked against a clean manifest-only fixture, narrowed to the selected security records, and verified with a clean frozen `npm ci --ignore-scripts` installation. The lockfile retains npm registry integrity hashes.

Primary advisories: [Next image response](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), [Next image optimization](https://github.com/advisories/GHSA-cjq9-62q9-8jv4), [tinypool](https://github.com/advisories/GHSA-85c8-ppgw-ccpr), [proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [grpc-js](https://github.com/advisories/GHSA-m9gg-hp2v-232j), [sharp](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), [brace-expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [Undici](https://github.com/advisories/GHSA-w293-vg96-wgc3), [LangSmith](https://github.com/advisories/GHSA-3644-q5cj-c5c7), [unpatched braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## Validation and remaining gates

- Clean frozen install without package scripts passes.
- Root Node suite: 245 passed, two existing skips. New regressions check proxy-trust behavior, actual LangChain/LangSmith imports, and exact licensed stylesheet bytes.
- MyEve Vitest 4.1.11: 242 files and 2,264 tests pass; nine files and 123 tests remain explicitly skipped by existing qualification conditions.
- Full workspace typechecking, capability registry, imported-skill routing, and executor governance pass.
- Full advisory scan: zero critical/high, 30 moderate, four low. No audit gate was weakened.
- Remaining root advisories: OpenTelemetry core baggage allocation; DOMPurify; fast-uri; KaTeX; postcss-selector-parser; smol-toml; sprintf-js; UUID. Propagated dependency findings account for the larger package count. `sprintf-js` has no published fixed version in the observed advisory.

This record does not qualify production deployment, real installations, external channels, hosted CI, or independent review. Those gates remain separately reported against final source SHAs. No pricing or accounting test is relaxed.

## Follow-up: bounded remaining dependency fixes

The initial 34-finding result above is retained as historical evidence. The follow-up frozen graph updates only affected dependency records: OpenTelemetry core 2.0.1/2.7.1 → 2.8.0; fast-uri 3.1.7 → 3.1.8; UUID 9/10 → CommonJS-compatible 11.1.1; postcss-selector-parser → 7.1.6; smol-toml → 1.9.1; DOMPurify 3.4.15 → 3.4.16; KaTeX 0.16.47 → 0.18.2. Existing newer OpenTelemetry/UUID copies and unrelated framework, browser, channel, model, and accounting packages are preserved. Each selected lock record comes from exact npm registry resolution with its original integrity metadata. KaTeX crosses a minor compatibility boundary; full UI/type and browser qualification is required.

Raw audit now reports zero critical, high, or low, and five moderate findings. All five are propagation from the single unpatched upstream `sprintf-js` advisory through just-bash, Eve, and its adapters. Latest just-bash 3.6.0 still depends on the affected sprintf-js release. The local [patch record](../../patches/README.md) documents explicit formatting bounds, immutable upstream/replacement hashes, preserved identity/license, and fail-closed install checks. This source mitigation does not make the raw audit clean and does not authorize a metadata-only audit gate bypass.

Security regression coverage includes actual just-bash printf, both formatter entry points, pre-callback malicious precision/width rejection, aggregate output bounds, normal formatting, every installed legacy UUID copy's output-buffer bounds, every OpenTelemetry copy's inbound baggage limits, and patch drift/missing identity rejection. All workflows explicitly apply and check the source mitigation after frozen installation, including paths using `--ignore-scripts`. The Factory qualification pin follows the independently reviewed CI correction without changing its runtime identity.

Independent review and exact-SHA hosted/fresh-clone qualification are separate final gates. No production, remote paid, pricing, authorization, or accounting behavior is qualified by this dependency record alone.

Follow-up local qualification: clean disposable frozen install plus explicit patch application/check PASS; nine dedicated security regressions PASS; root Node 251 PASS with two existing skips; MyEve Vitest 2,264 PASS across 242 files, retaining 123 existing gated skips; full workspace types, registry, routing, and governance PASS. The shared real PostgreSQL/Convex composed run also passed the platform-owner and ordinary-owner browser/admission journeys under these published dependency updates. Final independent installed-source review and exact-head hosted/fresh-clone evidence remain tracked separately.
