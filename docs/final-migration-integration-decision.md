# Final migration integration decision

The two qualified 0031 identities are distinct and immutable:

- `0031_computer_template_lifecycle.sql` creates preparation, waiter and event ledgers. It remains canonical for fresh installs, followed by `0032_computer_resource_lifecycles.sql`.
- `0031_deployed_lineage_reconciliation.sql` performs thread-proven file ownership reconciliation and creates historical/equivalence audit tables. Its original bytes are retained under `scripts/historical-migrations/`, with its exact qualified SHA-256 and original ledger identity recognized explicitly.

The next available canonical number is `0033`. `0033_final_lineage_bridge.sql` creates a forward bridge receipt. Its runner transaction applies the immutable reconciliation statements only when the exact historical reconciliation has not already executed. In that case the bridge receipt records the historical 0031 identity as semantically satisfied by the bridge, without inserting a false historical applied row. If the historical 0031 already executed, its ledger row and original audit receipt remain unchanged. The bridge records the complete pre-bridge ledger, the canonical manifest through 0033, and exact semantic-satisfaction identities separately.

The only accepted alternate base is the complete pinned feature lineage 396631a. Its canonical 0030 remains semantically satisfied after object verification, never falsely marked executed. Known reconciliation and Lazy Computer prefixes can advance to 0033; unknown checksums, partial alternate histories, invalid receipts and ambiguous file ownership fail closed. Canonical clean prefixes remain supported.

All 0031/0032 historical SQL bytes and existing ledger names/checksums/timestamps remain immutable. Fresh installs have one unique ordered 0001–0033 manifest. Future migrations start after 0033. Locked ledger comparison, atomic bridge/receipt insertion, exact receipt validation and schema verification make reruns safe. No schema object or owner data is destructively dropped by the bridge. Isolated PostgreSQL qualification must cover each origin and structural convergence before this candidate can be published.
