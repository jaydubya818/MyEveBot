import { digest } from "../engineering/contract.ts";
import type { ExternalAlphaPolicy } from "./policy.ts";
import { sharedAlphaAccounting, type AlphaAccountingDatabase } from "./shared-accounting.ts";
import { alphaChatUsageSchema } from "./usage-contract.ts";

/** Exact central reservations, with separately labeled local measured usage.
 * Neither a failed read nor low measured cost can restore paid authority. */
export async function readAlphaChatUsage(database: AlphaAccountingDatabase, policy: ExternalAlphaPolicy) {
  const sha = digest(policy);
  const [local] = await database.query(`SELECT p.activated_at,p.revoked_at FROM external_alpha_policy p
    JOIN external_alpha_chat_only n ON n.owner_id=p.owner_id AND n.policy_sha256=p.policy_sha256
    WHERE p.singleton AND n.singleton AND p.owner_id=$1 AND p.policy_sha256=$2`, [policy.ownerId, sha]);
  if (!local) throw Error("EXTERNAL_ALPHA_USAGE_BINDING_REQUIRED");
  const central = await sharedAlphaAccounting(database).status(policy);
  const [measured] = await database.query(`SELECT
    COALESCE(sum(o.spent_microusd) FILTER(WHERE o.state='SETTLED' AND a.day_index=$3),0) AS daily,
    COALESCE(sum(o.spent_microusd) FILTER(WHERE o.state='SETTLED'),0) AS trial,
    count(*) FILTER(WHERE o.state IN('PREPARED','DISPATCHED','UNKNOWN')) AS unsettled
    FROM external_alpha_allowance a JOIN external_alpha_operation o ON o.allowance_id=a.id
    WHERE a.owner_id=$1 AND a.policy_sha256=$2 AND a.kind='CHAT' AND o.source='SOFIE'`, [policy.ownerId, sha, central.dayIndex]);
  const [fence] = await database.query(`SELECT EXISTS(SELECT 1 FROM external_alpha_allowance
    WHERE owner_id=$1 AND policy_sha256=$2 AND state='UNKNOWN') OR EXISTS(
    SELECT 1 FROM external_alpha_tool_effect WHERE state IN('ACCEPTED','UNKNOWN')) AS paused`, [policy.ownerId, sha]);
  const now = Date.parse(central.checkedAt);
  const activation = local.activated_at ? new Date(local.activated_at as string).getTime() : NaN;
  const localExpiry = activation + 120*3600000;
  const state = local.revoked_at || central.state === "revoked" ? "revoked"
    : !Number.isFinite(activation) || now<activation || central.state === "inactive" ? "inactive"
    : now>=localExpiry || central.state === "expired" ? "expired" : central.state;
  const expiresAt = central.expiresAt && Number.isFinite(localExpiry)
    ? new Date(Math.min(localExpiry, Date.parse(central.expiresAt))).toISOString() : null;
  const activatedAt = central.activatedAt && Number.isFinite(activation)
    ? new Date(Math.max(activation, Date.parse(central.activatedAt))).toISOString() : null;
  return alphaChatUsageSchema.parse({ ...central, state, activatedAt, expiresAt,
    localPaused: fence?.paused === true,
    measured: { dailyMicrousd: Number(measured?.daily), trialMicrousd: Number(measured?.trial), unsettledOperations: Number(measured?.unsettled) },
  });
}
