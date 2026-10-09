import { withEve } from "eve/next";
import type { NextConfig } from "next";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";

const qaLocalOrigin =
  process.env.MYEVE_QA_LOCAL_ORIGIN?.trim() ?? process.env.SOFIE_QA_LOCAL_ORIGIN?.trim();
const nextConfig: NextConfig = {
  // Local browser automation reaches the dev server over the Mac's LAN IP.
  // Keep the extra origin opt-in so production never inherits a local address.
  allowedDevOrigins: ["127.0.0.1", ...(qaLocalOrigin ? [qaLocalOrigin] : [])],
  // These server-only packages load native binaries at runtime. Bundling them
  // makes Turbopack traverse every platform-specific optional dependency.
  serverExternalPackages: ["@remotion/bundler", "@remotion/renderer", "heif2jpeg"],
};

// Mounts the eve agent (./agent) on this app's origin: one dev server, one
// Vercel deployment. /eve/v1/** routes to the agent service.
// Generated services do not inherit npm's CLI PATH. Resolve the installed CLI,
// as withEve's default does. Our provider prepares metadata without provisioning.
const evePackage = createRequire(join(process.cwd(), "package.json")).resolve("eve/package.json");
const eveCli = relative(process.cwd(), join(dirname(evePackage), "bin/eve.js")).replaceAll("\\", "/");
const quotedEveCli = `'${eveCli.replaceAll("'", "'\\''")}'`;
export default withEve(nextConfig, { eveBuildCommand: `node ${quotedEveCli} build` });
