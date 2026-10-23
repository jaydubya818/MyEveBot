# MyEve passwords

Settings → Change Password updates the existing database immediately. No deployment is involved. A successful change or reset invalidates every existing signed session for that owner, including legacy cookies. Conversations, owner IDs and connected applications are unchanged.

Forgot Password explains the owner-assisted recovery flow. Verify the tester through your established contact channel, then issue a link with the intended tester database loaded:

```sh
node --env-file=/private/path/tester.env --import tsx apps/eve/scripts/password-reset.ts \
  --owner=EXISTING_OWNER_ID --installation=prj_EXISTING_PROJECT \
  --origin=https://EXISTING_TESTER_HOST --output=/private/path/reset-link.txt
```

The file is created with owner-only permissions and is never overwritten. Share it privately with that tester. Links expire after 15 minutes, work once and replace any earlier link for that owner. Issuing a link does not sign the owner out or change their password. The tester opens it and chooses a new password. There is no public reset issuance endpoint and no automatic email service.

## Initial rollout

Apply additive migration `0108_application_passwords.sql` through the migration runner to the existing database. Enable `MYEVE_APPLICATION_PASSWORDS=true` once per installation and deploy the qualified source. Keep `MYEVE_OWNER_ID`, `MYEVE_SESSION_SECRET`, database bindings and the existing durable-session flag unchanged. `VERCEL_PROJECT_ID` namespaces authentication records. Do not use the same credential store namespace for previews and production; test previews against an isolated database.

The first successful login imports the legacy deployment password as an independently salted scrypt hash. Existing sessions remain valid at credential version zero. After a database credential exists, the deployment password can never be used as a fallback. Subsequent changes are database-only. Before removing bootstrap password variables, initialize every configured owner and retain the existing session secret.

Hashing uses Node scrypt N=131072, r=8, p=1, random 128-bit salt and a 512-bit key. New passwords require 15–128 characters and allow spaces and Unicode (NFC normalization). Authentication inputs are bounded to 4096 bytes. Database-backed limits apply across serverless instances; authentication fails closed on storage failure. The trusted Vercel client-IP header is used only on Vercel; IPs are stored as SHA-256 digests.

An installation-scoped, domain-separated HMAC fingerprint enforces password uniqueness across legacy primary/partner owners atomically. The key is the existing session secret, which this rollout does not rotate. Future session-secret rotation must also recompute fingerprints after password verification; do not rotate that key independently and assume uniqueness remains enforced. Existing COMPUTER/VNC transports authenticate when opened; these tester installations deny the COMPUTER feature, and this release does not add desktop transport support.

## Deployment and rollback

Qualify login, change, old-password rejection, legacy-cookie revocation, recovery replay/expiry, separate installations, database outage, CSRF and mobile layout before serving production traffic. Add the migration before enabling the feature. Preserve existing signed cookies until the owner actually changes their password.

After a password has changed, rolling back to a build without database password support would restore old deployment passwords and old-cookie acceptance. Never roll back authentication to that version. Keep the qualified password implementation and roll back unrelated product changes independently. Retain this additive migration and credential records.

Keep Vercel Standard Protection (`all_except_custom_domains`) enabled so previous/immutable deployments cannot expose retired authentication code publicly. Verify this protection before production promotion.

References: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), installed Eve auth guide, installed Next.js authentication guide.
