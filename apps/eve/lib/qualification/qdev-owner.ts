import { digest } from "../engineering/contract.ts";

/**
 * The accounting owner id of a MyEve owner. The hash-pinned qualification accounting ledger keys owners by UUID; a deployment whose MyEve owner id
 * is not a UUID (Jay's hosted production installation uses "owner") is represented there by a stable UUID derived from it. UUID owners are unchanged.
 * Only the accounting policy uses it: Work, agents, journal ids, bundles and all user data stay keyed on the MyEve owner id.
 */
export function qdevAccountingOwnerId(ownerId: string): string {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerId) ? ownerId
    : uuidFromDigest(digest(["myeve.qdev.accounting-owner/v1", ownerId]));
}
/** RFC 4122 shaped (version 5, variant 10) UUID from a digest (same shape as owner-request.ts cohort ids). */
function uuidFromDigest(hex: string): string {
  const b = hex.slice(0, 32).split("");
  b[12] = "5";
  b[16] = ((parseInt(b[16], 16) & 0x3) | 0x8).toString(16);
  const s = b.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}
