import { agentBrowserRevalidationKey, installAgentBrowser } from "@agent-browser/eve/sandbox";
import { defineSandbox } from "eve/sandbox";
import { microsandbox } from "eve/sandbox/microsandbox";
import { vercel } from "eve/sandbox/vercel";

import { createWebSessionToken, WEB_SESSION_COOKIE, webAuthConfigStatus } from "../../lib/web-auth.ts";

const isVercelRuntime = Boolean(process.env.VERCEL);
const localChromiumPath = "/ms-playwright/chromium-1187/chrome-linux/chrome";
const localNpmPrefix = "/home/vercel-sandbox/.npm-global";

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
export default defineSandbox({
  backend: isVercelRuntime
    ? vercel({ resources: { vcpus: 2 } })
    : microsandbox({
        image: "mcr.microsoft.com/playwright:v1.55.0-noble",
        cpus: 2,
        memoryMiB: 2048,
        env: {
          AGENT_BROWSER_EXECUTABLE_PATH: localChromiumPath,
          NPM_CONFIG_PREFIX: localNpmPrefix,
          PATH: `${localNpmPrefix}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
        },
      }),
  revalidationKey: () =>
    isVercelRuntime
      ? agentBrowserRevalidationKey()
      : `${agentBrowserRevalidationKey({
          installBrowser: false,
          installSystemDependencies: false,
        })}:playwright-arm64-v1`,
  async bootstrap({ use }) {
    const sandbox = await use();
    if (isVercelRuntime) {
      await installAgentBrowser(sandbox);
      return;
    }

    // Chrome for Testing has no Linux ARM64 build. The official Playwright
    // image supplies a pinned native Chromium; only the small CLI is installed.
    await installAgentBrowser(sandbox, {
      installBrowser: false,
      installSystemDependencies: false,
    });
  },
  async onSession({ use }) {
    const hostname = deploymentHostname(process.env);
    const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
    if (
      (process.env.MYEVE_QA_BROKERED_PREVIEW ?? process.env.SOFIE_QA_BROKERED_PREVIEW) !== "1" ||
      hostname === null ||
      !bypassSecret ||
      !webAuthConfigStatus().configured
    ) {
      await use();
      return;
    }

    const sessionCookie = `${WEB_SESSION_COOKIE}=${createWebSessionToken()}`;
    await use({
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
  },
});
