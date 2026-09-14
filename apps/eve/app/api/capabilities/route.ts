import {
  CAPABILITY_KINDS,
  findCapabilities,
  getCapabilities,
  type CapabilityAvailability,
  type CapabilityKind,
  type CapabilityRisk,
} from "@/lib/capability-registry";
import { getCapabilityStatuses } from "@/lib/capabilities";
import { requireWebAuth } from "@/lib/web-auth";

export async function GET(request: Request): Promise<Response> {
  const denied = requireWebAuth(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const kindValue = url.searchParams.get("kind");
  const availabilityValue = url.searchParams.get("availability");
  const maxRiskValue = url.searchParams.get("maxRisk");
  const kind = CAPABILITY_KINDS.includes(kindValue as CapabilityKind)
    ? (kindValue as CapabilityKind)
    : undefined;
  const availability = ["available", "unconfigured", "degraded", "disabled", "unavailable"].includes(
    availabilityValue ?? "",
  )
    ? (availabilityValue as CapabilityAvailability)
    : undefined;
  const maxRisk = ["low", "medium", "high", "critical"].includes(maxRiskValue ?? "")
    ? (maxRiskValue as CapabilityRisk)
    : undefined;
  const filters = { kind, availability, maxRisk };
  const registry = query ? findCapabilities(query, filters) : getCapabilities(filters);

  return Response.json(
    { capabilities: getCapabilityStatuses(), registry },
    { headers: { "Cache-Control": "no-store" } },
  );
}
