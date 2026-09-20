import type { ResolvedCapability } from "./capability-registry.ts";
import type {
  ExecutionDatabase,
  RoutineConfiguration,
} from "./execution-types.ts";
import type { AdmissionReason } from "./routine-admission.ts";

export interface Availability {
  status: "AVAILABLE" | "UNAVAILABLE" | "MISCONFIGURED" | "UNQUALIFIED";
  reasonCode?: AdmissionReason;
  provider?: string;
  safeIdentity?: string;
}
export interface AvailabilityInput {
  ownerId: string;
  agentId: string;
  capability: ResolvedCapability;
  targets: RoutineConfiguration["authority"]["allowedTargets"];
  deliveryChannel: RoutineConfiguration["deliveryChannel"];
}
/** Metadata only. No provider client, secret retrieval, account creation or network call. */
export async function capabilityAvailability(
  input: AvailabilityInput,
  database: ExecutionDatabase,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Availability> {
  const id = input.capability.id;
  const unavailable = (
    reasonCode: AdmissionReason,
    status: Availability["status"] = "UNAVAILABLE",
  ): Availability => ({ status, reasonCode });
  if (id.includes("phone"))
    return unavailable("provider_unqualified", "UNQUALIFIED");
  if (id.includes("federation") || id.includes("relay"))
    return unavailable(
      env.MYEVE_RELAY_ENABLED === "true"
        ? "provider_unqualified"
        : "federation_disabled",
      "UNQUALIFIED",
    );
  if (
    [
      "tool.list_emails",
      "tool.search_emails",
      "tool.read_email",
      "tool.send_email",
    ].includes(id)
  ) {
    const owner = env.MYEVE_OWNER_ID || env.SOFIE_OWNER_ID || "owner";
    if (input.ownerId !== owner) return unavailable("account_missing");
    // Inspect only credential presence, never SELECT its stored value.
    const [table] = await database.query(
      "SELECT to_regclass('app_settings') AS present",
    );
    const [metadata] = table?.present
      ? await database.query(
          "SELECT EXISTS(SELECT 1 FROM app_settings WHERE name='agentmail-api-key' AND length(value)>0) AS configured",
        )
      : [];
    if (!env.AGENTMAIL_API_KEY && metadata?.configured !== true)
      return { ...unavailable("provider_missing"), provider: "agentmail" };
    // An API credential or a pinned inbox name does not establish authenticated health.
    // No durable, owner-scoped authenticated-account/qualification metadata exists yet.
    return { ...unavailable("account_missing"), provider: "agentmail" };
  }
  if (id === "notification.send") {
    if (input.deliveryChannel === "in_app")
      return { status: "AVAILABLE", provider: "in_app" };
    if (input.deliveryChannel === "push")
      return unavailable("provider_unqualified", "UNQUALIFIED");
    const owner = env.MYEVE_OWNER_ID || env.SOFIE_OWNER_ID || "owner";
    if (
      input.ownerId !== owner ||
      !env.TELEGRAM_BOT_TOKEN ||
      !env.TELEGRAM_PROACTIVE_CHAT_ID
    )
      return unavailable("provider_missing");
    return unavailable("provider_unqualified", "UNQUALIFIED");
  }
  if (id.startsWith("browser.") || id.startsWith("computer.")) {
    const profile = input.targets[0]?.resource;
    if (profile) {
      const [row] = await database.query(
        `SELECT p.status, (p.agent_id=$3 OR EXISTS(SELECT 1 FROM persistent_browser_profile_grants g WHERE g.owner_id=p.owner_id AND g.profile_id=p.id AND g.agent_id=$3 AND g.revoked_at IS NULL)) AS granted FROM persistent_browser_profiles p WHERE p.owner_id=$1 AND p.id=$2`,
        [input.ownerId, profile, input.agentId],
      );
      if (!row) return unavailable("account_missing");
      if (!row.granted)
        return unavailable("profile_grant_missing", "MISCONFIGURED");
      if (row.status !== "ready") return unavailable("account_missing");
    } else return unavailable("account_missing");
    return unavailable("provider_unqualified", "UNQUALIFIED");
  }
  if (
    id === "integration.composio" ||
    id.includes("imessage") ||
    id.startsWith("channel.")
  )
    return unavailable("provider_unqualified", "UNQUALIFIED");
  if (input.targets.some((t) => !["myeve", "local"].includes(t.provider)))
    return unavailable("provider_missing");
  return input.capability.availability.status === "available"
    ? { status: "AVAILABLE" }
    : unavailable("dependency_unavailable");
}
