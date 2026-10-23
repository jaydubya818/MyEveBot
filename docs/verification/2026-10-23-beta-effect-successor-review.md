# Independent review: Effect successor, parser patch and catalog reseal

**Verdict: PASS_SCOPED_DEPENDENCY_AND_CATALOG_CHECKPOINT.** No unresolved blocker was found in the reviewed source changes or local qualification. The remaining dependency advisories and existing hosted/installation/financial holds prevent an audit-clean or whole-release verdict. No deployment or activation is authorized by this review.

Reviewed `codex/beta-effect-successor-20261023` from `5b43ed3629179a013dac9df75133a5121a38c78c`, Effect/catalog checkpoint `31510e9951e8449c773d52ba3a182778aa3a3827`, body-parser checkpoint `71e929217fc26ff1ee9f3a32998608bad42c1ee6`, and the final two-field Builder metadata reseal. Reviewer edits are limited to this report and independent output evidence.

## Dependency scope and compatibility

Effect changes directly from `4.0.0-beta.101` to `4.0.0-beta.104`. There is no application API rewrite, forced major override or advisory suppression. Independent lock comparison found no added packages, removal of only `find-my-way-ts`, `ini`, `multipasta` and `toml`, and unchanged YAML version/integrity with its resulting `devOptional` classification. Official registry metadata matches the new Effect integrity, dependencies and export wildcard; installed `npm ls effect toml --all` reports no problems and no TOML edge.

The [beta.104 release](https://github.com/Effect-TS/effect/releases/tag/effect@4.0.0-beta.104) explicitly replaces the external encoding parsers and multipart dependency. This prerelease also includes API changes, so “pin-only application change” does not mean universal API equivalence. The [beta.102](https://github.com/Effect-TS/effect/releases/tag/effect@4.0.0-beta.102) and [beta.103](https://github.com/Effect-TS/effect/releases/tag/effect@4.0.0-beta.103) notes were reviewed for intervening schema, lifecycle and service changes. The application imports only the root Effect module and `effect/SchemaError`; its nine SchemaError imports, including two runtime imports, remain supported by the installed wildcard export and actual files. No application use was found of the changed custom Clock, ConfigProvider, old Schedule/schema constructors or File.seek APIs. Existing ManagedRuntime, Layer, Semaphore, schema/error and service paths are exercised by the affected tests. This establishes scoped compatibility, not coverage of every Effect API.

The subsequent compatible parser update changes only three lock entries: body-parser `2.3.0→2.4.0`, its own content-type `2.0.0→2.1.0`, and shared qs `6.16.0→6.16.1`. Express remains `5.2.1`, accepts body-parser `^2.2.1`, and is reached through unchanged Braintrust `^5.2.1`. No manifest or override was added. The [official body-parser release](https://github.com/expressjs/body-parser/releases/tag/v2.4.0) and [maintainer advisory](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828) identify 2.4.0 as patched. The [content-type release](https://github.com/jshttp/content-type/releases/tag/v2.1.0) adds optional comma parsing; the [qs revision](https://github.com/ljharb/qs/releases/tag/v6.16.1) stays in the existing major/minor line. Ordinary parser qualification passed; no compression, stress or vulnerability reproduction was used.

## Frozen catalogs and controls

The migration supplement appends exactly the already-served 0108 application-password and 0109 chat-only migrations. All 16 supplement hashes independently match source; its original 14 entries and the separate 103-entry historical catalog remain unchanged. No migration SQL is edited. The existing rehearsal now requires 105 application migrations ending at 0109, retaining exact list/checksum equality, duplicate/noncontiguous rejection and unsupported-lineage denial. The qualification envelope's scope text follows that exact catalog; it does not apply SQL or grant execution.

Parsed assertion-catalog comparison proves the only semantic change is the context suite's exact current 12-test contract. The obsolete management-tool expectation is replaced with the existing stronger disabled-Work expectation, and the existing purchasing/concise-preference test is added. These identities match real Vitest JSON. This is not a new Deep Agent test. All other suite identities, skip expectations and the assertion verifier remain unchanged; Unicode escape reserialization is semantically equivalent.

Builder metadata changes only `sourceCommit` and the exact lock hash. All 19 existing installed metadata bodies, versions and integrity pins independently match before and after qualification, with zero added or removed allowlist paths. The mandatory verifier and negative qualification script are byte-identical to the baseline. The branch remains explicitly nondeploying. Authentication, owner identities, session handling, databases, capability grants and application runtime source are unchanged.

## Independent checks

Evidence directory: `/Users/jaywest/Myeve/output/beta-effect-successor-20261023/`.

From `apps/eve`, using only PATH and test mode in the environment:

```sh
env -i PATH="$PATH" NODE_ENV=test ../../node_modules/.bin/vitest run \
  lib/agentcard-http.test.ts lib/external-write-policy.test.ts \
  lib/imessage-auth.test.ts lib/owner-browser-storage.test.ts \
  lib/password-crypto.test.ts lib/web-auth.test.ts \
  lib/external-alpha/context.test.ts lib/external-alpha/paid-paths.test.ts \
  agent/lib/effect/agentcard-attach.test.ts agent/lib/effect/agentcard-connect.test.ts \
  agent/lib/effect/agentcard.test.ts agent/lib/effect/agentphone.test.ts \
  agent/lib/effect/anonymous-eve-rate-limit.test.ts agent/lib/effect/artifacts.test.ts \
  agent/lib/effect/chat-files.test.ts agent/lib/effect/imessage-inbound.test.ts \
  agent/lib/effect/imessage.test.ts agent/lib/effect/tool-schema.test.ts \
  agent/lib/effect/voice.test.ts agent/lib/telemetry-privacy.test.ts \
  agent/lib/telemetry-startup.test.ts agent/lib/raindrop-hook.test.ts
```

**145/145 tests in 22 suites PASS**, 1.75 seconds, `independent-final-affected-tests.log`. These are mocked provider/service tests. The earlier independent 139-test run and parent's matching 145-test run overlap this campaign and are not additive.

Additional independent checks:

- `env -i PATH="$PATH" NODE_ENV=test node --test scripts/myapps-composition/assert-report.test.mjs`: **2/2 PASS**, including rejection of forged counts, missing/foreign files and changed skipped cases. Evidence: `independent-report-catalog-tests.log`.
- Unchanged copy of the parent's existing ordinary parser script: **4/4 PASS**, actual Express/body-parser over ephemeral loopback HTTP, covering small JSON, form, empty and malformed input. Evidence: `independent-parser/body-parser-ordinary-receipt.json` and `ordinary-smoke.log`. Separate output preserved the parent's receipt; the server closed in its existing finally block.
- `node --import tsx apps/builder/scripts/verify-template-trace.ts`, after final negative qualification: **PASS**, three routes, 1,594 exact inputs, zero normal dependency metadata and zero generated contexts. Evidence: `independent-template-verifier.log`.
- Exact lock/API/catalog/metadata comparisons: `independent-lock-catalog-check.json`, `independent-api-catalog-check.json`, `independent-parser-lock-check.json`, `independent-metadata-check-final.json`; registry and installed graph evidence retained separately. `git diff --check` passed.

## Parent-owned qualification inspected

These campaigns were inspected, not independently rerun by this reviewer:

- `typecheck-final.log`: all four tasks passed; 905 governed sources, UNKNOWN=0, existing capability/tool counts retained.
- Existing migration rehearsal on clean 31510e99 plus exact Factory c5416e65: **33 checks PASS**, 25 disposable databases removed, production NOT_RUN. Exact historical and canonical-prefix recovery, schema/ledger preservation and existing inert UNKNOWN restoration assertions passed. This is source/fixture recovery evidence, not installed migration qualification or a financial/private-custody demonstration. The existing failure-path regression also passed.
- `build.log`: all three root build tasks uncached and successful, 20.902 seconds. Eve build `BptfnbNYUXpJqsTWXtgJN`, Builder build `3KRJDI1GJgCEql-RkJQ9l`.
- `packaging-negative.log`: 1,594 inputs / 1,630 exported files; exact inventory, injected trace rejection, metadata/body tamper rejection, unexpected generated trace rejection, no-Git byte parity and changed-source rejection all passed. The synthetic tripwire was removed and final normal trace restored.
- `metadata-reseal-final.json` matches final checkpoint 71e92921 and lock 43320248. Earlier `metadata-reseal.json` records the intermediate pre-parser checkpoint and is not final evidence.
- Initial sandbox IPC denial and the first ordinary-parser empty-body expectation failure remain in their original logs. The unchanged typecheck passed with local IPC permission; the smoke expectation was corrected to the parser's empty object behavior without runtime changes.
- `browser/receipt.json` matches exact Eve build `BptfnbNYUXpJqsTWXtgJN` and passes the real built application's desktop/mobile checks with synthetic resource responses: Today canonical reads and retry, quota/spend states, draft/history preservation, composer layout, hidden alpha chip and owner-switch isolation. Both accessibility results contain zero serious findings. `qa-browser/report.json` and `qa-browser.log` record **5/5 PASS**, no skipped/flaky/unexpected cases or errors, 3.0 seconds, covering valid/signed-out BFCache restore and the retained viewport/focus/tap-target checks. These parent-owned runs were inspected, not independently rerun, and do not close the residual dependency graph finding.

No live-model, new telemetry SDK execution or current-stage hosted-bundle claim is made. Parent reported both owned local browser servers stopped and the owned disposable PostgreSQL cluster stopped after its completed rehearsal.

## Audit result and residual holds

Independent parsing of same-time audit snapshots confirms **7 high / 2 moderate → 4 high / 2 moderate**, zero critical, removing exactly Effect, TOML and body-parser, with no new finding names. These are audit package entries, not counts of incidents. Historical earlier-registry counts are not the comparison baseline.

Remaining Zod v3/Raindrop/LangChain-chain findings and Vitest/mocker findings remain **OPEN**. Required legacy dependency versions were not forced across majors or relabeled. No reachability waiver or audit-clean claim is used. The queued telemetry migration was not started, and its previously identified privacy/failure-signal compatibility gaps remain unresolved. Existing hosted-bundle, installed-binding, financial/private-custody and paid-execution holds are unchanged.

The broader `npm ls --all` check reports **ELSPROBLEMS**: root React `18.3.1` does not satisfy `@shadcn/react@0.2.1`'s React `>=19` peer, while Eve has React `19.2.8`. Independent comparison against the pre-stage lock confirms all three complete entries are byte-equivalent, and the observed installed versions match those pins. This is an unchanged residual graph finding, not a regression introduced by the Effect/parser updates; it remains unresolved. Evidence: `preexisting-react-peer-scope.json` and `react-graph-diagnosis.log`. Successful package-scoped `npm ls` checks above do not establish a clean whole dependency graph.

The reviewer accessed no production/private credentials, tester sessions, live databases, provider/wallet accounts or grants, and changed no application implementation, manifest, lockfile, settings or production state. This review supports the separate source checkpoint and local reseal only.

## Final fingerprints

| File | SHA256 |
| --- | --- |
| `apps/eve/package.json` | `dcd6c74c9d84260624c1c1fa3ad55cdb1c44b2d1fdda0528e1010233621c6bbd` |
| `package-lock.json` | `43320248056e9a508190374ee9a48793c2c053e216ee8ebceaebea0e17f99b28` |
| Builder dependency metadata | `25e902715d9187dc104f76e62466f5c9ff846b61d94bec08f70c70d635cd1ebc` |
| Migration recovery script | `a0b7ee9ea58be8218bc30168d6a7f28dad00425c0868d242b3900f01f81a9bde` |
| Migration supplement | `137aea0d0f9fab1c6515d05835dc81be29ab9d278c94a85be007c16d55c71f30` |
| Assertion expectations | `3baf09eecc56a58346f655fad96acc80639dac7b990cfd26b57e2e35ff4e4f23` |
| Qualification envelope | `8c5f7370a0634053ae2f1eb0938ad89271b35f1fff6e36bf5c3ad2991f117776` |

