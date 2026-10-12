# MyApps current-source CI gates

The release jobs in `myapps-composition.yml` and `myapps-reference.yml` qualify
the event's exact MyEve source with Factory
`e36c92e1968a6fa5ffc72b3de3ad1cfebaa6e816`. Both repositories are separate clean
checkouts. The existing Unified Beta qualification envelope checks the selected
Factory commit, records both commit/tree identities and migration/lockfile hashes,
and retains every activation permission as false. The envelope is retained with
the job artifacts. It is source evidence, not an installation grant or an
installation-specific FactoryVersion.

The three composition jobs retain their runtime, PostgreSQL, recovery, packaging,
browser and capability checks. They run directly on the selected source; they do
not reconstruct an older release through the phase-three materializer. The
reference workflow uses the same Factory selection and retains its separate
synthetic browser and runtime checks. Both workflows run on the existing
deployment-disabled unified qualification branch.

Historical provenance remains independently checked. Historical fixture reads use
the preparation commits in `historical-composition-fixtures.json` instead of the
moving checkout HEAD. These identities are recorded by the original offline
snapshot commit and frozen Factory identity manifest; their byte
assertions and mutation rejection checks remain unchanged. The composition rehearsal
still runs every `scripts/myapps-composition/*.test.mjs` test, including rejection
of unreviewed materializer inputs and the immutable overlay/preimage assertions.
The frozen Factory `92299fbd88004cc1da9178d52664bd0a9cd28647` full-history test
compares its source digest to the retained compatibility manifest. The frozen
MyEve `afa65bd4c2d3ce26691a07132030cad1a1ef140e` allowance test remains a historical
comparison. Neither checkout represents the selected release. In particular,
the historical Factory digest must not be equated with the successor's digest.

`docs/myapps/phase3/sources.json`, the materializer and every historical overlay
manifest remain unchanged. Replaying that materializer still requires the exact
preparation commits in its manifest; a current release checkout must be rejected.
No historical success substitutes for fresh hosted qualification of a new commit.
