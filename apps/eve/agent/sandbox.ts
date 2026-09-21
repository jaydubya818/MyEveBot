import { agentBrowserRevalidationKey, installAgentBrowser } from "@agent-browser/eve/sandbox";
import { defineSandbox } from "eve/sandbox";
import { vercel } from "eve/sandbox/vercel";
import { justbash } from "eve/sandbox/just-bash";
import { localOwnerQualification,ownerChannelConfiguration } from "../lib/relay/owner/config.ts";

// Pre-install agent-browser (and Chromium) into the sandbox template so
// browser sessions start warm instead of installing on first tool use.
// Public-read qualification has no sandbox tools. Use Eve's existing local
// virtual filesystem without provisioning browser compute or other credentials.
const localQualification=localOwnerQualification(process.env,ownerChannelConfiguration().trust);
export default localQualification ? defineSandbox({backend:justbash({autoInstall:false})}) : defineSandbox({
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
