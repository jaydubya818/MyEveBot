import { configuredOwnerIds, ownerForPassword } from "./web-auth.ts";
import { bootstrapCredential, credentialFor, type Credential } from "./password-store.ts";
import { verifyPassword } from "./password-crypto.ts";

export async function authenticatePassword(password: string, env = process.env): Promise<Credential | null> {
  if (!password || password.length > 128 || Buffer.byteLength(password) > 512) return null;
  let matched: Credential | null = null;
  const legacyOwner = ownerForPassword(password, env);
  for (const ownerId of configuredOwnerIds(env)) {
    let credential = await credentialFor(ownerId, env);
    if (!credential && legacyOwner === ownerId) credential = await bootstrapCredential(ownerId, password, env);
    if (credential && await verifyPassword(password, credential.password_hash)) {
      if (matched) return null; // A password must never select two owner identities.
      matched = credential;
    }
  }
  return matched;
}

export async function passwordUsedByOtherOwner(ownerId: string, password: string): Promise<boolean> {
  for (const other of configuredOwnerIds()) {
    if (other === ownerId) continue;
    const credential = await credentialFor(other);
    if (credential ? await verifyPassword(password, credential.password_hash) : ownerForPassword(password) === other) return true;
  }
  return false;
}
