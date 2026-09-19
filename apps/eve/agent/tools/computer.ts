import { defineDynamic,defineTool } from "eve/tools";
import { z } from "zod";
import { denyUnqualifiedExecutor } from "../lib/unqualified-executor.ts";

import { resolveBrowserProfile,touchBrowserProfile,type BrowserProfileView } from "../../lib/browser-profiles.ts";
import { computerAgent,computerOwnerId } from "../lib/computer-context.ts";
import { orgoConfigured,orgoForProfile } from "../lib/orgo";
import { ownerName } from "../lib/owner";
import { isGuestResolve } from "../lib/owner-gate";

// A persistent cloud desktop (Orgo) the agent can actually use: a Linux VM with
// a display, a browser, and a shell that keeps its disk between conversations.
//
// Registered dynamically so a deployment without ORGO_API_KEY advertises none
// of it — every tool schema ships with every model call, and four dead tools
// plus instructions for a computer that isn't there is worse than nothing.
//
// Resolved on turn.started, not session.started, on purpose. A session
// resolves its dynamic tools once and replays them for the rest of its life,
// so with session.started an old thread never notices a key pasted in the UI
// after it began — and in `next dev`, where the executor registration lives
// in process memory, a server restart strands every open thread without its
// computer (the "references step function … which is not registered" skips).
// Re-resolving each turn keeps the tool set current and self-heals both.
//
// Two ways in, because they have different costs:
//   - computer_task pays a vision model to look at the screen and act, which is
//     the only way anything graphical gets done (eve tool results are text, so
//     a screenshot can never reach our own model as an image), and
//   - computer_bash is one HTTP call with no model in the loop, which is both
//     cheaper and exact for anything a shell can do.

const MAX_OUTPUT_CHARS = 20_000;

function profileDescriptor(profile: BrowserProfileView) {
  return { slug: profile.agentSlug, isPrimary: profile.agentIsPrimary, generation: profile.generation };
}

async function desktopFor(ctx: Parameters<typeof computerAgent>[0], profileId?: string, allowBlocked = false) {
  const ownerId = computerOwnerId(ctx);
  const agent = await computerAgent(ctx);
  if (!agent) throw new Error("The current runtime is not attributed to an Agent.");
  const profile = await resolveBrowserProfile(ownerId, agent, profileId);
  if (!allowBlocked && profile.status !== "ready") {
    throw new Error(
      profile.status === "takeover_required"
        ? "This browser profile is paused for owner takeover. Wait for the owner to finish and resume it."
        : profile.status === "reconnect_required"
          ? "This browser profile needs the owner to reconnect its account before more work can run."
          : "This browser profile is unavailable.",
    );
  }
  await touchBrowserProfile(ownerId, profile.id);
  return { ownerId, profile, desktop: orgoForProfile(profileDescriptor(profile)) };
}

const profileIdSchema = z.string().startsWith("browser_profile_").optional().describe(
  "A profile explicitly shared with this Agent. Omit to use the Agent's own isolated profile.",
);

function truncate(output: string): { output: string; truncated: boolean } {
  if (output.length <= MAX_OUTPUT_CHARS) return { output, truncated: false };
  return { output: `${output.slice(0, MAX_OUTPUT_CHARS)}\n…[truncated]`, truncated: true };
}

export default defineDynamic({
  events: {
    "turn.started": async (_event, ctx) => {
      // Guests in iMessage group chats never see the computer at all —
      // resolver-level gating, stronger than an approval denial.
      if (isGuestResolve(ctx)) return null;
      if (!(await orgoConfigured())) return null;
      const owner = ownerName();

      return {
        computer_task: defineTool({
          description:
            "Do something on your cloud desktop that needs eyes on the screen: open apps, click through a site, fill a form, read what is displayed. A computer-use model takes the screen, acts, and repeats until your instruction is done, then reports back. Write the instruction like you would for a capable person seeing the desktop for the first time: the goal, anything it needs to know, and what to report. Prefer computer_bash for anything a shell can do; it is far cheaper. The desktop is provisioned on first use and keeps its files, logins, and installed apps.",
          inputSchema: z.object({
            instruction: z
              .string()
              .min(1)
              .describe(
                'What to accomplish on the desktop, e.g. "Open Firefox, go to news.ycombinator.com, and tell me the top three story titles."',
              ),
            continue_thread_id: z
              .string()
              .optional()
              .describe(
                "threadId from an earlier computer_task, to continue that session with its full context. Use this to resume a task that stopped early or to build on what it just did.",
              ),
            model: z
              .enum(["opus", "sonnet", "opus-4.6", "haiku"])
              .optional()
              .describe(
                "Override the owner's configured desktop model for this task only. Omit it normally; use opus for especially long or fiddly tasks, sonnet for balanced work, or haiku for simple tasks.",
              ),
            max_steps: z
              .number()
              .int()
              .min(1)
              .max(150)
              .optional()
              .describe("Cap on screenshot-and-act cycles. Raise it for multi-stage work."),
            persistent_profile_id: profileIdSchema,
          }),
          async execute({ instruction, continue_thread_id, model, max_steps, persistent_profile_id }, ctx) {
    return denyUnqualifiedExecutor(ctx, "tool.computer");
  },
        }),

        computer_bash: defineTool({
          description:
            "Run a bash command on your cloud desktop and get its output. This is the cheap, exact path: files, installs (apt/pip/npm), git, curl, scripts, launching an app on the desktop's display. No screen involved, so use computer_task when you need to see what happened. Python: run `python3 -c '…'`.",
          inputSchema: z.object({
            command: z.string().min(1).describe("Bash command, e.g. `ls -la ~ && free -h`."),
            timeout_seconds: z
              .number()
              .int()
              .min(1)
              .max(600)
              .optional()
              .describe("Kill the command after this long. Use it for anything slow."),
            persistent_profile_id: profileIdSchema,
          }),
          async execute({ command, timeout_seconds, persistent_profile_id }, ctx) {
    return denyUnqualifiedExecutor(ctx, "tool.computer");
  },
        }),

        computer_screenshot: defineTool({
          description: `Capture the cloud desktop's screen to show ${owner}. You cannot see the image yourself. When the result has an imageUrl, hand it to ${owner} as a markdown image; when the screenshot was already displayed inline, just refer to it. To have something on screen read or acted on, use computer_task instead.`,
          inputSchema: z.object({ persistent_profile_id: profileIdSchema }),
          async execute({ persistent_profile_id }, ctx) {
    return denyUnqualifiedExecutor(ctx, "tool.computer");
  },
          toModelOutput(output) {
            const { imageDataUrl, ...rest } = output as { imageDataUrl?: string } & Record<
              string,
              unknown
            >;
            if (imageDataUrl === undefined) return { type: "json", value: rest };
            return {
              type: "json",
              value: {
                ...rest,
                screenshot: `Captured, and the chat already shows it to ${owner} right above your reply. Do not embed an image or a link for it - just refer to it in words. You cannot see it yourself.`,
              },
            };
          },
        }),

        computer_control: defineTool({
          description:
            "Check or change the cloud desktop itself: current status, its live view URL (the owner can watch and take over there), and start / stop / restart. Stopping keeps the disk, so files and logins survive. You do not need this before other computer tools - they start the desktop on their own.",
          inputSchema: z.object({
            action: z
              .enum(["status", "start", "stop", "restart", "request_takeover", "authentication_failed"])
              .describe(
                "status and stop/restart never provision a desktop; start creates one if there is none.",
              ),
            persistent_profile_id: profileIdSchema,
            reason: z.string().min(1).max(500).optional().describe("Why owner takeover or reconnection is required."),
          }),
          async execute({ action, persistent_profile_id, reason }, ctx) {
    return denyUnqualifiedExecutor(ctx, "tool.computer");
  },
        }),
      };
    },
  },
});
