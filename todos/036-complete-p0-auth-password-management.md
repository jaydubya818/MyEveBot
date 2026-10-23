---
status: complete
priority: p0
issue_id: "036"
tags: [authentication, security, beta]
dependencies: []
---
# Restore tester access and application passwords

## Scope
Preserve each installation's owner, database, integrations and conversations. Preserve existing signed sessions until a password is changed. Use the existing Postgres database for credentials, credential versions, reset tokens and durable rate limits.

## Acceptance
- [x] Both actual tester aliases authenticate in a real browser.
- [x] Settings password change takes effect without deployment; other sessions are revoked.
- [x] Owner-issued expiring single-use recovery works and rejects replay.
- [x] Salted scrypt hashes, durable rate limits, bounded requests, same-origin checks.
- [x] Regression tests, independent security review, production qualification.

## Work log
2026-10-22: Matched deployed auth source to 1582df4a. Tester 1 password update postdates serving release; existing redeploy became READY and live login/status returned 200 with original owner ID. Work isolated from unrelated dirty checkout.

2026-10-22: Both canonical tester deployments now serve 7e191bdd. Both Chrome logins, Settings, preserved sessions/identities and additive migration verified. 126 maintained checks, 18 independent review checks, local built-server HTTP journey and both provider builds passed. Recovery is owner-issued per explicit user decision.
