import { skillStore } from "@/agent/lib/skill-store";
import { installedSkills } from "@/lib/installed-skills";
import { requireWebAuth } from "@/lib/web-auth";

// Installed and chat-created skills feed the composer's slash-command palette.
// A saved skill with the same name wins because it represents the user's
// explicit customization.
export async function GET(request: Request): Promise<Response> {
  const denied = requireWebAuth(request);
  if (denied) return denied;
  const commands = new Map<string, { name: string; description: string }>(
    installedSkills
      .filter((skill) => skill.userInvocable)
      .map((skill) => [skill.name, { name: skill.name, description: skill.description }]),
  );
  try {
    for (const skill of await skillStore.list()) commands.set(skill.name, skill);
  } catch {
    // Installed skills remain available when personal skill storage is not.
  }
  return Response.json({ commands: [...commands.values()] });
}
