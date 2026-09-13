import { agentBrowserRevalidationKey, installAgentBrowser } from "@agent-browser/eve/sandbox";
import { defineSandbox } from "eve/sandbox";
import { vercel } from "eve/sandbox/vercel";

// Pre-install agent-browser (and Chromium) into the sandbox template so
// browser sessions start warm instead of installing on first tool use.
export default defineSandbox({
  backend: vercel({
    resources: { vcpus: 2 },
    networkPolicy: "deny-all",
  }),
  revalidationKey: () => agentBrowserRevalidationKey(),
  async bootstrap({ use }) {
    const sandbox = await use({ networkPolicy: "allow-all" });
    await installAgentBrowser(sandbox);
    await sandbox.setNetworkPolicy("deny-all");
  },
  async onSession({ use }) {
    await use({ networkPolicy: "deny-all" });
  },
});
