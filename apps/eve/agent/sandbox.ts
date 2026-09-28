import { defineSandbox } from "eve/sandbox";
import { JustBashSandbox } from "eve/sandbox/just-bash";
import { computerEnvironment } from "../lib/computer-sandbox-backend.ts";
import { localOwnerQualification, ownerChannelConfiguration } from "../lib/relay/owner/config.ts";

// The expiring loopback fixture exposes no sandbox tools or private context.
const localQualification = localOwnerQualification(process.env, ownerChannelConfiguration().trust);
export const environment = localQualification
  ? JustBashSandbox.environment({ autoInstall: false })
  : computerEnvironment;
export default defineSandbox(() => environment.open());
