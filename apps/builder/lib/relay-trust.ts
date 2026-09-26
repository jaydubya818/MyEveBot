import { createHash, createPublicKey } from "node:crypto";

// The first beta has one operator-controlled, public Relay origin. Do not
// accept a caller-provided URL: the Builder must not become a fetch proxy.
export const BETA_RELAY_ORIGIN = "https://relay-sage-nine.vercel.app";

export interface ResolvedRelayTrust {
  origin: string;
  keyId: string;
  keyVersion: string;
  publicKey: string;
}

export async function resolveBetaRelayTrust(
  expectedFingerprint: string,
  fetcher: typeof fetch = fetch,
): Promise<ResolvedRelayTrust> {
  if (!/^[a-f0-9]{64}$/i.test(expectedFingerprint)) {
    throw new Error("Enter the Relay signing-key fingerprint supplied by the operator.");
  }
  const response = await fetcher(`${BETA_RELAY_ORIGIN}/api/federation/trust`, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Relay pairing is unavailable. Try again after the operator enables beta federation.");
  const body = await response.text();
  if (body.length > 16384) throw new Error("Relay returned oversized trust material.");
  const parsed: unknown = JSON.parse(body);
  if (!parsed || typeof parsed !== "object") throw new Error("Relay returned invalid trust material.");
  const value = parsed as Record<string, unknown>;
  if (
    value.origin !== BETA_RELAY_ORIGIN ||
    typeof value.keyId !== "string" || !/^[\w.-]{1,128}$/.test(value.keyId) ||
    typeof value.keyVersion !== "string" || !/^[\w.-]{1,128}$/.test(value.keyVersion) ||
    typeof value.publicKey !== "string" || value.publicKey.length > 8192
  ) throw new Error("Relay returned invalid trust material.");
  let publicKey;
  try {
    publicKey = createPublicKey(value.publicKey);
  } catch {
    throw new Error("Relay returned an invalid signing key.");
  }
  if (publicKey.asymmetricKeyType !== "ed25519") throw new Error("Relay returned an unsupported signing key.");
  const digest = createHash("sha256")
    .update(publicKey.export({ type: "spki", format: "der" }))
    .digest("hex");
  if (digest !== expectedFingerprint.toLowerCase()) {
    throw new Error("Relay signing key does not match the operator-approved fingerprint. Deployment stopped before changing your Vercel project.");
  }
  return {
    origin: BETA_RELAY_ORIGIN,
    keyId: value.keyId,
    keyVersion: value.keyVersion,
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}
