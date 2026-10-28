# Explicit local V4 candidate custody

`FactoryWriterStore.takeLocalCustodyV4` is an inactive server API for retaining
data from an already admitted local V4 receipt. Existing callers and
`takeCustody` continue to select the legacy consumer. No service, route, default,
dispatch, installation or verifier is enabled by this API.

The caller supplies a trusted repository snapshot and repository profile. Both
are detached before asynchronous work. Only the existing bounded SHA1, regular
UTF-8 source model is supported. The complete source tree must independently
match the immutable V4 `inputTree`; its commit must match `inputCommit` and the
admitted writer base. Repository, profile and allowed paths remain subject to
current trusted admission and the existing SQL checks.

The API rereads the owner-scoped writer and refuses changed immutable identity,
unresolved dispatch, cancellation and missing terminal fencing. It explicitly
selects the strict V4 consumer and reauthenticates the saved canonical receipt
with current keys. Delivery aliases are refused. The bounded patch is applied
as Git data in a fresh temporary repository with hooks disabled. Returned
workspace paths, producer commands and candidate code are never executed.
Raw producer commit bytes, commit/tree identity and changed paths must match.
Current receipt eligibility and trust are checked again after materialization.

The shared data-only materializer now rejects binary, NUL and invalid UTF-8
patches and patches larger than 2 MiB before creating temporary storage. A
read-only `git apply --numstat -z` preflight limits patch paths to 200 before
applying text changes. Canonical same-path Git diff headers must match that
metadata. Structural copy/rename and nonregular mode changes are unsupported;
an ordinary bounded delete/add diff can represent a path move. This prevents
metadata-only copies from multiplying retained source bytes. Existing file and
final tree limits remain enforced.
This also rejects unsupported legacy binary input earlier; the legacy consumer,
caller selection and `takeCustody` body remain unchanged.

The unchanged serialized SQL handoff retains the current Work, writer,
generation, canonical receipt, repository and profile fences. The full current
migration chain includes MissionControl owner admission, signed revocation and
READ_COMMITTED guards. Exact custody replay converges; conflicting bytes fail.
The resulting workspace is `VERIFICATION_REQUESTED`. Independent verification
is **NOT_RUN** and readiness remains **NOT_READY**.

The public source tests use generated signing keys and synthetic Git objects.
The separate PostgreSQL fixture installs the full current chain and constructs
current synthetic owner, installation, Agent, capability and signed admission
records. It exercises actual handoff, replay, UNKNOWN, revoke, isolation,
cancellation, takeover, generation, aliases and key revocation. It runs no
provider or protected verifier and reads no historical tester allocation or
private custody. Its database and roles are randomly named, loopback-only and
removed after sessions quiesce, without forced drops or suppressed errors.

Supplemental CI explicitly selects this test file and database fixture while
retaining the preceding public receipt checks. This source evidence cannot
approve protected dashboard criteria, clear financial history, qualify a real
productive journey, or authorize activation.
