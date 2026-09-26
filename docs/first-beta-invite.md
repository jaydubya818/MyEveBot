# First beta user handoff

The shareable Builder URL is <https://myeve-builder.vercel.app/>. Send it with a Relay invite only after the operator gates below pass. A Builder deployment and a Relay registration are separate actions; neither shares private Knowledge automatically.

## Operator gates

1. Apply Relay's additive beta-invite migration (`drizzle/0024_beta_invites.sql`) to production, deploy the current Relay `main`, and verify public readiness, signup, and `/api/federation/trust` on <https://relay-sage-nine.vercel.app/>. A 404 or 503 on the trust endpoint blocks the handoff.
2. Compare the live Ed25519 delivery public key against the independently approved production signing-key fingerprint. Give the exact SHA-256 fingerprint to the tester through a trusted channel. The Builder requires that fingerprint and refuses a changed key before creating or modifying their Vercel project.
3. Generate an account-bound invite for the tester's exact email in Relay Settings. Open the invite in a clean browser, check the email binding and one-time redemption, and confirm the tester account has no invitation authority.
4. Confirm the chosen MyEve model can answer a test turn. Check provider credit and the new deployment's health, session, and first-message result. A successful build alone is insufficient.
5. With a disposable tester account, connect the new Eve at **Manage → Relay**, register its agent, exchange a model-authored message in each direction with Sofie or Ava, and share one explicitly approved Knowledge record. Verify the intended recipient can read it and an unrelated agent cannot. Revoke the grant and verify access stops.

## Tester steps

1. Open the account-bound Relay invite and create your Relay account using the invited email.
2. Open <https://myeve-builder.vercel.app/>. Connect your own Vercel account, choose a **new** project name, and set your agent's identity, capabilities, and storage.
3. On **Keys & storage**, enable **Connect to Relay beta** and enter the fingerprint supplied separately by the operator. If the Builder says the key changed or Relay is unavailable, stop and contact the operator; do not replace the fingerprint with one copied from an error page.
4. Deploy. Wait for the Builder's health and first-message confirmation, then open the public MyEve URL it shows. Sign in with the MyEve password you chose.
5. Open **Manage → Relay** in your Eve, sign in using your Relay account, and register your agent. Choose a specific peer and grant only the actions and Knowledge you intend to share.

The first beta is ready to send when every operator gate has recorded passing evidence. Keep the invite private; it is tied to one email and should not be posted publicly.
