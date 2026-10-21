# Qualified fixture and composer integration

This is nonproduction preparation under the user's Final Autonomous Execution
Directive, sections 2, 7, 9 and 12. Those sections delegate test corrections,
integration and independent qualification. The earlier pricing guidance reported
no pricing objection to synthetic admission fixtures and reserved production
pricing, source/configuration identity, successor FactoryVersion and release
authority. Our proposal's broader requirement for owner acceptance before *any*
fixture consumption was an inferred gate; it is removed for this bounded test
integration. No canonical-owner approval of MyEve `97743809` or Factory `b12031ea`
is claimed. Their independent source reviews and exact hosted results support
engineering integration; they do not approve installed or production identities.

## Source boundaries

The manifests pin immutable full SHAs and before/after SHA-256 values. Existing
runtime integration pins remain MyEve `afa65bd4` and Factory `18e59dbe`. No wholesale
successor source adoption occurs.

- MyEve's four fixture files come from `74d1358345f6cf9bb3d0e380bd7e5ebc486522fa`.
  The production-validation test retains the complete applied migration ledger
  and checksum assertion in place of the canonical fixed final-migration name.
  The reviewed cleanup correction drains owned PostgreSQL sessions before an
  unforced database drop and observes an intentionally terminated connection's
  end before discarding it. Two regressions cover held-backend cleanup and delayed
  fatal-message delivery. Unexpected errors remain failures. The composed input
  hash and complete-ledger transformation are unchanged; the other three fixture
  files retain their existing exact hashes. Failed hosted run `38088286997` remains
  historical evidence of the cleanup race, not a waived or suppressed check.
- Factory's six fixture files come from
  `b12031ea65fa5c2e0a03763b931003ab78017580`. The admission helper and three earlier
  admission tests are already identical. Only the authority/delivery fault setup
  changes. Three independently reviewed producer inventory entries are copied
  individually after verifying unchanged runtime bytes and classification; all
  other canonical and MyApps records remain intact. No checker is changed.
- Composer source comes from `c7b9e948454cbb7eb7d5fc92f4bbc65918b56ab5`, whose
  canonical base is `977438094ad830f6cb80523a890ca9188f32febe`. Eight exact text
  hunks preserve focus and selection across same-thread refresh. The previously
  composed chat is byte-identical to that base. The overlay verifies the canonical
  patch, then applies it to the composed file; it never substitutes a whole chat
  from a newer branch. Any different lifecycle bytes stop the overlay. The exact
  committed browser regression and qualification document accompany the patch.

All manifests validate before any output is written. Wrong pins, changed fixture
bytes, changed composed inputs, altered inventory records, runtime mismatches and
changed composer lifecycle bytes fail closed. Existing deployment controls and
workflows are not replaced by these overlays.

The synthetic productive fixture has a distinct price revision and source digest,
test-mode opt-in, bounded expiry and deterministic transport. Historical numbers
are test inputs only. Real database time, reservations, accounting ceilings,
UNKNOWN logic, original assertions and the three protected-custody gates remain.
It grants no current pricing, private custody, executable production or release
authority. Explicit holds and the separate UNKNOWN approval requirement remain.

## Integration interface and qualification

The recipe supplies `applyFixturesOverlay` with `name`, `integration`, `source`,
`read(sha,path)`, `readComposed(path)` and `put(path,bytes)`. The composer overlay
uses the same interface for MyEve. Missing paths return `null`. Run both after
existing composition conflict resolution; retain their returned provenance in the
composition receipt. Proposed source keys are `qualificationFixtures` per repo
and `myeve.composer`.

The source repositories must contain the exact pinned Git objects. Run:

```sh
MYFACTORY_SOURCE_ROOT=/absolute/path/to/qualified-factory \
  node --test scripts/myapps-composition/fixtures-overlay.test.mjs \
  scripts/myapps-composition/composer-overlay.test.mjs
```

Eight fixture/composer overlay cases cover exact source transformations, preserved migration and
unrelated records, substituted pins, changed test bytes, stale runtime metadata
and changed lifecycle code. This is source-bound validation, not a substitute for
the resulting candidate's full composition, PostgreSQL, build, browser, identity,
fresh-clone, independent security and exact-head hosted qualification. The three
private-custody cases remain NOT_RUN without their real authorized inputs.
