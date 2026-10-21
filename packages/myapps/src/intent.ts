import { leadCrmSpec, text } from "./contracts.ts";

export const LEAD_CRM_REQUEST =
  "Build me a CRM where I can track leads, their pipeline stage, acquisition spend, notes and follow-ups.";

/** An explicit no-model intent fixture. It proposes inert content and grants no Work authority. */
export function proposeApp(ownerId: string, request: string) {
  text(ownerId);
  text(request, 1000);
  if (request !== LEAD_CRM_REQUEST) return { status: "NO_MATCH" } as const;
  const spec = leadCrmSpec(ownerId);
  return {
    status: "PROPOSED" as const,
    title: "Build my Lead CRM",
    objective: request,
    summary:
      "Track leads, pipeline stages, acquisition spend, notes and follow-ups. You and Sofie use the same information. Review the preview before installing.",
    boundaries:
      "Only this App's CRM data. No email sending, payments, external services, other Apps, files or computer access.",
    skills: spec.skills,
    spec,
  };
}
