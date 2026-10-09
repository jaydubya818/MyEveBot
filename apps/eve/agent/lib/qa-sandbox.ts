import { defineSandbox } from "eve/sandbox";
import { computerEnvironment } from "../../lib/computer-sandbox-backend.ts";
import { createWebSessionToken, WEB_SESSION_COOKIE, webAuthConfigStatus } from "../../lib/web-auth.ts";

function deploymentHostname(env: NodeJS.ProcessEnv): string | null {
  const value =
    env.MYEVE_QA_PREVIEW_HOST?.trim() ||
    env.SOFIE_QA_PREVIEW_HOST?.trim() ||
    env.VERCEL_URL?.trim();
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname;
  } catch {
    return null;
  }
}

/**
 * The three QA specialists get a dedicated browser sandbox. During an
 * explicitly enabled Preview self-test, credentials are injected by Vercel's
 * egress proxy and never enter the sandbox process or model context.
 */
export const environment = computerEnvironment;
export default defineSandbox(async () => {
    const hostname = deploymentHostname(process.env);
    const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
    if (
      (process.env.MYEVE_QA_BROKERED_PREVIEW ?? process.env.SOFIE_QA_BROKERED_PREVIEW) !== "1" ||
      hostname === null ||
      !bypassSecret ||
      !webAuthConfigStatus().configured
    ) {
      return environment.open({ networkPolicy: "deny-all" });
    }

    const sessionCookie = `${WEB_SESSION_COOKIE}=${createWebSessionToken()}`;
    return environment.open({
      networkPolicy: {
        allow: {
          [hostname]: [
            {
              transform: [
                {
                  headers: {
                    cookie: sessionCookie,
                    "x-vercel-protection-bypass": bypassSecret,
                  },
                },
              ],
            },
          ],
          "*": [],
        },
      },
    });
});
