# Durable browser-session revocation

New managed owner deployments enable `MYEVE_DURABLE_WEB_SESSIONS=true`. Their explicit operator migration must install `0083_web_session_revocations.sql` before readiness succeeds. Existing deployments keep their installed authentication mode until an operator installs the migration and enables the setting. They are not qualified for external-alpha session revocation while this setting is off.

Each newly issued signed session contains a random nonce. Logout records the owner and SHA-256 token digest before clearing browser cookies. The database never receives the session token. Repeated logout is idempotent. Database errors deny subsequent authenticated access, and an unconfirmed logout returns an error instead of claiming success.

Application route guards and the Eve channel independently await revocation checks. These checks reject later API requests and stream reconnects. They do not terminate already-admitted streams or independently authorized background Work; those require their own cancellation controls.

For an existing managed deployment: preserve its registry and database backup; apply the additive migration through the canonical operator runner; enable the setting; deploy qualified source; verify login, a second independent login, logout, retained-cookie replay rejection, and agent reconnect rejection. Remove public access to old non-revoking deployments before accepting the gate. To revoke every session, rotate the installation's session-signing secret and fence old deployments.

Validation includes real PostgreSQL migration/rerun checks, revocation across fresh database connections, independent-session survival, expiry, cross-owner denial, and fail-closed storage outages. Production readback is still required for each installation.
