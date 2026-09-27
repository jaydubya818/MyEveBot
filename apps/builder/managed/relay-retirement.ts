import { managedDb } from "./db";
import { decryptRelayInvite } from "./invites";

const relayOrigin = "https://relay-sage-nine.vercel.app";
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

/** Read back the exact Relay identity associated with this managed invitation. */
export async function verifyRelayRetirement(inviteId: string | null | undefined): Promise<string> {
  if (!inviteId) throw new Error("Managed Eve has no bound Relay invitation");
  const result = await managedDb().query<{ relay_invite_ciphertext: string | null }>(
    "SELECT relay_invite_ciphertext FROM managed_beta_invites WHERE id=$1 AND claimed_at IS NOT NULL",
    [inviteId],
  );
  const ciphertext = result.rows[0]?.relay_invite_ciphertext;
  if (!ciphertext) throw new Error("Bound Relay invitation is unavailable");
  const invite = new URL(decryptRelayInvite(ciphertext));
  const fragment = new URLSearchParams(invite.hash.slice(1));
  const token = fragment.get("invite");
  if (invite.origin !== relayOrigin || invite.pathname !== "/signup" || invite.search ||
      fragment.size !== 1 || !token || !tokenPattern.test(token)) {
    throw new Error("Bound Relay invitation is invalid");
  }
  const response = await fetch(`${relayOrigin}/api/beta-invites/lifecycle`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({ token }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Relay retirement readback failed");
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 4096) throw new Error("Relay retirement readback was too large");
  const body = await response.text();
  if (body.length > 4096) throw new Error("Relay retirement readback was too large");
  const state: unknown = JSON.parse(body);
  if (!state || typeof state !== "object") throw new Error("Relay retirement readback is invalid");
  const record = state as Record<string, unknown>;
  if (typeof record.invitationId !== "string" || !record.invitationId ||
      record.state !== "ACCEPTED" || typeof record.accountId !== "string" || !record.accountId ||
      record.accountState !== "RETIRED" ||
      ["activeSessions", "activeCredentials", "activeAgentIdentities", "activeDelegations",
        "activeGrants", "pendingInvites", "queuedDeliveries", "publishedKnowledge",
        "privateDataObjects", "unsupportedResources"]
        .some((key) => record[key] !== 0)) {
    throw new Error("Retire the bound account in Relay Settings and verify zero live authority before managed resource deletion");
  }
  return record.accountId;
}
