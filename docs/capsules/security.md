# Capsule security boundary

Integration-preparation update (2026-09-27): [current crosswalk and boundaries](integration-crosswalk.md). Supersedes older readiness/dependency notes below; core behavior remains accepted.

CAPSULE CORE: LOCALLY QUALIFIED

SECOND-EVE BENEFIT: PASS — deterministic fixtures

CANONICAL MEMORY EXPORT POLICY: INTEGRATION PENDING

CANONICAL ACTIVATION: INTEGRATION PENDING

LIVE DESIGN-PARTNER CAPSULE: NOT_RUN

The security boundary is an allowlisted data representation plus trusted source policy and inert destination staging. Text scanning is defense in depth, not the authority boundary.

There are no fields for credentials, sessions, approvals, grants, connected accounts, account roles, organization membership, execution eligibility, active Work/Run state, writer leases, completion budgets, Factory dispatch, Relay grants, provider, publication or billing authority. Strict schemas reject extra fields at every level. Raw JSON is size/depth limited and rejects shadowed keys before parsing can discard them. Source adapters classify records separately from their text. Unknown source policy blocks export.

The scanner rejects representative API keys, OAuth/access/refresh tokens, JWTs, cookies, private keys, credential-bearing database/HTTP URLs, GitHub/Vercel/provider/Relay tokens and one-time credentials. It normalizes Unicode/zero-width obfuscation, rejects suspicious opaque encodings, and checks metadata and prose as well as structural keys. Errors never quote suspect values. Conservative false positives require source cleanup; there is no scanner bypass switch.

Representative policy-override, hidden tool grant, role-message and executable HTML fixtures are blocked. Novel prompt injection cannot be exhaustively detected with regular expressions. Imported material remains untrusted data and no import path activates instructions, tools, Skills, Roles, Packs, learning or execution. A production Memory integration must preserve that trust label in retrieval and keep all normal action authorization in force.

Checksums do not authenticate the author or make source policy claims trustworthy. The destination requires the same authenticated owner identity and explicit per-item decisions, then stages content. It does not treat an uploaded owner reference, provenance field, URL, qualification reference or review receipt as a grant. Cross-owner sharing, signed publisher identity and remote revocation are not implemented.

Owner session authentication and same-origin writes protect the API. Responses are private/no-store and nosniff. Clients send source IDs for export; they cannot supply authoritative source-policy facts. Import requests are streamed with a bounded request size before JSON parsing, then independently enforce the 1 MiB Capsule limit. No remote URL fetch, ZIP extraction, symlink traversal, filesystem execution or arbitrary file reads occur.

Evidence includes adversarial export/import fixtures, independent fresh destination, concurrent PostgreSQL submissions, owner isolation, tamper tests, process termination before/after commit and re-import after restart. Reported zero counters apply to that measured local corpus. They are not a proof that arbitrary unlabeled sensitive prose can always be recognized.

Production limitations: canonical Memory exports remain gated on authoritative portability policy; saved imports remain inert. Existing Current Truth is never replaced by this feature. The local fixture retrieval proof is not a production agent or Factory qualification. Source and destination credentials were not connected or reused during qualification.
