import { defineDynamic, defineInstructions } from "eve/instructions";

import { capabilityLabel } from "../../lib/capability-notice.ts";
import { getCapabilityStatuses } from "../../lib/capabilities.ts";
import { ownerName } from "../lib/owner.ts";

export default defineDynamic({
  events: {
    "session.started": () => {
      const unavailable = getCapabilityStatuses().filter(
        (capability) => capability.state !== "ready",
      );
      if (unavailable.length === 0) return null;

      const lines = unavailable.map((capability) => {
        const state = capability.state === "excluded" ? "not included" : "setup required";
        return `- ${capabilityLabel(capability.id)}: ${state}`;
      });

      return defineInstructions({
        markdown: `
## Runtime capability status

The following capabilities are not currently available:
${lines.join("\n")}

Do not claim to have or use an unavailable capability. If it matters to the
request, explain the limitation plainly and direct ${ownerName()} to Manage → System.
Continue with available capabilities whenever they can still complete the job.
        `.trim(),
      });
    },
  },
});
