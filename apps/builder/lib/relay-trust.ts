import { createHash, createPublicKey } from "node:crypto";
import { isIP } from "node:net";

// The operator configures one public Relay origin for this Builder deployment.
// The wizard never accepts a caller-provided URL.
function betaRelayOrigin(input: string | undefined): string {
  if (!input) throw new Error("Builder Relay origin is not configured.");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Builder Relay origin must be an exact public HTTPS origin.");
  }
  if (
    url.protocol !== "https:" || url.origin !== input || url.username || url.password ||
    isIP(url.hostname) !== 0 || url.hostname === "localhost" ||
    url.hostname.endsWith(".local") || url.hostname.endsWith(".internal")
  ) throw new Error("Builder Relay origin must be an exact public HTTPS origin.");
  return url.origin;
}

export interface ResolvedRelayTrust {
  origin: string;
  keyId: string;
  keyVersion: string;
  publicKey: string;
}

export async function resolveBetaRelayTrust(
  expectedFingerprint: string,
  fetcher: typeof fetch = fetch,
  configuredOrigin: string | undefined = process.env.BUILDER_RELAY_ORIGIN,
): Promise<ResolvedRelayTrust> {
  if (!/^[a-f0-9]{64}$/i.test(expectedFingerprint)) {
    throw new Error("Enter the Relay signing-key fingerprint supplied by the operator.");
  }
  const origin = betaRelayOrigin(configuredOrigin);
  let response: Response;
  try {
    response = await fetcher(`${origin}/api/federation/trust`, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error("Relay pairing is unavailable. The operator must make its trust endpoint public before beta setup.");
  }
  if (!response.ok) throw new Error("Relay pairing is unavailable. Try again after the operator enables beta federation.");
  const body = await response.text();
  if (body.length > 16384) throw new Error("Relay returned oversized trust material.");
  const parsed: unknown = JSON.parse(body);
  if (!parsed || typeof parsed !== "object") throw new Error("Relay returned invalid trust material.");
  const value = parsed as Record<string, unknown>;
  if (
    value.origin !== origin ||
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
    origin,
    keyId: value.keyId,
    keyVersion: value.keyVersion,
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}
