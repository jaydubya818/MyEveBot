# Existing Relay connection audit

`lib/relay/installation-validation.ts` prepares a read-only, reviewable credential reuse plan. It performs no import, credential resealing, database mutation, HTTP authentication, recovery or activation. No route, model tool or runtime fallback invokes it.

The host supplies an independently pinned private plan and the exact legacy MyEve, live Relay and reserved target database references. The plan pins original local owner/Agent, Relay account/operator/principal/Agent/credential, origin/address, source connection policy and signing key, sealed-secret ciphertext digests, encryption-key digest, live capability/grant/delegation scope digest, and reserved tester slot/project/owner/Agent. Private identities, references, keys and ciphertext are not committed to source or logged.

Every database read runs in a PostgreSQL `REPEATABLE READ READ ONLY` transaction with a checked read-only setting and bounded statement timeout. The source sealed credentials must authenticate under the original owner's AES-GCM additional authenticated data. Canonical Relay credential/session token hashes are checked directly against current canonical rows; existing authentication helpers are not called because they update last-used timestamps. Current credential expiry/revocation, account retirement, Agent status, human principal and OWNER membership are required. Any scope digest change or existing target connection denies the plan.

The result contains only identity, digest/provenance and authentication-status metadata. A valid Agent credential does not establish an active beta grant or delegation. Expired grants stay expired. An expired, revoked, invalid or absent saved owner session reports `OWNER_AUTH_REQUIRED`; it is never described as VALID or recovered. The helper sets mutation, activation and scope-authorization flags to false.

Real PostgreSQL tests build the Relay database from all 29 migrations at exact deployed source `8a8678d675adc8ac7f799d7660071de2256bb231`, plus two disposable MyEve databases. They use generated synthetic credentials and check owner-AAD tampering, exact references and target binding, live revocation/expiry/inactivity, capabilities, expired grant/delegation custody, no target insertion and unchanged source ciphertext/last-used timestamps. Run them with a localhost `MYEVE_EXTERNAL_ALPHA_TEST_DATABASE` and a canonical Git checkout containing that Relay commit at `MYRELAY_SOURCE_ROOT`:

```
npm exec --workspace apps/eve -- vitest run --fileParallelism=false lib/relay/installation-validation.test.ts
```

This audit creates no operator, account, Agent, invitation, credential or session. A future installation mutation, if explicitly authorized, requires separate implementation and review.
