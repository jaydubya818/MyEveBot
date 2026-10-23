# Two-tester chat-only activation

This release narrows the existing external-alpha architecture. It adds no service,
changes no Vercel configuration and preserves owner identities and application
password/session management. The separately approved activation permits ten CHAT
turns per owner per UTC day, reserving $0.10 per turn. Each owner is capped at
$1/day and $5 lifetime; the shared cohort is capped at $2/day and $10 lifetime
within its original 120-hour window. Reservations are never refunded. Explicit
lifetime caps cover a 120-hour interval crossing six UTC calendar dates.

Historical policy JSON and digests remain unchanged. Their nominal full-scope
limits do not grant Work authority: the narrowed shared function, local narrowing
rows and executable tool restrictions enforce this release together.

Apply canonical inert migration `0109_external_alpha_chat_only.sql` to each
existing application database through the checked migration runner. Verify exact
prior checksums and retain all data. On the existing shared accounting database,
apply `shared-accounting-recovery.sql`, `shared-accounting-zero-gap.sql`, then
`shared-accounting-chat-only.sql` while inactive. Do not reapply the base schema
over an existing installation. Preserve function ownership and restricted-role
ACLs; callers receive no table mutation, schema creation or operator authority.

Deploy the qualified application release before enrollment. An authenticated
installation owner can explicitly request
`GET /api/readiness?alphaEnrollment=1`. This read-only, uncached diagnostic returns
only owner/project/cohort/slot, policy digest and the SHA-256 of the exact existing
high-entropy accounting token as UTF-8. It reveals no bearer preimage, policy JSON
or connection URL and creates no enrollment or activation. Keep these facts in
private operator records. Compare the exact serving deployment and original
retained policy before registration. Never substitute a prepared-but-unapplied
package from a different release or export credentials through a diagnostic.

The operator separately inserts each original policy while inactive and its exact
owner/policy row into `external_alpha_chat_only`. Register exactly two matching
central members and their live token fingerprints in one cohort, still inactive.
Verify no UNKNOWN, unmirrored allowance, unresolved dispatch or unexpected history.
For a nonempty target, stop and qualify its actual history before proceeding.
Activate the two local policies first and the shared cohort last under the user's
explicit approval; partial local activation cannot pass the shared gate.

Verify one actual browser reply per installation, persisted assistant/turn
completion, known settlement, owner isolation, current health and preserved
sessions. Confirm zero Work authority/admissions and unchanged Vercel settings,
environment references and domains. If a provider outcome is ambiguous, retain
the charge and UNKNOWN fence; do not refund or retry automatically.

Revocation uses the existing write-once `revoked_at` controls. Preserve accounting
history and narrow SQL on rollback. Do not restore broader Work code/accounting
as an activation rollback. Expiry ends new dispatch after 120 hours and does not
prove unresolved usage settled. Further paid scope or a new trial requires a new
owner decision and qualification.

See [independent security review](../verification/2026-10-23-chat-only-security-review.md)
for test coverage and database-operator trust limits.
