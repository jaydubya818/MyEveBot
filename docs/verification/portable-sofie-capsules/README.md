# Portable Sofie / Memory Capsules — local qualification

**Verdict: local qualification passes; design-partner live activation is NOT READY.**

Branch: `codex/portable-sofie-capsules`. Dedicated worktree: `/Users/jaywest/.codex/worktrees/portable-sofie-capsules/Myeve`. Baseline: `a7936898c77d157aa66c222b86aedce07e265e16`, the committed Knowledge browsing fix beyond fetched origin/main `d64f2f96003818b2f51341b54a2edd6f426a0dae`. No merge, deployment, source credentials, account connection or new migration was performed.

The implementation includes the bounded portable format, selection and review, integrity, source-policy/authority exclusion, import preview, provenance, scope narrowing, duplicate/conflict handling, owner UI, existing-PostgreSQL inert staging and an independent restart-capable qualification fixture. It intentionally does not activate imported Memory, Skills, Roles, Packs or learning. Canonical export stays gated where source policy is unavailable.

## Results

| Requested result | Status | Meaning |
|---|---|---|
| Capsule export | PARTIAL | PASS for approved fixture sources; canonical sources fail closed until portability policy exists. |
| Export preview | PASS | Empty initial selection, explicit inclusion, content/provenance/scope/size, deselection, warnings and authority exclusions. |
| Manifest | PASS | Strict format, version, identity, inventory, item digests, provenance and compatibility. |
| Integrity | PASS | Manifest, Memory, Skill, file and provenance mutations rejected; checksums are not publisher signatures. |
| Authority scrubber | PASS | Structural/source-policy checks plus conservative text/secret/encoding scans. |
| Import | PARTIAL | Atomic private review staging and fixture retrieval pass; live canonical activation is unavailable. |
| Import preview | PASS | Source, version, contents, provenance, scope, duplicates, conflicts and unsupported content. |
| Duplicate import | PASS | Stable item/provenance, idempotent receipts, concurrent duplicate PostgreSQL submissions qualified. |
| Conflict handling | PASS | Keep destination by default; retain incoming only as a conflict; no silent downgrade/replacement. |
| Versioning | PASS | 1.1, compatible 1.0 subset; malformed/future/legacy/incorrect reader semantics rejected. |
| Provenance | PASS | Source and Capsule identity/digest/version/scope/import time survive restart. |
| Memory integration | PARTIAL | Read-only canonical adapter; export policy and atomic activation dependencies explicit. |
| Skill import | PARTIAL | Portable text/version stages for destination qualification; never installed or enabled. |
| Role / Pack import | PARTIAL | Descriptive configuration stages; no capabilities/grants/runtime policy applied. |
| Second-Eve benefit | PASS (fixture) | New Work retrieval needs three context inputs: 0/3 without, 3/3 with Capsule after reopen. Not a live agent evaluation. |
| Desktop | PASS | Builder/export and full import/conflict preview at 1440×1000. |
| 390px mobile | PASS | Export, import, duplicate, conflict and tamper journey; measured no horizontal overflow. |
| Accessibility | PARTIAL | Keyboard focus, labels, native selects/file chooser, live status/errors and ≥44px button/select controls checked. No dedicated VoiceOver/assistive-technology audit. |
| Typecheck | PASS | Full Eve `npm run typecheck`: TypeScript, capability registry, Skill routing and executor governance. |
| Build | PASS | Eve production `npm run build -- --webpack`; 88 static pages generated. |
| README updated | PASS | Links to specification, security, inventory, user guide and integration dependencies. |
| Design-partner Capsule | NOT READY | Synthetic local package ready; real Memory export/activation and Skill qualification remain integration work. |

## Security counters

All measured local counters are **0**: credentials exported, credentials imported, sessions transferred, grants transferred, approvals transferred, active Work authority transferred, writer authority transferred, provider authority transferred, billing authority transferred, publication authority transferred, unauthorized private data transferred, and tampered Capsules silently accepted. See [machine-readable qualification](qualification.json) for the actual corpus and measurements. These counters describe the tested fixtures, not exhaustive detection of every possible unlabeled secret or private statement.

## Performance

| Profile | Items | Serialized size | Manifest | Export | Fixture import |
|---|---:|---:|---:|---:|---:|
| Small | 1 | 1,084 B | 456 B | 4.70 ms | 1.23 ms |
| Medium | 25 | 113,846 B | 3,160 B | 14.11 ms | 16.41 ms |
| Maximum | 62 | 1,048,576 B | 7,403 B | 81.80 ms | 120.30 ms |

These are single local measurements, not latency guarantees. Heap deltas include garbage collection and are not peak-memory measurements. The 100-item ceiling and multibyte UTF-8 item limit are separately tested.

## Test and recovery evidence

[Tests](tests.log): **102 passing tests** across core format/security/import, read-only canonical projection, authenticated API, and real local PostgreSQL staging. The PostgreSQL suite was enabled against a disposable UNIX-socket-only cluster using existing migrations 0016 and 0018, never a live database. It covers concurrent duplicate submissions, owner read/delete isolation, 30-day expiry/pruning, and the 100-review quota under concurrent saves.

SIGKILL checkpoints cover generation, manifest preparation, finalization, import preview, actual conflict review, transaction begin, after record staging, before commit and after commit. Restart before commit yields no partial import; restart after commit yields the complete original records and provenance. Retrying yields one controlled result. Source generation is in memory, so no unfinished server export artifact exists. Cloud upload/storage loss is not applicable: this slice creates no permanent remote export object.

The duplicate/restart journey retrieves four permitted context records; the task benefit score uses three explicit inputs: response style, project convention and planning rhythm. Behavioral procedures/Skills/learning remain unqualified and are not activated. A newer local preference suppresses imported context with that semantic key in the fixture. This is deterministic retrieval evidence, not a claim of improved live model behavior or completed Factory Work.

[Typecheck](typecheck.log) and [build](build.log) were run on the final runtime implementation. The existing noVNC top-level-await warning remains in the build. The worktree reuses installed dependencies through symlinks; default Turbopack rejects external symlinks, so the documented webpack mode was used without altering application build configuration. Browser checks use `localhost`, the dev server's canonical origin; an initial `127.0.0.1` write was correctly rejected by the existing same-origin helper. No auth check was weakened.

## Browser evidence

| Evidence | File |
|---|---|
| Desktop builder/export | [Screenshot](../../../output/playwright/capsules/desktop-export.png) |
| Desktop import and conflicts | [Screenshot](../../../output/playwright/capsules/desktop-import-conflicts.png), [semantic snapshot](browser-desktop-import.yml) |
| 390px builder/export | [Screenshot](../../../output/playwright/capsules/mobile-export.png) |
| 390px import | [Screenshot](../../../output/playwright/capsules/mobile-import.png) |
| Memory/preference V2 vs V1 | [Screenshot](../../../output/playwright/capsules/mobile-conflicts.png), [saved conflict](browser-conflict-saved.yml) |
| Tampered file rejected | [Screenshot](../../../output/playwright/capsules/mobile-tamper-error.png), [error snapshot](browser-tamper.yml) |
| Repeat import | [Three duplicates, keep-existing default](browser-duplicate.txt) |
| Keyboard / touch / overflow | [DOM measurements](browser-accessibility.txt) |

The browser journey selected three items, exported a real download, imported them into an independent fixture, then showed three duplicates. Newer Memory and preference values produced two conflicts with the destination retained by default. One incoming conflict was retained as a review candidate; destination V2 remained unchanged. A modified download produced HTTP 400 and a focused, readable integrity error. The successful localhost journey produced no application console error; the expected tamper rejection produced one failed-resource entry. Dev font-preload warnings were present. No automatic “overwrite all” control exists.

## Requirement coverage

| Request sections | Coverage / boundary |
|---|---|
| 1–10 | Inventory, selected bounded content, absolute authority exclusions, source policy, preview, versioned manifest, deterministic export and tamper binding. |
| 11–20 | Independent destination, preview/decisions, duplicates, memory/preference/Skill/Role/Pack conflicts, text procedures/files, promoted-only synthetic learning. |
| 21–28 | Structural and textual authority/secret exclusion, no grants/Work, preserved provenance, identity as data, private/narrowed destination scope, no Current Truth overwrite. |
| 29–37 | Atomic/recoverable staging, real process loss, existing private storage, local download, untrusted/malicious input, behavior qualification required. |
| 38–44 | Measured fixture benefit, golden and negative journeys, tampering, repeat import, conflicts, supported/older/future/malformed version tests. |
| 45–50 | Owner builder/import UI, explicit authority notice, conflict controls, desktop/mobile/keyboard review and exact-limit performance measurements. |
| 51–58 | No migration or shared ownership changes; measured counters; canonical adapters/dependencies; learning scope restriction; Relay/Factory separation; bounded Builder follow-on and beta story. |
| 59–62 | README/spec/security/user/integration documents, coherent commits, autonomous safe local work and explicit final readiness report. |

## Remaining integration dependencies

1. Canonical authoritative per-source portability/classification policy and stable semantic identities. `OwnerKnowledgeView` alone cannot authorize export.
2. Canonical atomic import/promotion with Current Truth revision checks, complete conflict policy, authorized destination Eve/project mapping, provenance and trust-aware retrieval. Current production staging cannot replace that transaction.
3. Destination Skill, Role, Pack and procedure validation/qualification; imported descriptions must not enable tools or permissions.
4. Total Recall advanced during this task to `4b31ddebe8235fc1efca154d41ee37061be2a444`. Its new promoted-learning contract is repository/Work-type/optional-Work scoped and its schema is not activated. Capsule 1.1 must not broaden it. A future versioned adapter must preserve those restrictions, evaluation hashes and rollback semantics.
5. Live owner-confirmed new-Work benefit and assistive-technology qualification before design-partner readiness.

See the [exact integration contract](../../capsules/memory-integration.md). The [initial inventory](worktree-inventory.json) and [final read-only snapshot](worktree-final-read-only.json) record active worktrees. Canonical main's dirty state was unchanged. Other active workstreams advanced independently; none was modified, reset, stashed or cleaned by this task.

## Reproduce

From `apps/eve` in the dedicated worktree:

```sh
npx vitest run lib/capsules app/api/capsules
node --import tsx scripts/qualify-capsules.ts
npm run typecheck
npm run build -- --webpack
```

The four PostgreSQL integration cases skip unless `CAPSULE_TEST_PG_SOCKET` points at a disposable local cluster on port 55439. Never set it to a production database socket. The tests create/use only the existing owner operation table in that disposable database.

The [synthetic design-partner Capsule](design-partner.memory-capsule.json) identifies the fixture owner `capsule-design-partner`. It is deliberately not importable as another owner; generate fixture data under the independently configured owner for a local UI journey. All content and evidence here are synthetic.
