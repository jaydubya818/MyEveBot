# Reproducible offline source export

The canonical builder normally writes the current time to `eve-builder.json`'s
`deployedAt`. Repeated exports at preparation `6041fbb54a70516c06c739d8d2939d9f78c68fa8`
therefore failed a complete raw-byte comparison. The original failure evidence is
retained; timestamp normalization is not accepted as full export qualification.

Offline MyApps qualification now supplies an explicit internal assembly timestamp
derived from the exact composed source commit's Git committer time. This is a
second `assembleDeployment` argument, separate from wizard/request input. Normal
deployment and update callers still use one argument and retain current-time
metadata. There is no environment override or global clock replacement.

The exporter requires a clean committed checkout, rejects selected source files
that are not tracked (including ignored files), and checks source HEAD/tree and
cleanliness again before issuing its receipt. The receipt records the commit,
tree, timestamp, timestamp derivation and complete output hashes.

Dedicated qualification exports twice before dependency installation. Its verifier
reads every actual output file, checks each complete receipt, and requires equal
source identities and equal raw hashes for every file, including metadata, with
no exclusions or normalization. Both raw metadata files and export receipts are
retained in hosted artifacts. The proof covers the generated source package;
dependency resolution, platform-specific build output and installation remain
separate checks. No deployment, installation authority or release hold changes.
