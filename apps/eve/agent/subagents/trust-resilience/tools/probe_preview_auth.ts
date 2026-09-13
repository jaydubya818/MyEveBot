import { defineTool } from "eve/tools";
import { z } from "zod";

import { WEB_SESSION_COOKIE } from "../../../../lib/web-auth.ts";

function expectedPreviewHostname(): string | null {
  const value =
    process.env.MYEVE_QA_PREVIEW_HOST?.trim() ?? process.env.SOFIE_QA_PREVIEW_HOST?.trim();
  if (!value) return null;
  return new URL(value.includes("://") ? value : `https://${value}`).hostname;
}

async function probe(url: URL, cookie?: string) {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!bypass) throw new Error("The temporary Preview protection broker is unavailable.");
  const response = await fetch(new URL("/api/task-runs", url), {
    redirect: "manual",
    headers: {
      "x-vercel-protection-bypass": bypass,
      ...(cookie ? { cookie } : {}),
    },
  });
  const location = response.headers.get("location");
  return {
    status: response.status,
    redirectedToLogin: location?.includes("/login") ?? false,
    returnedOwnerData: response.ok,
  };
}

export default defineTool({
  description:
    "Probe the approved Preview owner boundary without exposing the brokered Vercel secret. Checks both missing and tampered personal-agent session cookies and returns only status metadata.",
  inputSchema: z.object({ previewUrl: z.string().url() }),
  async execute(input) {
    const url = new URL(input.previewUrl);
    if (url.protocol !== "https:" || url.hostname !== expectedPreviewHostname()) {
      throw new Error("Only the approved isolated Preview hostname can be probed.");
    }
    return {
      unauthenticated: await probe(url),
      tamperedSession: await probe(url, `${WEB_SESSION_COOKIE}=invalid`),
    };
  },
});
