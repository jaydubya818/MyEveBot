import type { ApprovalPolicy } from "eve/tools/approval";

import { defineDynamic,defineTool } from "eve/tools";
import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";

import {
LocalComputerTaskInput,
localComputerConfigured
} from "../lib/effect/local-computer";
import { toolSchema } from "../lib/effect/tool-schema";
import { guestDenial,isGuestResolve } from "../lib/owner-gate";

export const localComputerTaskApproval: ApprovalPolicy = (context) =>
  guestDenial(context) ?? "user-approval";

export default defineDynamic({
  events: {
    "turn.started": (_event, ctx) => {
      if (isGuestResolve(ctx) || !localComputerConfigured()) return null;
      return {
        local_computer_task: defineTool({
          description:
            "Hand one complete task to a vision model controlling the owner's real Mac. After the owner approves the instruction once, it can repeatedly see the main display, click, drag, type, press shortcuts, scroll, wait, and run arbitrary zsh until the task is complete. Use this for GUI work or multi-step local-computer work. The Mac must be awake, unlocked, running Sofie Local, and have Accessibility plus Screen Recording permission.",
          inputSchema: toolSchema(LocalComputerTaskInput),
          approval: localComputerTaskApproval,
          async execute(input, toolContext) {
    return denyUnqualifiedExecutor(toolContext, "tool.local_computer_task");
  },
        }),
      };
    },
  },
});
