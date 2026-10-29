# Dashboard read adapter

`apps/eve/lib/dashboard/read-adapter.ts` composes the dashboard's two read handlers
with trusted server authentication, current installation policy and a canonical
Relay read transport. It does not register a route or supply those authority
ports. Missing composition is unavailable; missing/revoked binding is denied. No environment flag creates
a grant, and no browser field supplies an owner, account, Agent or credential.

The internal context record is a detached snapshot of authenticated owner/session,
installation, Relay account/Agent/connection revision, context revision/expiry and
authorized repository/ref/workflow policy. The host must obtain these facts from
canonical records and independently establish permitted retention validity; the
adapter does not invent a cache lease or acceptance approval. A binding expires
within 300 seconds and must not slide under the same context revision. Re-resolve
authentication and the entire binding before and after each provider operation,
and before releasing private JSON. Any changed field or denial fences the response.
An authenticated request with no valid binding returns 403, including the first
read after revocation, so the browser clears prior data. Actual authorization
service outages must throw an unavailable error; they cannot masquerade as a
valid binding or a known denial.

Only GET requests to `/api/dashboard/v1/context` and
`/api/dashboard/v1/observation?repositoryId=...&ref=...` are supported. The latter
requires the catalog's `x-dashboard-context`; the header grants nothing. Reject
extra/duplicate inputs, unknown repositories/refs, cross-site reads and all writes.
Responses use private/no-store, JSON and nosniff, with fixed opaque errors.
The browser DTO matches the independently accepted dashboard source
`f9a878d5a510296e42688c24e463dc1eabe8a721`.

The trusted transport exposes only repository/branch get, workflow-run list/get,
and deployment/status list. It must use the canonical owner/account/Agent
connection and separate current read grants, reject redirects, bound JSON, honor
cancellation and preserve typed authorization/rate/unsupported failures. No caller
URL or credential is passed into this module. This is not Work-scoped delegation,
a new permission system or an ActionGateway bypass; installing a host composition
still requires the actual approved platform read binding. Existing write-scoped
GitHub token providers cannot serve as that read binding.

Repository IDs are checked against provider metadata before and after aggregation;
the branch tip must remain equal. Runs are scoped to the exact branch/head and
rolling 24-hour window. At most five pages of 100 runs are read. Page caps,
duplicates and failed later pages remain incomplete. Each selected qualifying
workflow/event pair additionally resolves its current run detail. Detail must
preserve immutable run/workflow/event/ref/SHA/creation identity, not decrease the
attempt/update time, and not contradict list state at an equal same-attempt
timestamp. Unresolved pairs are omitted from current evidence rather than falling
back to an older success or failure. Missing policy remains UNKNOWN in the client.

Deployment reads require their explicit policy bit. They cover one page of ten
records and one page of up to 100 statuses each. Unresolved/latest-status ambiguity
is partial/unknown, never an inferred successful deployment. Status IDs must be
unique and their times must lie between deployment creation
and the authenticated server observation. Future or duplicate/contradictory status
records leave that deployment partial/unknown without selecting an older success.
Deployment-only
permission failure is separate from CI; whole connection or host-context denial
fences the entire response. No deployment operation exists here.

An observation has a ten-second abortable deadline, at most 32 provider reads and
a 512 KiB JSON response. The underlying transport must enforce its own body and
network bounds. A policy too large for this resource envelope remains unavailable
or incomplete; no successful coverage is fabricated. There is no automatic retry,
log/credential export, paid Work, workflow dispatch or sandbox operation.

Run the public unit tests with Node 24:

```sh
node --test apps/eve/test/dashboard-read-adapter.test.mjs
```

Tests use synthetic trusted-port fixtures and are not canonical login, installed
capability or protected-verifier qualification. Actual host authentication and
approved policy/Relay transport composition, hosted source qualification,
custodian-approved criteria and protected verification, signed Result/Proof,
isolated MyApps delivery and exact installation/served artifact/rollback identity
remain required before beta readiness. No production or tester configuration is
changed by this source unit.

## Signed web-session authentication port

`lib/dashboard/web-auth.ts` supplies the existing handler's authentication port
through `authenticateWebPrincipal`. It requires a real signed preferred or
legacy cookie even in development, checks configured credential versions and
durable session revocation on every call, and preserves partner private-route
refusal. Signed-cookie validity is checked again after the asynchronous stores
return. Only the two dashboard GET paths and matching origins are accepted.
The returned session revision is a domain-separated hash of the authenticated
owner and exact cookie; the cookie and signing material are never returned.
Session replacement, credential changes or configured logout revoke retained
context at the read handler's existing repeated authentication gates.

This function registers no route and creates no session, credential, policy,
installation, retention lease or Relay grant. Current authentication storage
failures retain the existing fail-closed null result. Cancellation discards a
late authentication result; it does not claim to cancel the underlying storage
operation. Tests use real synthetic signed cookies and mocked existing stores;
actual installed login, policy, read-grant and productive Work qualification
remain separate requirements. A signed owner session alone grants no dashboard
repository access, and legacy Agent MCP tests do not qualify Work-scoped v2 MCP.
