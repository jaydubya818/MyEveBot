import { defineDynamic, defineInstructions } from "eve/instructions";

import { BUILTIN_ROLE_CATALOG } from "../../lib/builtin-role-catalog.ts";

export default defineDynamic({
  events: {
    "turn.started": (_event, ctx) => {
      const attributes = ctx.session.auth.current?.attributes ?? {};
      const roleId = typeof attributes.myeveRoleId === "string" ? attributes.myeveRoleId : null;
      if (!roleId) return null;
      if (attributes.myeveAgentId) throw new Error("A Run cannot use a persistent Agent and an on-demand Role at the same time.");
      const role = BUILTIN_ROLE_CATALOG.roles.find((candidate) => candidate.id === roleId);
      if (!role || role.executionMode !== "on-demand") throw new Error("This Role is not available for on-demand use.");

      return defineInstructions({
        markdown: `
## Active on-demand Role: ${role.name}

This Run uses the primary Agent runtime with bounded ${role.name} expertise. It
does not create a persistent Agent, identity, mailbox, memory scope, or grant
new authority.

Purpose: ${role.description}

Responsibilities:
${role.responsibilities.map((item) => `- ${item}`).join("\n")}

Typical inputs:
${(role.typicalInputs ?? []).map((item) => `- ${item}`).join("\n")}

Typical outputs:
${(role.typicalOutputs ?? []).map((item) => `- ${item}`).join("\n")}

Safety boundaries:
${role.boundaries.map((item) => `- ${item}`).join("\n")}

Complete only the owner's bounded assignment in this Role. Use the actual
runtime capabilities and approval policy; recommended capabilities are not
permission grants. Surface missing required inputs before dependent work.
        `.trim(),
      });
    },
  },
});
