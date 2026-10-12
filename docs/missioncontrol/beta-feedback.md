# Private beta feedback and defect triage

The installed beta exposes `/feedback` and the authenticated same-origin `/api/beta/issues` endpoint. Each report is private to its canonical deployment owner. The API ignores no extra authority fields: the strict input rejects caller-supplied status, Mission, owner or triage notes. A selected Work must belong to that owner; its current revision and retained Mission binding are resolved server-side. Reporting does not invoke learning, models, execution, or permission changes.

The browser keeps its original request ID and payload after a lost response. Retrying recovers the same committed report; changed-payload reuse is rejected. Invalid fields remain editable and private history distinguishes loading, failed reads and an empty queue. Reported impact sets an initial queue priority: cannot continue → P1, impaired → P2, minor/suggestion → P3. These are reporter-supplied impact classifications, not confirmed engineering diagnoses.

Migration `0096_unified_beta_feedback.sql` installs tables, owner RLS and immutable report/history guards. The application receives SELECT/INSERT on `unified_beta_feedback` only in the separately reviewed grant package. It receives no status-update or triage-history write grant. Actual installed migration and role changes remain protected and have not been applied by source development.

The existing operator identity reviews the private queue through `scripts/unified-beta/triage-feedback.mjs`. Its separately authorized database connection is supplied through `MYEVE_BETA_FEEDBACK_OPERATOR_DATABASE_URL`, never in command arguments. An operator can list one owner's first 100 reports, or preview a specific exact-revision change. `--apply` performs only the reviewed status/note transition. PostgreSQL retains the actual database actor, new revision and note in append-only history. A stale revision fails. Operator credentials must never be installed in the web application.

Example commands use placeholders, not installation identities:

```sh
node scripts/unified-beta/triage-feedback.mjs --owner OWNER
node scripts/unified-beta/triage-feedback.mjs --owner OWNER --report REPORT_UUID --revision 1 --status TRIAGED --note-file /approved/review-note.txt
# Add --apply only under the existing operator authorization for this report.
```

For a defect, the triage note records reproduction evidence, affected source/version, a local defect reference and next action. A resolution note records the fix's source and relevant regression evidence; it must not claim an installation is fixed before its deployed source is verified. Reports about UNKNOWN spending or cleanup remain incidents until canonical evidence resolves them; this workflow cannot refund, restart or close execution authority.

Local qualification covers actual owner-session denials, PostgreSQL RLS, concurrent duplicate delivery, conflicting reuse, foreign Work denial, operator-only exact-revision triage, immutable history and pagination. The actual rendered React component is checked with a synthetic same-origin API for lost-response recovery, keyboard submission, mobile/desktop layout and serious/critical automated accessibility findings. This component check does not establish installed authentication or the complete Golden Journey.
