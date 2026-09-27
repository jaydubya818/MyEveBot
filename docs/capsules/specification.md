# Memory Capsule specification — 1.1

Integration-preparation update (2026-09-27): [current crosswalk and boundaries](integration-crosswalk.md). Supersedes older readiness/dependency notes below; core behavior remains accepted.

CAPSULE CORE: LOCALLY QUALIFIED

SECOND-EVE BENEFIT: PASS — deterministic fixtures

CANONICAL MEMORY EXPORT POLICY: INTEGRATION PENDING

CANONICAL ACTIVATION: INTEGRATION PENDING

LIVE DESIGN-PARTNER CAPSULE: NOT_RUN

A Capsule transfers explicitly selected experience. It cannot grant authority. This is a bounded portable representation and review workflow, not a Memory database, account backup, or executable package.

## Envelope and integrity

`myeve-memory-capsule` is UTF-8 JSON with strict `manifest`, `items`, and `digest` fields. The manifest contains a UUID, format version, creation time, opaque owner reference, source Eve reference, reader compatibility, review-required activation policy, and an ordered inventory. Each inventory entry binds the entire item (including scope, provenance, version, title and content) with SHA-256 and canonical byte size. The envelope digest binds the entire manifest and item collection. Object keys use lexical ordering; selected items sort by ID. Given fixed time and UUID, export is deterministic. Array order is significant. Export never writes source Memory.

Canonical JSON is this application's deterministic serializer, not a claim of RFC 8785 compliance. Duplicate JSON keys (including escaped aliases), unknown properties, identity collisions and extra inventory entries are rejected. A digest detects edits against the recorded digest; it does **not** authenticate the author. An attacker who rewrites content and recomputes all hashes creates another untrusted package, which must still pass validation and owner review. No signing credential is exported or required.

## Content and bounds

The allowlist is memory, Knowledge, preference, project context, procedure, Skill text, Role text, Pack text, example, promoted learning, and selected readable file content. Every item has a stable source ID, semantic key, title, text, semantic version, private scope and provenance. Provenance includes source type/reference, revision, observation time and source-policy reference; learning also requires a qualification reference. Skill/Role/Pack contents are descriptions, never serialized runtime configuration or tool registrations.

Limits: 1 MiB per serialized Capsule, 100 items, 16 KiB UTF-8 text per item, depth 16. Plain text and Markdown files only. No binary/base64 payloads, archive extraction, external file fetching, executable packages, recursive Capsules or automatic script execution. References are provenance, not URLs that the importer follows. Unknown item kinds fail the envelope. Known kinds unavailable at the destination appear as unsupported and must be skipped.

Reader 1.1 accepts 1.1 and the explicitly compatible 1.0 text subset. Files and promoted learning require 1.1. Future, malformed, legacy M7 engineering, and account-backup formats fail safely. `1.0` is an explicitly defined compatibility fixture, not a claim that a historical production format shipped. No unknown semantics are silently converted.

## Source governance

Selection is empty by default. Export takes authenticated adapter records plus trusted source-policy facts, not client-supplied candidate content or policy assertions. Eligible sources must belong to the owner, be classified personal, carry explicit portability permission and be active; learning must be promoted. Corporate, third-party private, unknown-policy, active Work, authority, session and credential sources are excluded. Selecting a prohibited source fails the export with an explanation. Unselected sources remain excluded.

The current canonical `OwnerKnowledgeView` does not expose a portable-source policy/classification contract. The read-only adapter sets portability to unknown and exports **none** of those records. It does not infer permission from the fact that the owner can view a record. This conservative gate is intentional and must remain until the Memory workstream supplies authoritative policy facts.

## Review and import

1. Validate size, structure, secrets, version, timestamps, identities and both layers of integrity.
2. Require the same independently authenticated owner reference on both deployments. Cross-owner and same-Eve import are unsupported. Source identity remains an unverified provenance claim, not authentication.
3. Present incoming contents, provenance, duplicate/conflict/unsupported classification and target scope.
4. Default new items to skip and conflicts/duplicates to keep existing. Owner choices cover every item exactly once.
5. Bind review to the complete Capsule and destination snapshot; changed content or state requires a new review.
6. Save a complete inert review with an idempotent receipt. No canonical Memory write or automatic promotion occurs.

Owner-scoped and source-agent experience narrow to the destination Eve. Project experience keeps its exact project scope and is unsupported without an authorized destination project mapping. Private content never becomes shareable. Current Truth remains unchanged. Conflicts are keyed by canonical kind/key/scope, not semantic NLP; retaining an incoming conflict creates a correction-review candidate, never replacement truth. Version conflicts, including Skill V2 versus incoming V1, remain visible and cannot silently downgrade.

Imported records retain original item provenance plus Capsule ID/digest, source owner/Eve, import timestamp and item digest. All carry `untrusted_import`. Skills, procedures, Roles, Packs and learning carry `qualification_required`. Non-behavioral context has `reviewed_context` **inside inert Capsule staging only**; that state does not activate it in canonical Memory. An isolated fixture can retrieve selected context to qualify the second-Eve benefit. Production activation is a separate canonical contract.

## Storage, retries and deletion

Exports are assembled in memory and returned only when complete. Browser downloads use temporary local object URLs, which are revoked; there is no permanent public Capsule URL and no server export artifact to recover or delete. Downloaded private copies are under the owner's control.

Production import reviews reuse `owner_data_operations` with `restore_planned`, a Capsule-specific namespace and `activation: none`. Each transaction locks the owner's staging, prunes expired reviews, enforces a 100-review quota, then writes the entire review and receipt in one row. READ COMMITTED statements acquire the quota snapshot after the lock. Duplicate submissions return the original receipt. Review access expires after 30 days; physical expiry cleanup occurs on the next save. Owner deletion removes staged material immediately. This is not encrypted archival storage or guaranteed timed erasure; database backup retention follows the deployment's existing policy.

The local qualification adapter uses a separate SQLite file with full synchronous transactions. It is explicitly unavailable in production and owns no canonical tables. SIGKILL before commit leaves zero imported records; after commit, retry sees the complete original result. Production snapshot checking is sufficient for **inert staging only**; a live promotion adapter must recheck source policy, scope, Current Truth and revision inside the canonical transaction.
