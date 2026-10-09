# Product acceptance blocker resolution

Starting canonical `origin/main`: **88370d0662c7824445b59779a8b8e8b21abfa10b** (unchanged after fetch). Branch: `codex/product-acceptance-fixes`. Dedicated worktree: `/private/tmp/myeve-product-acceptance-fixes`.

All four original blockers pass targeted qualification. **Full MyEve product qualification remains INCOMPLETE.** No model-backed or external-provider journey was performed.

## Independent reproductions and fixes

| Defect | Reproduction and root cause | Consequence and fix | Result |
|---|---|---|---|
| Duplicate ZIP entries | Raw ZIP writer produced checksum-valid duplicate domain, manifest and checksum entries. JSZip collapses repeated names before the old verifier enumerated entries. | Ambiguous archives could be declared safe. New raw central/local-header preflight establishes uniqueness and safe paths before bounded decompression, JSZip CRC validation or domain checksum trust. | PASS |
| Secret-bearing archive fields | Valid archives were modified with root and recursively nested credential keys, with integrity metadata recomputed. Verification accepted them because the exporter’s key policy was not applied to imported JSON. | A supposedly portable, secret-free backup could carry credentials. Export and import share one key policy; every JSON entry is checked, including metadata, arrays, escaped keys and shadowed objects. Errors and logs are fixed safe messages. | PASS |
| Mobile intercepted taps | At 390 × 844, a normal Open threads tap was intercepted by an SVG and New thread button overflowing the translated, fixed-width sidebar. | Destinations were inaccessible. Closed sidebar is invisible to hit testing/focus, contents are clipped, header controls wrap within its width, mobile controls have 44px targets, navigation closes the drawer, Escape restores focus and Tab remains in the drawer. | PASS |
| Chat attachment absent Files | Real file chooser + Send produced no canonical file row. Composer directly sent browser data URLs; existing `persistChatUpload` was never called. | Attachments disappeared from owner inventory. Composer now awaits canonical private Blob upload and owner-authenticated metadata registration, retains successful identities for retry, then reads through the authorized Files content route before preparing the Agent request. Thread labels also require matching ownership. | PASS |

Before fixes: archive regression suite **10 passed / 22 failed**; both independently targeted browser reproductions failed. See [archive-before.log](archive-before.log) and [browser-before.log](browser-before.log). These failures were recorded before each corresponding product change.

## Targeted qualification

- **Duplicate rejection PASS:** exact domain/manifest/checksum duplicates; `./`, nested normalization and repeated-slash aliases; unsupported case and encoded aliases; valid v1 remains accepted.
- **Secret rejection PASS:** token, secret, password, authorization, credential, cookie, API/access/private key, refresh token, VNC credential and database URL concepts; root and nested/array/provider/connected-app/Agent/Computer metadata. Client responses, rendered UI, server logs and owner-data audit output do not contain randomized synthetic secret values. The route privacy test also asserts no successful verification record on failure.
- **Mobile PASS:** normal taps on Chat, Goals, Knowledge, Results, Computer, Agents, Review, Channels, Files and Manage; every one of the **19** settled Manage entries. No forced clicks, script clicks or coordinate workarounds. Named controls, 44px navigation targets, Escape/focus behavior and absence of horizontal document overflow verified. Desktop smoke at 1440 × 900 passes. [Inventory](manage-inventory.json), [mobile](mobile.png), [desktop](desktop.png).
- **Chat → Files PASS:** real browser upload, canonical filename/type/size/time/thread metadata, list/search/open via UI, authorized byte readback, reload, same filename twice with distinct IDs, unavailable Blob returns safe 404 while inventory remains usable, failed upload retains draft and creates no phantom successful file.
- **Owner isolation PASS:** actual browser-created PostgreSQL record has authenticated `acceptance-sarah` owner and canonical thread/storage identity. Owner B cannot list or open it. API unit tests separately verify client owner fields cannot override the authenticated principal. [Five database checks](owner-isolation.log).
- **Agent retrieval PASS, narrowly scoped:** the canonical owner-authorized content route supplies the exact bytes and file ID to the intercepted Agent request. The user asks about the synthetic file in Chat. Model execution is stopped at the session boundary; a grounded model answer remains **UNQUALIFIED**.
- **Owner Data PASS:** same canonical file ID appears in inventory and backup metadata. Binary content remains reference-only; no second Files copy, no storage credentials or private Blob URL in the portable archive.

[Final browser log: 6/6](browser-after.log). Browser scenarios contain multiple assertions and workflows; counts are scenarios, not inflated assertion counts.

## Archive policy boundaries

ZIP v1 paths are ASCII and case-sensitive, independent of host filesystem semantics. Case variants are distinct ZIP names but invalid against the exact v1 manifest. Percent-encoded names are rejected; JSZip does not percent-decode them. Unsafe traversal/normalization aliases, encryption, ZIP64 and alternate Unicode path headers are rejected. Limits remain 25 MB compressed, 64 entries, 10 MB per entry, 50 MB expanded and 100:1 compression ratio. Actual inflation is bounded even when attacker-controlled size headers lie.

The portable backup contract uses canonical **key-based** credential exclusion. It had no general credential-value scanner to reuse. Ordinary owner prose, token-usage counts and reconnection metadata remain valid. Secret-like prose in otherwise safe-named content is not heuristically classified; no aggressive new value scanner was added. Secret-field detection operates on parsed objects and JSON key tokens using the same policy, preventing duplicate JSON keys from hiding a secret-bearing object.

Verification does not perform restoration. Invalid archives receive HTTP 400 (oversize HTTP 413), no successful verification audit, and cannot become restore-eligible through this path.

## Regression

| Check | Result |
|---|---|
| Full Eve unit suite | **628 passed**, 88 files |
| Core contracts | **134 passed** |
| Backup security | **46 passed** across archive/data suites, plus route/privacy tests |
| Files unit tests | **10 passed** across API, metadata, upload-batch and service suites |
| Browser | **6 passed** |
| Real PostgreSQL file checks | **5 passed** |
| TypeScript | Eve and Builder PASS |
| Capability Registry | **135 definitions / 99 authored tools**, PASS |
| Skill routing | **93 checks**, 50/57 rank one (87.7%), PASS |
| Builder manifest | **146 prunable files**, release 255, PASS |
| Eve production build | PASS (`npm run build -- --webpack`) |
| Builder production build | PASS (`npm run build -- --webpack`) |
| Executor inventory | **516 classified sources; UNKNOWN=0**, PASS |
| Diff check | PASS |
| Secret scan | PASS; scoped source/evidence pattern scan, plus dynamic synthetic-marker leakage assertions |

Builds use Webpack because this isolated worktree links the existing dependency installation outside its root. Existing package warnings appear in build logs (including noVNC top-level-await compatibility); both production builds exit 0. No deployment was run. An optional production-runtime screenshot probe did not qualify navigation under production auth and is not counted; acceptance browser results use the documented isolated development-auth harness.

## Evidence and scope preservation

The original 251-section ledger is updated at [COVERAGE.md](../myeve-acceptance-88370d0/COVERAGE.md) and [coverage.json](../myeve-acceptance-88370d0/coverage.json). Revised entries preserve baseline fields. Sections 58, 79, 179 and 241 now pass. Sections requiring model-grounded file reasoning remain explicitly incomplete. Unrelated identity, accessibility, confirmation and provider limitations remain recorded.

New plain-text log copies have ANSI terminal controls and trailing whitespace removed; results are unchanged. Original report, coverage, evidence and PostgreSQL database were not changed. [Baseline hashes](baseline-preservation.json) identify them. A new database `blocker_fixes` was restored from the preserved synthetic acceptance dump on localhost:55473. No direct database insert was used to make the Chat-uploaded file appear in Files.

Product edits are limited to the archive verifier/preflight and route error handling, chat drawer/composer, Files opener size and owner-safe file/thread join. Remaining files are permanent tests, test fixtures/dependencies, required executor inventory review and evidence. Jev remains at `38dc7281659b025f02b89edb138d38763b516955` with its pre-existing changes untouched. Migration reconciliation, b36f016 and lazy Computer workstreams were not modified.

## Separate model-backed gate

The installed Agent uses `gateway(model ?? "anthropic/claude-sonnet-5")`. The installed Gateway SDK accepts **one** of:

1. Existing valid Vercel AI Gateway authentication through a scoped `VERCEL_OIDC_TOKEN` for the intended project/team; or
2. A single server-only `AI_GATEWAY_API_KEY` authorized for the selected Gateway model, with usable quota.

No full Vercel environment, database credential or unrelated provider credential is needed. Keep the isolated local database and synthetic owner configuration. Model-mediated qualification requires separate authorization; none was started or scheduled and no credential was retrieved.

Shared database access: **NONE**. Production mutation: **NONE**. Deployment: **NONE**. External sends: **0**. Git fetch/push are source-control activity, not product sends. Do not merge this branch yet.
