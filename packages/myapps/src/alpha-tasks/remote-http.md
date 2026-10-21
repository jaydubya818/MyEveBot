# Dormant HTTP transport

`remoteHttpExchange` and `remoteHttpReceiver` carry the signed remote-isolation
protocol through one fixed, operator-enrolled endpoint at
`/myapps/remote-isolation/v2`. They create no server, route, production import,
credential loader, enrollment or registration. All existing installation and
hosting gates remain in force.

The trusted configuration loader must bind the endpoint to the exact owner,
installation, agent, host and enrollment digest. These values are snapshotted;
requests cannot choose a destination or change the enrollment. HTTPS is required.
The test-only exception accepts literal `127.0.0.1` HTTP with explicit opt-in and
an actual test/non-Vercel process. This exception does not qualify an installation.
Actual endpoint ownership, certificate/DNS controls and network egress still
require installation-specific verification. This module is not an endpoint
discovery service or a substitute for those controls.

The client sends one POST with no cookies, authorization header, referrer or
automatic retry. Redirects are errors. The receiver accepts only the exact URL
and POST; it supplies no CORS permission. Both directions require uncompressed
UTF-8 JSON, enforce advertised and streamed byte limits, and cancel invalid or
stalled bodies. The request ceiling is6MiB to carry the existing4MiB source
closure in base64; the protocol still independently checks its100KB signed
document and source limits. Responses are bounded to128KiB. The configured
deadline cannot exceed30seconds, and the client also respects the signed expiry.

Each receiver handler permits at most8 simultaneous operations. A timed-out
operation retains its slot until the underlying receive call finishes. A hung
receiver therefore exhausts capacity and fails closed instead of accumulating
unbounded detached operations. Deployment-wide traffic limits, process memory,
proxy/header limits and instance count are still part of actual host qualification.

The transport does not authenticate a JSON shape. `RemoteIsolationReceiver`
must verify the signature, current enrollment and canonical admission before
claiming delivery custody. `RemoteAlphaTasksIsolation` must verify the signed
response and exact request binding. HTTP failures are opaque; private errors,
source bytes and credentials are never included in an error response or log.

A timeout or disconnect may occur after the receiver executed and committed.
Every client transport failure therefore remains `UNKNOWN`; aborting HTTP is
not execution cancellation, cleanup confirmation or an accounting refund. The
receiver may finish the original durable operation after the response is gone.
Recovery uses a fresh signed READ of that same retained command. No automatic
redispatch, new operation ID, backend fence acknowledgment or journal restore is
introduced here.

Qualification uses real loopback HTTP, actual Ed25519 protocol verification and
a disposable PostgreSQL delivery journal under an ordinary role. Its executor
and canonical authorization callback are synthetic. Separate canonical-admission
and offline-Docker suites cover their own boundaries; no actual hosted/TLS,
physical-fence, restored-host or three-user installation claim follows.

The implementation follows Node24's
[fetch and AbortSignal APIs](https://nodejs.org/download/release/v24.21.0/docs/api/globals.html),
[Web Streams cancellation](https://nodejs.org/download/release/v24.21.0/docs/api/webstreams.html)
and the [Fetch redirect-error contract](https://fetch.spec.whatwg.org/#concept-request-redirect-mode).
