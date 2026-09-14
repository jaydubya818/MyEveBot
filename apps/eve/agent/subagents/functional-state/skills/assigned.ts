import { defineDynamic } from "eve/skills";

import { resolveAssignedSkills, skillOwnerId } from "../../../lib/skill-manager";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      resolveAssignedSkills(skillOwnerId(ctx.session.auth), "functional-state"),
  },
});
